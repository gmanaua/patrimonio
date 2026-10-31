// Weekly time-weighted return of the invested portfolio (no cash) before the first CARTERA week,
// rebuilt day by day from every PP transaction + Yahoo Finance closes. Output holds percentages only.
// Ported from vela-capital/herramientas/historico.js.

/* PP asset name -> [Yahoo symbol, currency]. If you buy something new before HASTA, add it here. */
const SIMBOLOS = {
  'ISHARES CORE MSCI WORLD': ['IWDA.AS', 'EUR'], 'NVIDIA CORP': ['NVD.DE', 'EUR'], 'VANG FTSE HDY USDA': ['VGWE.DE', 'EUR'],
  'ISHARES PHYSICAL GOLD ETC': ['PPFB.DE', 'EUR'], 'REPSOL SA': ['REP.MC', 'EUR'], 'CAIXABANK SA': ['CABK.MC', 'EUR'],
  'BANCO DE SABADELL SA': ['SAB.MC', 'EUR'], 'ISHARES NASDAQ 100 USD ACC': ['SXRV.DE', 'EUR'], 'LYXOR CORE EURSTX 600 DR': ['MEUD.PA', 'EUR'],
  'UBER TECHNOLOGIES INC': ['UT8.DE', 'EUR'], 'Bitcoin': ['BTC-EUR', 'EUR'], 'ISHARES MSCI EM ACC': ['IEMA.AS', 'EUR'],
  'ISHARES MSCI CHINA USD ACC': ['ICGA.DE', 'EUR'], 'AMPER SA': ['AMP.MC', 'EUR'], 'NUEVA EXPRESION TEXTIL SA': ['NXT.MC', 'EUR'],
  'OBRASCON HUARTE LAIN S.A.': ['OHLA.MC', 'EUR'], 'ONDAS INC': ['ONDS', 'USD'], 'SATELLOGIC INC-A': ['SATL', 'USD'],
  'MyInvestor Value': ['0P0001T8V7.F', 'EUR'], 'Cobas International Fund-P Acc EUR': ['0P0001A94B.F', 'EUR'], 'Robeco Smart Energy': ['LU2145461757.SG', 'EUR'],
  'iShares US Equity Index Fund clase S': ['0P0001XF42.F', 'EUR'], 'iShares Developed World ESG Screened Index Fund (IE) D Acc EUR': ['0P0001XF41.F', 'EUR'],
  'iShares Emerging Markets Index Fund (IE) S Acc EUR': ['0P0001XF3Z.F', 'EUR'], 'Fidelity MSCI Japan Index Fund P-ACC-EUR': ['0P0001CLDI.F', 'EUR'],
  'Fidelity MSCI Europe Index Fund P-ACC-EUR': ['0P0001CJGN.F', 'EUR'], 'Vanguard US Equity Index Fund EUR Hedged': ['0P00006TV8.F', 'EUR'],
  'Fidelity MSCI Pacific ex Japan': ['FEP0.MU', 'EUR'],
};

const num = (s) => (s === '' || s == null ? 0 : Number(String(s).replace(/\./g, '').replace(',', '.')));
const utc = (s) => new Date(s + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
// last close on or before the date
const en = (serie, f) => { let v = null; if (serie) for (const [d, p] of serie) { if (d <= f) v = p; else break; } return v; };

// csvText: PP "Todas las transacciones" export; hasta: first CARTERA date (where both series join)
async function build(csvText, hasta) {
  const ops = csvText.replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map((l) => {
    const c = l.split(';');
    return {fecha: c[0].slice(0, 10), tipo: c[1], activo: (c[2] || '').replace(/"/g, '').trim(), tit: num(c[3]), precio: num(c[4]), neto: num(c[8])};
  }).filter((o) => o.activo && /^(Compra|Venta|Dividendo)$/.test(o.tipo) && o.fecha <= hasta).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  if (!ops.length) throw new Error('El CSV no tiene operaciones antes de ' + hasta);
  const desde = ops[0].fecha;

  async function cierres(simbolo) {
    const p1 = Math.floor(utc(desde) / 1000) - 12 * 86400, p2 = Math.floor(utc(hasta) / 1000) + 3 * 86400;
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&period1=${p1}&period2=${p2}`, {headers: {'User-Agent': 'Mozilla/5.0'}});
      const r = (await res.json()).chart.result[0];
      return r.timestamp.map((t, i) => [iso(new Date(t * 1000)), r.indicators.quote[0].close[i]]).filter((p) => typeof p[1] === 'number');
    } catch { return null; }
  }

  const activos = [...new Set(ops.map((o) => o.activo))];
  const px = {}, avisos = [];
  const fx = await cierres('EURUSD=X');
  if (!fx) throw new Error('Yahoo Finance no responde'); // offline: keep the previous history rather than one priced at trade prices
  for (const a of activos) {
    px[a] = SIMBOLOS[a] ? await cierres(SIMBOLOS[a][0]) : null;
    if (!px[a]) avisos.push(`sin cotizaciones para "${a}", valorado al precio de su última operación`);
  }
  const precio = (a, f) => {
    let p = en(px[a], f);
    if (p != null && SIMBOLOS[a][1] === 'USD') p /= en(fx, f);
    if (p == null) { const o = ops.filter((x) => x.activo === a && x.fecha <= f && x.precio).pop(); p = o ? o.precio : 0; }
    return p;
  };

  // Day return = (end value + sales + dividends) / (start value + purchases) - 1
  const tit = {};
  let vPrev = 0, acum = 1;
  const acumEn = new Map();
  for (let d = utc(desde); iso(d) <= hasta; d = new Date(d.getTime() + 864e5)) {
    const f = iso(d);
    let compras = 0, ventas = 0;
    for (const o of ops) {
      if (o.fecha !== f) continue;
      if (o.tipo === 'Compra') { tit[o.activo] = (tit[o.activo] || 0) + o.tit; compras += o.neto; }
      else if (o.tipo === 'Venta') { tit[o.activo] = (tit[o.activo] || 0) - o.tit; if (Math.abs(tit[o.activo]) < 1e-6) delete tit[o.activo]; ventas += o.neto; }
      else ventas += o.neto; // dividend leaves as cash but counts as return
    }
    const v = Object.keys(tit).reduce((s, a) => s + tit[a] * precio(a, f), 0);
    const r = vPrev + compras > 0 ? (v + ventas) / (vPrev + compras) - 1 : 0;
    if (f > desde) acum *= 1 + r;
    acumEn.set(f, acum);
    vPrev = v;
  }

  // Start day, then every Friday, then the join date
  const fechas = [desde];
  for (let d = new Date(utc(desde).getTime() + 864e5); iso(d) <= hasta; d = new Date(d.getTime() + 864e5)) if (d.getUTCDay() === 5) fechas.push(iso(d));
  if (fechas[fechas.length - 1] !== hasta) fechas.push(hasta);
  const red = (x) => Math.round(x * 1e6) / 1e6;
  return {
    out: {fuente: 'Operaciones de Portfolio Performance y cierres de Yahoo Finance', desde, hasta,
      cartera: fechas.map((f, i) => ({fecha: f, r: red(i ? acumEn.get(f) / acumEn.get(fechas[i - 1]) - 1 : 0)}))},
    avisos,
  };
}

module.exports = {build};
