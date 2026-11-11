// Prepares the material for the wealth statement: screenshots of the dashboard views and a data summary.
//   node informe.js semanal|mensual        -> informes/AAAA-MM-DD-<tipo>/{*.png, resumen.json}
// It serves this folder on localhost, opens the page in headless Edge, unlocks it with clave.txt (locally,
// nothing is sent anywhere) and reads the decrypted model straight from the page, so the figures always match
// the dashboard. The informes/ folder is git-ignored: it holds your real amounts.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), {spawn} = require('child_process');

const TIPO = process.argv[2] === 'mensual' ? 'mensual' : 'semanal';
const ROOT = __dirname;
const hoy = new Date(), iso = d => d.toISOString().slice(0, 10);
const OUT = path.join(ROOT, 'informes', `${iso(hoy)}-${TIPO}`);
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- tiny static server for this folder (localhost only) ----
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'};
function serve() {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || rel.startsWith('informes') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end() }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ---- minimal Chrome DevTools Protocol client over Node's built-in WebSocket ----
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl), pending = new Map(); let id = 0;
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko });
  ws.onmessage = e => {
    const m = JSON.parse(e.data), p = pending.get(m.id); if (!p) return;
    pending.delete(m.id); m.error ? p.ko(new Error(m.error.message)) : p.ok(m.result);
  };
  const send = (method, params = {}) => new Promise((ok, ko) => { pending.set(++id, {ok, ko}); ws.send(JSON.stringify({id, method, params})) });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return {send, evaluate, close: () => ws.close()};
}

async function until(fn, what, ms = 60000) {
  const t0 = Date.now();
  for (;;) { try { if (await fn()) return } catch {} if (Date.now() - t0 > ms) throw new Error('Tiempo agotado esperando ' + what); await sleep(400) }
}

