// Watches the Excel and the newest PP CSV; when either changes, encrypts both and pushes them to GitHub Pages.
// The password lives in clave.txt next to this file (git-ignored), never in the repo.
const fs = require('fs'), path = require('path'), os = require('os'), {execFileSync} = require('child_process');
const {webcrypto: {subtle}, randomBytes} = require('crypto');

const EXCEL = process.env.PATRIMONIO_EXCEL || path.join(os.homedir(), 'OneDrive', 'Escriptori', '+-.xlsx');
const CSV_DIR = process.env.PATRIMONIO_CSV_DIR || path.join(os.homedir(), 'Downloads');
const CSV_MATCH = /^Todas_las_transacciones.*\.csv$/i;
const OUT = process.env.PATRIMONIO_OUT || path.join(__dirname, 'data');
const PUSH = !process.env.PATRIMONIO_NO_PUSH;
const EVERY_MS = 10000;
const log = (...a) => fs.appendFileSync(path.join(__dirname, 'sync.log'), `${new Date().toISOString()} ${a.join(' ')}\n`);

function newestCsv() {
  let best = null;
  for (const name of fs.readdirSync(CSV_DIR)) {
    if (!CSV_MATCH.test(name)) continue;
    const full = path.join(CSV_DIR, name), m = fs.statSync(full).mtimeMs;
    if (!best || m > best.m) best = {full, name, m};
  }
  return best;
}

// Same format the page decrypts: salt(16) | iv(12) | AES-256-GCM ciphertext, key = PBKDF2-SHA256(password, salt, 250k)
async function encrypt(buf, password) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt']);
  const ct = new Uint8Array(await subtle.encrypt({name: 'AES-GCM', iv}, key, buf));
  return Buffer.concat([salt, iv, ct]);
}

const git = (...args) => execFileSync('git', args, {cwd: __dirname, encoding: 'utf8'}).trim();

async function publish(password, csv) {
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, 'excel.bin'), await encrypt(fs.readFileSync(EXCEL), password));
  if (csv) fs.writeFileSync(path.join(OUT, 'csv.bin'), await encrypt(fs.readFileSync(csv.full), password));
  fs.writeFileSync(path.join(OUT, 'stamp.json'), JSON.stringify({actualizado: new Date().toISOString(), csv: !!csv}));
  if (!PUSH) return;
  git('add', 'data');
  if (!git('status', '--porcelain', 'data')) return;
  // Keep a single rolling data commit on top so the repo does not grow with every save
  const amend = git('log', '-1', '--format=%s') === 'Datos cifrados';
  git('commit', '-q', ...(amend ? ['--amend'] : []), '-m', 'Datos cifrados');
  git('push', '-q', '--force-with-lease', 'origin', 'HEAD:main');
}

async function main() {
  const password = fs.readFileSync(path.join(__dirname, 'clave.txt'), 'utf8').trim();
  if (password.length < 12) throw new Error('clave.txt: usa al menos 12 caracteres');
  let last = '';
  const tick = async () => {
    try {
      const csv = newestCsv();
      const s = `${fs.statSync(EXCEL).mtimeMs}|${csv?.full}|${csv?.m}`;
      if (s === last) return;
      await publish(password, csv);
      last = s;
      log('publicado', path.basename(EXCEL), csv?.name || 'sin CSV');
    } catch (e) {
      // Excel mid-save, OneDrive lock or no network: retry on the next tick
      log('error', e.message);
    }
  };
  await tick();
  if (!process.argv.includes('--once')) setInterval(tick, EVERY_MS);
}

main().catch((e) => { log('fatal', e.message); console.error(e.message); process.exit(1); });
