// Daily closing prices for every holding, written as precios.json (public market data only: no quantities, no euros held).
// Funds: official NAV from the Financial Times; ETFs, stocks and EUR/USD: Yahoo Finance.
// Run by .github/workflows/precios.yml; a price that fails to download keeps its previous value from the file passed as argv[2].
//   node precios.js [anterior.json] > precios.json
const fs = require('fs');

// key -> [source, id]; the dashboard maps each position to these keys (LEGS in index.html)
const ACTIVOS = {
  'IE00BFZMJT78': ['ft', 'IE00BFZMJT78:EUR'], // Neuberger Berman Short Duration Euro Bond I Acc
  'IE00BYX5NX33': ['ft', 'IE00BYX5NX33:EUR'], // Fidelity MSCI World Index P Acc EUR
  'ES0165243025': ['ft', 'ES0165243025:EUR'], // MyInvestor Value C
  'LU1598719752': ['ft', 'LU1598719752:EUR'], // Cobas International P Acc EUR
  // Roboadvisor
  'IE000N4ZYX28': ['ft', 'IE000N4ZYX28:EUR'], // iShares US Index S Acc EUR
  'IE000N51F726': ['ft', 'IE000N51F726:EUR'], // iShares Developed World Screened Index D Acc EUR
  'IE000QAZP7L2': ['ft', 'IE000QAZP7L2:EUR'], // iShares Emerging Markets Index S Acc EUR
  'IE00BYX5N771': ['ft', 'IE00BYX5N771:EUR'], // Fidelity MSCI Japan Index P Acc EUR
  'IE00BYX5MD61': ['ft', 'IE00BYX5MD61:EUR'], // Fidelity MSCI Europe Index P Acc EUR
  'IE00B1G3DH73': ['ft', 'IE00B1G3DH73:EUR'], // Vanguard U.S. 500 Stock Index EUR Hedged Acc
  'IE00BDZVHT63': ['ft', 'IE00BDZVHT63:USD'], // Fidelity MSCI Pacific ex Japan Index P Acc (shortcut: USD class converted, no EUR class on FT)
  // ETFs (Xetra, EUR) and stocks
  'EUNM.DE': ['yahoo', 'EUNM.DE'], 'ICGA.DE': ['yahoo', 'ICGA.DE'],
  'NVDA': ['yahoo', 'NVDA'], 'IREN': ['yahoo', 'IREN'], 'UBER': ['yahoo', 'UBER'], 'LAC': ['yahoo', 'LAC'],
  'BN': ['yahoo', 'BN'], 'NFLX': ['yahoo', 'NFLX'], 'NXT.MC': ['yahoo', 'NXT.MC'],
};

const UA = {headers: {'User-Agent': 'Mozilla/5.0'}};
const iso = d => d.toISOString().slice(0, 10);

// last close of the daily series (today's bar counts only once its market has closed: chart meta says so via currentTradingPeriod)
async function yahoo(sym) {
  const j = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10d&interval=1d`, UA).then(r => r.json());
  const r = j.chart.result[0], c = r.indicators.quote[0].close, now = Date.now() / 1000;
  const open = now < r.meta.currentTradingPeriod.regular.end && now > r.meta.currentTradingPeriod.regular.start;
  let i = c.length - 1;
  while (i >= 0 && (c[i] == null || (open && i === c.length - 1))) i--;
  return {precio: +c[i].toFixed(4), moneda: r.meta.currency, fecha: iso(new Date(r.timestamp[i] * 1000))};
}

async function ft(id) {
  const t = await fetch(`https://markets.ft.com/data/funds/tearsheet/summary?s=${id}`, UA).then(r => r.text());
  const m = t.match(/Price \((\w+)\)<\/span><span class="mod-ui-data-list__value">([\d.,]+)</);
  const d = t.match(/as of ([A-Z][a-z]{2} \d{2} \d{4})/);
  if (!m || !d) throw new Error('formato FT desconocido');
  return {precio: +m[2].replace(/,/g, ''), moneda: m[1], fecha: iso(new Date(d[1] + ' UTC'))};
}

(async () => {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) } catch {}
  const precios = {...prev.precios}, fallos = [];
  for (const [k, [src, id]] of Object.entries(ACTIVOS)) {
    try { precios[k] = await (src === 'ft' ? ft(id) : yahoo(id)) }
    catch (e) { fallos.push(`${k}: ${e.message}`) }
  }
  let eurusd = prev.eurusd;
  try { eurusd = (await yahoo('EURUSD=X')).precio } catch (e) { fallos.push('EURUSD: ' + e.message) }
  fallos.forEach(f => console.error('aviso', f));
  if (fallos.length > Object.keys(ACTIVOS).length / 2) throw new Error(`${fallos.length} precios sin descargar`);
  process.stdout.write(JSON.stringify({actualizado: new Date().toISOString(), eurusd, precios}, null, 1) + '\n');
})().catch(e => { console.error(e.message); process.exit(1) });
