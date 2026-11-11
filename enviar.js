// Sends a finished statement to your own Gmail.
//   node enviar.js informes/AAAA-MM-DD-semanal            -> sends informe.html with its images inline
//   node enviar.js informes/AAAA-MM-DD-semanal --prueba   -> only writes correo.eml next to it (open it to preview)
// The email body is informe.html; every <img src="cid:NAME.png"> is attached inline from the same folder.
// Credentials live in gmail.txt next to this file (git-ignored): line 1 your Gmail address, line 2 an app password
// (Google account > Security > 2-Step Verification > App passwords). Nothing else is needed: plain Node, SMTP over TLS.
const fs = require('fs'), path = require('path'), tls = require('tls'), crypto = require('crypto');

const dir = path.resolve(process.argv[2] || '');
const PRUEBA = process.argv.includes('--prueba');
const b64 = s => Buffer.from(s).toString('base64');
const wrap = s => s.replace(/.{1,76}/g, '$&\r\n');
const mimeWord = s => `=?UTF-8?B?${b64(s)}?=`;

function build(from, to) {
  const html = fs.readFileSync(path.join(dir, 'informe.html'), 'utf8');
  const subject = (html.match(/<title>([^<]*)<\/title>/i) || [, 'Wealth statement'])[1].trim();
  const cids = [...new Set([...html.matchAll(/src="cid:([^"]+)"/g)].map(m => m[1]))];
  for (const c of cids) if (!fs.existsSync(path.join(dir, c))) throw new Error(`Falta la imagen ${c}`);
  const bnd = 'b' + crypto.randomBytes(12).toString('hex');
  const parts = [
    `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(html))}`,
    ...cids.map(c => `Content-Type: ${c.endsWith('.png') ? 'image/png' : 'image/jpeg'}\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${c}>\r\nContent-Disposition: inline; filename="${c}"\r\n\r\n${wrap(fs.readFileSync(path.join(dir, c)).toString('base64'))}`),
  ];
  return [
    `From: ${mimeWord('Patrimonio')} <${from}>`, `To: <${to}>`, `Subject: ${mimeWord(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`, `Message-ID: <${crypto.randomUUID()}@patrimonio.local>`,
    'MIME-Version: 1.0', `Content-Type: multipart/related; boundary="${bnd}"`, '',
    ...parts.map(p => `--${bnd}\r\n${p}`), `--${bnd}--`, '',
  ].join('\r\n');
}

// minimal SMTP client: implicit TLS on 465, AUTH LOGIN, one message
function send({user, pass, to, raw}) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect(465, 'smtp.gmail.com', {servername: 'smtp.gmail.com'});
    let buf = '', waiting = null;
    sock.setEncoding('utf8');
    sock.on('data', d => {
      buf += d;
      const m = buf.match(/(?:^|\r\n)(\d{3}) [^\r\n]*\r\n$/); // a complete (last-line) reply
      if (m && waiting) { const w = waiting; waiting = null; const text = buf; buf = ''; w(+m[1], text) }
    });
    sock.on('error', reject);
    const reply = () => new Promise(r => { waiting = (code, text) => r({code, text}) });
    const step = async (cmd, want, label = cmd) => {
      if (cmd != null) sock.write(cmd + '\r\n');
      const {code, text} = await reply();
      if (code !== want) throw new Error(`SMTP ${label.split(' ')[0]}: ${text.trim()}`);
    };
    (async () => {
      await step(null, 220, 'saludo');
      await step('EHLO patrimonio.local', 250);
      await step('AUTH LOGIN', 334);
      await step(b64(user), 334, 'usuario');
      await step(b64(pass), 235, 'contraseña de aplicación');
      await step(`MAIL FROM:<${user}>`, 250);
      await step(`RCPT TO:<${to}>`, 250);
      await step('DATA', 354);
      await step(raw.replace(/\r\n\./g, '\r\n..') + '\r\n.', 250, 'envío');
      sock.write('QUIT\r\n'); sock.end(); resolve();
    })().catch(e => { sock.destroy(); reject(e) });
  });
}

async function main() {
  if (!fs.existsSync(path.join(dir, 'informe.html'))) throw new Error('No encuentro informe.html en ' + dir);
  const cred = path.join(__dirname, 'gmail.txt');
  const [user, pass] = fs.existsSync(cred) ? fs.readFileSync(cred, 'utf8').split(/\r?\n/).map(s => s.trim()) : [];
  const raw = build(user || 'tu-correo@gmail.com', user || 'tu-correo@gmail.com');
  if (PRUEBA) { fs.writeFileSync(path.join(dir, 'correo.eml'), raw); return console.log('Escrito', path.join(dir, 'correo.eml')) }
  if (!user || !pass) throw new Error('Falta gmail.txt (línea 1: tu Gmail, línea 2: la contraseña de aplicación)');
  await send({user, pass: pass.replace(/\s+/g, ''), to: user, raw});
  fs.writeFileSync(path.join(dir, 'enviado.txt'), new Date().toISOString() + '\n');
  console.log('Enviado a', user);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1) });