async function main() {
  if (!EDGE) throw new Error('No encuentro Microsoft Edge');
  const password = fs.readFileSync(path.join(ROOT, 'clave.txt'), 'utf8').trim();
  fs.mkdirSync(OUT, {recursive: true});
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const port = 9300 + Math.floor(Math.random() * 500), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-edge-'));
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--window-size=1200,900', 'about:blank'], {stdio: 'ignore'});
  let page;
  try {
    let target;
    await until(async () => (target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')), 'Edge');
    page = await cdp(target.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {width: 1200, height: 900, deviceScaleFactor: 1.5, mobile: false});
    await page.send('Page.navigate', {url: base});
    await until(() => page.evaluate('document.readyState === "complete"'), 'la página');
    // light theme, euros visible, then unlock with the local password (same storage the page itself uses)
    await page.evaluate(`localStorage.setItem('patrimonio-clave', ${JSON.stringify(password)}); localStorage.setItem('patrimonio-tema', 'light'); localStorage.setItem('patrimonio-ocultar', '0'); true`);
    await page.send('Page.reload', {ignoreCache: true});
    await until(() => page.evaluate('typeof model !== "undefined" && !!model && !document.getElementById("app").hidden'), 'los datos (¿clave correcta?)', 90000);

    // ---- screenshots: each view on its own, full width ----
    const views = TIPO === 'mensual' ? ['patrimonio', 'rendimiento', 'posiciones', 'flujos', 'plan'] : ['patrimonio', 'rendimiento', 'posiciones', 'flujos'];
    const imagenes = [];
    for (const v of views) {
      await page.evaluate(`location.hash = ${JSON.stringify(v)}; true`);
      await sleep(v === 'flujos' ? 3500 : 1800); // the world map loads its shapes from the CDN
      const r = await page.evaluate(`(() => { const b = document.getElementById('app').getBoundingClientRect(); return {x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height} })()`);
      const shot = await page.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true, clip: {x: r.x, y: r.y, width: r.w, height: r.h, scale: 1}});
      fs.writeFileSync(path.join(OUT, `${v}.png`), Buffer.from(shot.data, 'base64'));
      imagenes.push(`${v}.png`);
    }

    // ---- data summary, computed from the same model the page draws ----
    const resumen = await page.evaluate(`(() => {
      // The Excel already carries the current week's row (dated this Friday) with today's total, so changes compare
      // today's total with the last weekly row at least N days old, not with the sheet's last row.
      const m = model, w = m.weekly, pat = m.pat, now = Date.now(), d10 = d => d.toISOString().slice(0, 10);
      const all = m.blocks.flatMap(b => b.pos.map(p => ({...p, block: b.name})));
      const back = days => { const t = now - days * 864e5; let p = pat[0]; for (const q of pat) if (q.d <= t) p = q; return p };
      const chain = days => { const t = now - days * 864e5; return w.filter(p => p.d > t && p.d <= now).reduce((g, p) => g * (1 + p.r), 1) - 1 };
      const net = from => (txs || []).filter(t => t.date > from && (t.type === 'Depósito' || t.type === 'Retirada')).reduce((s, t) => s + (t.type === 'Depósito' ? t.net : -t.net), 0);
      const sem = back(7), mes = back(30);
      return {
        fecha: new Date().toISOString(), datos_de: dataTime && dataTime.toISOString(),
        patrimonio: {total: m.total, liquidez: m.cash, invertido: m.invested,
          referencia_7d: {fecha: d10(sem.d), valor: sem.v}, cambio_7d: m.total - sem.v, cambio_7d_pct: m.total / sem.v - 1,
          referencia_30d: {fecha: d10(mes.d), valor: mes.v}, cambio_30d: m.total - mes.v, cambio_30d_pct: m.total / mes.v - 1,
          aportaciones_7d: net(new Date(now - 7 * 864e5)), aportaciones_30d: net(new Date(now - 30 * 864e5)),
          nota_aportaciones: txs ? 'del CSV de movimientos' : 'sin CSV de movimientos: aportaciones desconocidas'},
        rentabilidad: {twr_total: w.at(-1).g - 1, desde: d10(w[0].d), semana: chain(7), mes: chain(30), ytd: chain((now - new Date(new Date().getFullYear(), 0, 1)) / 864e5)},
        reparto_tipo: m.mix, brokers: m.brokers,
        posiciones: all.sort((a, b) => b.value - a.value).map(p => ({nombre: p.name, ticker: ticker(p), bloque: p.block, broker: clasif(p, 4), tipo: clasif(p, 0), region: clasif(p, 1),
          valor: p.value, peso: p.weight, coste: p.cost, pnl: p.pnl, rentabilidad: p.ret})),
        plan: PLAN, objetivos: 'Núcleo indexado 50 %, gestión activa 22,5 %, emergentes y China ~10 % (sin aportar), acciones 10 % (máx. 12 %), oro 7,5 %',
      };
    })()`);
    // change of each position since the previous statement (any type), so "this week's movers" is real and not
    // just the return since purchase. Buys/sales in between also move the value; the return change (pp) does not.
    const prev = fs.readdirSync(path.join(ROOT, 'informes')).filter(d => d < path.basename(OUT) && fs.existsSync(path.join(ROOT, 'informes', d, 'resumen.json'))).sort().at(-1);
    if (prev) {
      const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'informes', prev, 'resumen.json'), 'utf8'));
      resumen.anterior = {informe: prev, total: old.patrimonio.total};
      for (const p of resumen.posiciones) {
        const o = old.posiciones.find(q => q.nombre === p.nombre);
        if (o) p.desde_anterior = {valor: p.valor - o.valor, rentabilidad_pp: (p.rentabilidad - o.rentabilidad) * 100};
      }
    }
    fs.writeFileSync(path.join(OUT, 'resumen.json'), JSON.stringify({tipo: TIPO, imagenes, ...resumen}, null, 2));
    console.log(OUT);
  } finally {
    page?.close(); edge.kill(); srv.close();
    await sleep(500); try { fs.rmSync(profile, {recursive: true, force: true}) } catch {}
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1) });
