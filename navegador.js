// Headless Microsoft Edge driven over the Chrome DevTools Protocol, with nothing to install:
// Node's built-in WebSocket talks to Edge's debugging port. Used by informe.js (screenshots) and enviar.js (PDF).
const fs = require('fs'), path = require('path'), os = require('os'), {spawn} = require('child_process');

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function until(fn, what, ms = 60000) {
  const t0 = Date.now();
  for (;;) { try { if (await fn()) return } catch {} if (Date.now() - t0 > ms) throw new Error('Tiempo agotado esperando ' + what); await sleep(400) }
}

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

// Runs fn(page) in a fresh headless Edge with a throwaway profile, and always cleans up.
async function conEdge(fn) {
  if (!EDGE) throw new Error('No encuentro Microsoft Edge');
  const port = 9300 + Math.floor(Math.random() * 500), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-edge-'));
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--window-size=1200,900', 'about:blank'], {stdio: 'ignore'});
  let page;
  try {
    let target;
    await until(async () => (target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')), 'Edge');
    page = await cdp(target.webSocketDebuggerUrl);
    await page.send('Page.enable');
    return await fn(page);
  } finally {
    page?.close(); edge.kill();
    await sleep(500); try { fs.rmSync(profile, {recursive: true, force: true}) } catch {}
  }
}

module.exports = {conEdge, until, sleep};
