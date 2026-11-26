// Afișare Druțu — server (rulează pe PC-ul legat la panou: Windows sau macOS). Node.js 18+, fără dependențe.
//   node server.js            → control: http://localhost:8080   ecran panou: http://localhost:8080/player.html
// În aplicația desktop (Electron) serverul e pornit automat.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 8080;
const PUB = path.join(__dirname, 'public');
const DATA_DIR = process.env.PANOU_DATA || __dirname;          // în aplicația desktop: folderul utilizatorului
const UPLOADS = path.join(DATA_DIR, 'uploads');
const DATA = path.join(DATA_DIR, 'data.json');
const MAX_UPLOAD = 1024 * 1024 * 1024; // 1 GB
const VERSION = (() => { try { return require('./package.json').version; } catch { return '?'; } })();
// rute doar pentru administrator (operatorul poate doar conținut + control)
const ADMIN_ONLY = new Set(['/api/password', '/api/operator-pin', '/api/info', '/api/accounts', '/api/ai-keys', '/api/remote', '/api/sessions', '/api/update', '/api/canva/edit-url']);
const OPERATOR_SETTINGS = new Set(['imageSeconds', 'rotate', 'brightness', 'nightBrightness', 'ticker', 'tickerSpeed', 'showClock']);
fs.mkdirSync(UPLOADS, { recursive: true });

// ---------- utilitare ----------
function hashPass(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex') };
}
function passOk(pw, rec) {
  if (!rec || !rec.salt) return false;
  const a = crypto.scryptSync(String(pw || ''), rec.salt, 32, { N: 16384, r: 8, p: 1 }), b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function newId() { return crypto.randomBytes(6).toString('hex'); }
function str(v, n = 2000) { return typeof v === 'string' ? v.slice(0, n) : ''; }
function num(v, lo, hi, d) { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; }
function hhmm(v, d) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : d; }
function color(v, d) { return /^#[0-9a-f]{3,8}$/i.test(v || '') ? v : d; }
function date(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; }
function bools7(v, d = true) { return Array.from({ length: 7 }, (_, i) => (Array.isArray(v) ? v[i] !== false && v[i] !== 0 : d)); }

// ---------- date ----------
var TYPES = ['image', 'video', 'youtube', 'ytlist', 'pdf', 'web', 'text'];
function defaults() {
  return {
    settings: {},
    items: [
      { id: newId(), type: 'text', title: 'Bine ați venit', text: 'Bine ați venit!', sub: '', bg: 'g4', color: '#ffffff', source: 'text' },
    ],
    live: null,
    secrets: {},
  };
}
let db;
try { db = { ...defaults(), ...JSON.parse(fs.readFileSync(DATA, 'utf8')) }; } catch { db = defaults(); }
db.secrets = db.secrets || {};
db.auth = db.auth || null;
db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
// migrare din versiunile ≤1.0.4: PIN-ul stătea în clar în data.json
if (!db.auth) {
  const old = String(db.pin || crypto.randomInt(100000, 1000000));
  db.auth = { admin: hashPass(old), initial: /^\d{6}$/.test(old) ? old : null, operator: null };
}
if (process.env.PANOU_PIN) db.auth = { ...db.auth, admin: hashPass(String(process.env.PANOU_PIN)), initial: String(process.env.PANOU_PIN) };
delete db.pin;
db.settings = cleanSettings(db.settings || {});
db.items = (db.items || []).map(cleanItem).filter(Boolean);
save();

function save() {
  fs.writeFileSync(DATA + '.tmp', JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(DATA + '.tmp', DATA);
  try { fs.chmodSync(DATA, 0o600); } catch {}
}

function cleanItem(i) {
  if (!i || typeof i !== 'object') return null;
  return {
    id: /^[a-z0-9]{4,32}$/i.test(i.id || '') ? i.id : newId(),
    type: TYPES.includes(i.type) ? i.type : 'text',
    title: str(i.title, 200),
    url: str(i.url, 2000),
    text: str(i.text, 2000),
    sub: str(i.sub, 300),
    bg: /^g\d$/.test(i.bg || '') ? i.bg : color(i.bg, 'g0'),
    color: color(i.color, '#ffffff'),
    duration: num(i.duration, 0, 86400, 0),          // 0 = automat
    days: bools7(i.days),                             // luni..duminică
    allDay: i.allDay !== false,
    from: hhmm(i.from, '09:00'),
    to: hhmm(i.to, '20:00'),
    until: date(i.until),
    enabled: i.enabled !== false,
    mute: !!i.mute,
    source: ['upload', 'canva', 'youtube', 'link', 'text', 'ai'].includes(i.source) ? i.source : 'link',
    design: /^[a-z0-9]{4,32}$/i.test(i.design || '') ? i.design : '',
    canva: i.canva && typeof i.canva === 'object' ? { designId: str(i.canva.designId, 100), page: num(i.canva.page, 1, 500, 1), format: i.canva.format === 'mp4' ? 'mp4' : 'png' } : null,
    thumb: str(i.thumb, 2000),
  };
}

function cleanSettings(b) {
  const days = Array.isArray(b.hours?.days) ? b.hours.days : [];
  return {
    imageSeconds: num(b.imageSeconds, 2, 3600, 10),
    rotate: b.rotate !== false,
    brightness: num(b.brightness, 5, 100, 100),
    nightBrightness: num(b.nightBrightness, 5, 100, 60),
    nightFrom: hhmm(b.nightFrom, '20:00'),
    nightTo: hhmm(b.nightTo, '07:00'),
    hours: {
      enabled: !!b.hours?.enabled,
      days: Array.from({ length: 7 }, (_, i) => ({ on: days[i]?.on !== false, from: hhmm(days[i]?.from, '07:00'), to: hhmm(days[i]?.to, '23:00') })),
    },
    ticker: str(b.ticker, 3000),
    tickerSpeed: num(b.tickerSpeed, 20, 600, 120),
    showClock: !!b.showClock,
    area: { x: num(b.area?.x, 0, 10000, 0), y: num(b.area?.y, 0, 10000, 0), w: num(b.area?.w, 0, 10000, 0), h: num(b.area?.h, 0, 10000, 0) },
    display: b.display == null ? null : String(b.display).slice(0, 40),
  };
}

// ---------- stare publică + evenimente ----------
const status = { now: '', nowId: '', players: 0, lastBeat: 0, startedAt: Date.now() };
function publicState(_sess) {
  const s = db.secrets;
  return {
    settings: db.settings, items: db.items, live: db.live, black: !!db.black, status: { ...status },
    integrations: {
      youtube: { configured: !!(s.youtube?.clientId && s.youtube?.clientSecret), connected: !!s.youtube?.refresh, channel: s.youtube?.channel || '' },
      canva: { configured: !!(s.canva?.clientId && s.canva?.clientSecret), connected: !!s.canva?.refresh },
      ai: { claude: !!s.ai?.anthropicKey, images: !!s.ai?.openaiKey },
    },
    desktop: !!global.panouDesktop, version: VERSION,
  };
}
const clients = new Set();
function send(ev, data, onlyPlayers) {
  const msg = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) if (!onlyPlayers || c.player) c.res.write(msg);
}
function broadcast() { send('state', publicState()); }
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25000);

// ---------- AUTENTIFICARE ----------
// Parolele sunt păstrate doar ca hash (scrypt). Telefonul primește un token de sesiune, nu parola.
// Roluri: admin (tot) și operator (conținut + control, fără setări avansate).
const SESSION_DAYS = 60;
const fails = new Map();            // încercări greșite pe adresă
let remoteFails = { n: 0, since: Date.now(), until: 0 };   // limită globală pentru accesul prin internet
const TS_HEADERS = ['x-forwarded-for', 'forwarded', 'tailscale-user-login', 'tailscale-funnel-request', 'x-forwarded-proto'];
function isProxied(req) { return TS_HEADERS.some((h) => req.headers[h] != null); }
function isLoopback(req) { const a = req.socket.remoteAddress || ''; return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'; }
function isLocal(req) {   // cerere chiar de pe PC-ul panoului (nu prin Tailscale/alt proxy)
  return isLoopback(req) && !isProxied(req) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.host || '');
}
function ipOf(req) {
  if (isLoopback(req) && isProxied(req)) {   // venit prin Tailscale: ultima adresă adăugată de proxy
    const xf = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    return 'proxy:' + (xf[xf.length - 1] || 'necunoscut');
  }
  return (req.socket.remoteAddress || '').replace('::ffff:', '');
}
function hostAllowed(req) {   // protecție DNS-rebinding: acceptăm doar nume cunoscute
  const h = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return !h || h === 'localhost' || /^[\d.]+$/.test(h) || h.includes(':') || h.endsWith('.ts.net') || h.endsWith('.local') || h === os.hostname().toLowerCase();
}
function lockedFor(req) {
  const f = fails.get(ipOf(req));
  if (f && f.until > Date.now()) return f.until;
  if (!isLocal(req) && remoteFails.until > Date.now()) return remoteFails.until;
  return 0;
}
function noteFail(req) {
  const ip = ipOf(req), f = fails.get(ip) || { n: 0, until: 0 };
  if (++f.n >= 8) { f.until = Date.now() + 10 * 60000; f.n = 0; }
  fails.set(ip, f);
  if (!isLocal(req)) {
    if (Date.now() - remoteFails.since > 15 * 60000) remoteFails = { n: 0, since: Date.now(), until: 0 };
    if (++remoteFails.n >= 30) remoteFails.until = Date.now() + 15 * 60000;
  }
}
function checkPassword(pw) {
  if (passOk(pw, db.auth.admin)) return 'admin';
  if (db.auth.operator && passOk(pw, db.auth.operator)) return 'operator';
  return null;
}
function newSession(role, note) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions.push({ h: sha(token), role, at: Date.now(), last: Date.now(), note: str(note, 80) });
  db.sessions = db.sessions.slice(-60);
  save();
  return token;
}
const memSessions = new Map();   // sesiunea ferestrei de control de pe PC (nu se scrie pe disc)
function sessionOf(req, url) {
  const t = req.headers['x-token'] || (url && url.searchParams.get('t')) || '';
  if (!t) return null;
  const h = sha(t);
  if (memSessions.has(h)) return memSessions.get(h);
  const s = db.sessions.find((x) => x.h === h);
  if (!s) return null;
  if (Date.now() - s.last > SESSION_DAYS * 864e5) { db.sessions = db.sessions.filter((x) => x !== s); save(); return null; }
  if (Date.now() - s.last > 3600e3) { s.last = Date.now(); save(); }
  return s;
}
function localAdminToken() { const t = crypto.randomBytes(32).toString('base64url'); memSessions.set(sha(t), { role: 'admin', local: true }); return t; }
const tickets = new Map();       // bilete de o singură folosință pentru linkuri (ex. pornire conectare Canva)
function newTicket(role) { const t = crypto.randomBytes(18).toString('base64url'); tickets.set(t, { role, at: Date.now() }); return t; }
function useTicket(t) { const x = tickets.get(t || ''); tickets.delete(t || ''); return x && Date.now() - x.at < 120000 ? x : null; }
let lastRemote = 0;              // ultima cerere venită de la distanță (pentru „Verifică de pe telefon”)


function passProblem(np, min) {
  if (np.length < min || np.length > 64) return `Trebuie să aibă între ${min} și 64 de caractere.`;
  if (!/^[\x21-\x7e]+$/.test(np)) return 'Folosește doar litere fără diacritice, cifre și semne (fără spații, fără ă/â/î/ș/ț).';
  return '';
}
function strongAdmin() { return !db.auth.initial && !!db.auth.strong; }

// ---------- STARE (sănătatea panoului) ----------
function health() {
  const mem = process.memoryUsage();
  const d = global.panouDesktop;
  return {
    version: VERSION,
    uptime: Math.round((Date.now() - status.startedAt) / 1000),
    playerOnline: status.players > 0,
    lastBeat: status.lastBeat ? Math.round((Date.now() - status.lastBeat) / 1000) : null,
    now: status.now,
    memMB: Math.round(mem.rss / 1048576),
    sysFreeMB: Math.round(os.freemem() / 1048576), sysTotalMB: Math.round(os.totalmem() / 1048576),
    cpu: d && d.metrics ? d.metrics() : null,
    display: d && d.displayInfo ? d.displayInfo() : null,
    remoteSeen: lastRemote ? Math.round((Date.now() - lastRemote) / 1000) : null,
  };
}

// ---------- ACTUALIZĂRI ----------
let latestCache = { at: 0, v: null };
async function latestRelease() {
  if (Date.now() - latestCache.at < 3600e3 && latestCache.v) return latestCache.v;
  try {
    const r = await fetch('https://api.github.com/repos/gheorgheturcu97-eng/afisare-drutu/releases/latest', { headers: { 'User-Agent': 'afisare-drutu' } });
    const j = await r.json();
    if (r.ok) latestCache = { at: Date.now(), v: { version: String(j.tag_name || '').replace(/^v/, ''), page: j.html_url, notes: String(j.body || '').slice(0, 1500), assets: (j.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url })) } };
  } catch {}
  return latestCache.v;
}
function newer(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
async function updateInfo() {
  const d = global.panouDesktop;
  const auto = d && d.update ? d.update() : { auto: false, state: 'manual' };
  const rel = await latestRelease();
  const mine = rel && rel.assets.find((a) => process.platform === 'win32' ? /win-x64\.exe$/.test(a.name) : process.platform === 'darwin' ? (process.arch === 'arm64' ? /mac-arm64\.dmg$/ : /mac-x64\.dmg$/).test(a.name) : false);
  return { current: VERSION, latest: rel ? rel.version : null, available: !!(rel && newer(rel.version, VERSION)), page: rel ? rel.page : 'https://github.com/gheorgheturcu97-eng/afisare-drutu/releases', download: mine ? mine.url : null, notes: rel ? rel.notes : '', ...auto };
}

// ---------- ACCES DE ORIUNDE (Tailscale) ----------
const { execFile, spawn } = require('child_process');
function tsBinary() {
  const c = process.platform === 'win32'
    ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe'), path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Tailscale', 'tailscale.exe')]
    : process.platform === 'darwin'
      ? ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale']
      : ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/usr/sbin/tailscale'];
  return c.find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }) || null;
}
function tsRun(args, ms = 15000) {
  const bin = tsBinary();
  if (!bin) return Promise.resolve({ code: -1, out: '', err: 'Tailscale nu este instalat.' });
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: ms, windowsHide: true, maxBuffer: 4 << 20 }, (e, out, err) => resolve({ code: e ? (e.code ?? 1) : 0, out: String(out || ''), err: String(err || (e && e.message) || '') }));
  });
}
// comenzi care pot aștepta activarea în contul Tailscale: întoarcem linkul de activare
function tsStart(args) {
  const bin = tsBinary();
  if (!bin) return Promise.resolve({ code: -1, out: '', err: 'Tailscale nu este instalat.' });
  return new Promise((resolve) => {
    const ch = spawn(bin, args, { windowsHide: true });
    let buf = '', done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const look = (d) => { buf += d; const m = buf.match(/https:\/\/login\.tailscale\.com\/\S+/); if (m) finish({ code: 0, out: buf, enableUrl: m[0] }); };
    ch.stdout.on('data', look); ch.stderr.on('data', look);
    ch.on('close', (code) => finish({ code, out: buf }));
    ch.on('error', (e) => finish({ code: -1, out: buf, err: e.message }));
    setTimeout(() => { finish({ code: 0, out: buf, pending: true }); }, 25000);
    setTimeout(() => { try { ch.kill(); } catch {} }, 10 * 60000);   // așteptăm activarea maximum 10 minute
  });
}
async function tsInstall(local) {
  const page = process.platform === 'darwin' ? 'https://apps.apple.com/app/tailscale/id1475387142' : 'https://tailscale.com/download';
  if (process.platform !== 'win32' || !local) return { ok: true, open: page };
  // Windows: descarcă instalatorul oficial și îl pornește (Windows cere confirmare)
  const file = path.join(os.tmpdir(), 'tailscale-setup-latest.exe');
  const r = await fetch('https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe');
  if (!r.ok) return { ok: false, error: 'Nu am putut descărca Tailscale (' + r.status + '). Încearcă de pe ' + page, open: page };
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  if (global.panouDesktop && global.panouDesktop.openPath) global.panouDesktop.openPath(file);
  else spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true, started: true };
}
async function remoteStatus() {
  const bin = tsBinary();
  const base = { installed: !!bin, port: PORT, strongPassword: strongAdmin(), initialPassword: !!db.auth.initial, remoteSeen: lastRemote ? Math.round((Date.now() - lastRemote) / 1000) : null, platform: process.platform };
  if (!bin) return base;
  const st = await tsRun(['status', '--json']);
  let j = {}; try { j = JSON.parse(st.out); } catch {}
  const dns = String(j.Self?.DNSName || '').replace(/\.$/, '');
  const r = { ...base, running: j.BackendState === 'Running', state: j.BackendState || (st.err ? 'Eroare' : '?'), loginUrl: j.AuthURL || '', dnsName: dns, ips: j.Self?.TailscaleIPs || [], error: j.BackendState ? '' : (st.err || st.out).slice(0, 300) };
  if (r.running) {
    const sv = await tsRun(['serve', 'status', '--json']);
    let c = {}; try { c = JSON.parse(sv.out || '{}'); } catch {}
    const key = dns + ':443';
    const web = c.Web && (c.Web[key] || Object.values(c.Web)[0]);
    const proxy = web && web.Handlers && Object.values(web.Handlers).map((h) => h.Proxy || '').join(' ');
    r.serve = !!(proxy && proxy.includes(String(PORT)));
    r.funnel = !!(r.serve && c.AllowFunnel && (c.AllowFunnel[key] || Object.values(c.AllowFunnel).some(Boolean)));
    r.url = r.serve && dns ? 'https://' + dns : '';
    if (r.url) { try { r.qr = await require('qrcode').toString(r.url, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } }); } catch {} }
  }
  return r;
}
async function remoteSet(mode, confirm) {
  if (mode === 'off') { await tsRun(['serve', 'reset']); return { ok: true, ...(await remoteStatus()) }; }
  if (mode === 'funnel') {
    if (!strongAdmin()) return { ok: false, error: 'Pentru linkul public pune întâi o parolă de administrator puternică (minim 10 caractere, litere și cifre) în Setări → Securitate.' };
    if (!confirm) return { ok: false, error: 'Confirmă că vrei link public.' };
  }
  if (mode !== 'serve' && mode !== 'funnel') return { ok: false, error: 'Mod necunoscut' };
  const st = await remoteStatus();
  if (!st.installed) return { ok: false, error: 'Tailscale nu este instalat pe acest PC.' };
  if (!st.running) return { ok: false, error: 'Deschide aplicația Tailscale și conectează-te (Log in), apoi încearcă din nou.', loginUrl: st.loginUrl };
  if (mode === 'serve' && st.funnel) await tsRun(['serve', 'reset']);
  const r = await tsStart([mode, '--bg', String(PORT)]);
  if (r.enableUrl) return { ok: false, enableUrl: r.enableUrl, error: mode === 'funnel' ? 'Trebuie activat „Funnel” în contul Tailscale. Deschide linkul, apasă Enable, apoi apasă din nou butonul.' : 'Trebuie activat „HTTPS / Serve” în contul Tailscale. Deschide linkul, apasă Enable, apoi apasă din nou butonul.' };
  const after = await remoteStatus();
  if (!after.serve) return { ok: false, error: 'Tailscale nu a pornit accesul: ' + (r.err || r.out || 'eroare necunoscută').slice(0, 300), ...after };
  return { ok: true, ...after };
}

// ---------- HTTP ----------
const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN' };
function reply(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SEC_HEADERS, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function redirect(res, to) { res.writeHead(302, { Location: to }); res.end(); }
function readJson(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('prea mare')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.m4v': 'video/mp4',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg', '.mkv': 'video/x-matroska', '.pdf': 'application/pdf',
};
const KIND = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.svg'],
  video: ['.mp4', '.m4v', '.webm', '.mov', '.ogv', '.mkv'],
  pdf: ['.pdf'],
};
const kindOf = (ext) => Object.keys(KIND).find((k) => KIND[k].includes(ext));

function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return reply(res, 404, 'Pagina nu există. Verifică adresa (fără punct sau spațiu la final).', 'text/plain; charset=utf-8');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, ...SEC_HEADERS };
    if (type === 'image/svg+xml') head['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [s, e] = range.slice(6).split('-');
      const start = s === '' ? Math.max(0, st.size - Number(e)) : Number(s);
      const end = s === '' || e === '' ? st.size - 1 : Math.min(Number(e), st.size - 1);
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...head, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}` });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}
function inside(base, rel) {
  const f = path.normalize(path.join(base, rel));
  return f.startsWith(base + path.sep) || f === base ? f : null;
}

// ---------- descărcare fișier de pe internet în uploads (Canva) ----------
async function download(url, ext) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Descărcare eșuată: ' + r.status);
  const name = Date.now() + '-' + newId() + ext;
  fs.writeFileSync(path.join(UPLOADS, name), Buffer.from(await r.arrayBuffer()));
  return '/uploads/' + name;
}

// ---------- OAuth comun ----------
const oauthStates = new Map(); // state -> {provider, verifier, redirect, at}
function originOf(req) { return 'http://' + (req.headers.host || 'localhost:' + PORT); }
function b64url(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }


// ---------- AI: Claude (grafică SVG) + OpenAI (imagini) ----------
function panelSize() {
  const a = db.settings.area || {};
  let w = +a.w || 1920, h = +a.h || 1080;
  const k = Math.min(1, 1920 / Math.max(w, h)); // păstrăm proporția panoului
  return { w: Math.round(w * k) || 1920, h: Math.round(h * k) || 1080 };
}
// Sanitizare strictă SVG: doar elemente și atribute grafice din listă; fără script, evenimente, linkuri externe, CSS cu resurse.
const SVG_TAGS = new Set('svg g defs symbol use title desc lineargradient radialgradient stop pattern clippath mask filter fegaussianblur feoffset feblend fecolormatrix fecomposite feflood femerge femergenode fedropshadow femorphology feturbulence fedisplacementmap rect circle ellipse line polyline polygon path text tspan textpath marker image'.split(' '));
const SVG_DROP_WITH_CONTENT = new Set(['script', 'style', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'animate', 'animatemotion', 'animatetransform', 'set', 'handler', 'listener']);
const SVG_ATTR = /^(id|class|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|fx|fy|fr|width|height|d|points|transform|viewbox|preserveaspectratio|xmlns|xmlns:xlink|version|fill|fill-opacity|fill-rule|clip-rule|stroke|stroke-width|stroke-opacity|stroke-linecap|stroke-linejoin|stroke-dasharray|stroke-dashoffset|stroke-miterlimit|opacity|font-family|font-size|font-weight|font-style|font-variant|letter-spacing|word-spacing|text-anchor|text-decoration|dominant-baseline|alignment-baseline|baseline-shift|dx|dy|rotate|lengthadjust|textlength|offset|stop-color|stop-opacity|gradientunits|gradienttransform|spreadmethod|patternunits|patterncontentunits|patterntransform|clippathunits|maskunits|maskcontentunits|clip-path|mask|filter|filterunits|primitiveunits|in|in2|result|stddeviation|mode|operator|k1|k2|k3|k4|values|type|flood-color|flood-opacity|radius|basefrequency|numoctaves|seed|scale|xchannelselector|ychannelselector|href|xlink:href|style|visibility|display|paint-order|vector-effect|shape-rendering|text-rendering|markerwidth|markerheight|refx|refy|orient|markerunits|marker-start|marker-mid|marker-end|startoffset|method|spacing|side|path|pathlength|color|mix-blend-mode|isolation|xml:space)$/;
function badValue(v) {
  return /javascript:|vbscript:|expression\s*\(|@import|behavior\s*:|-moz-binding/i.test(v)
    || /url\s*\(\s*['"]?\s*(?!#)/i.test(v)
    || /data:(?!image\/(png|jpeg|gif|webp);base64,)/i.test(v);
}
function sanitizeSvg(input) {
  const src = String(input || '');
  const m = src.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return { ok: false, error: 'Nu am găsit un SVG complet (<svg> … </svg>).' };
  if (m[0].length > 800000) return { ok: false, error: 'SVG-ul e prea mare (maxim 800 KB).' };
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/?([a-zA-Z][\w:.-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let out = '', last = 0, skip = 0, stack = [], k;
  const textOut = (t) => { if (!skip) out += t.replace(/</g, '&lt;'); };
  while ((k = re.exec(m[0]))) {
    textOut(m[0].slice(last, k.index)); last = re.lastIndex;
    const tag = (k[1] || '').toLowerCase();
    if (!tag) continue;                                   // comentariu, doctype, CDATA, instrucțiuni: eliminate
    const closing = k[0][1] === '/', self = !!k[3] || /\/\s*>$/.test(k[0]);
    if (SVG_DROP_WITH_CONTENT.has(tag)) { if (!self) skip += closing ? -1 : 1; if (skip < 0) skip = 0; continue; }
    if (skip || !SVG_TAGS.has(tag)) continue;           // element necunoscut: îl scoatem, păstrăm conținutul
    const name = k[1].replace(/^(\w+:)?/, (x) => (x === 'svg:' ? '' : x));
    if (closing) { if (stack[stack.length - 1] === tag) { stack.pop(); out += `</${name}>`; } continue; }
    let attrs = '';
    const ar = /([^\s=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a;
    while ((a = ar.exec(k[2] || ''))) {
      const an = a[1].toLowerCase(), v = a[3] ?? a[4] ?? a[5] ?? '';
      if (an.startsWith('on') || !SVG_ATTR.test(an) || badValue(v)) continue;
      if ((an === 'href' || an === 'xlink:href') && !(v.startsWith('#') || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(v))) continue;
      attrs += ` ${a[1]}="${v.replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`;
    }
    if (tag === 'svg' && !/\sxmlns=/.test(attrs)) attrs = ' xmlns="http://www.w3.org/2000/svg"' + attrs;
    out += `<${name}${attrs}${self ? '/' : ''}>`;
    if (!self) stack.push(tag);
  }
  while (stack.length) out += `</${stack.pop()}>`;
  if (/\sxlink:href=/.test(out) && !/^<svg[^>]*xmlns:xlink=/.test(out)) out = out.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  if (!/^<svg[\s>]/i.test(out)) return { ok: false, error: 'SVG invalid după verificare.' };
  return { ok: true, svg: out };
}
function cleanSvg(t) { const r = sanitizeSvg(t); return r.ok ? r.svg : null; }
async function aiDesignSvg(prompt, base) {
  const ai = db.secrets.ai || {};
  if (!ai.anthropicKey) throw new Error('Adaugă cheia Claude în Setări → Inteligență artificială.');
  const { w, h } = panelSize();
  const system = `Ești designer pentru un ecran LED publicitar montat pe o clădire, văzut de la distanță (stradă, mașini).
Lucrezi cu UN SINGUR slide, ca imagine SVG completă și independentă.
Reguli:
- Răspunde DOAR cu codul SVG complet, începând cu <svg și terminând cu </svg>. Fără explicații, fără markdown.
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">.
- Fundalul acoperă tot slide-ul (gradient sau culoare plină, culori vii, contrast mare).
- Text FOARTE mare și puțin: titlu de maximum 6–8 cuvinte, eventual un subtitlu scurt și un detaliu (dată, preț, oră).
- Nimic important mai aproape de 5% de margini. Niciun text nu iese din slide: împarte singur rândurile cu <tspan> și alege dimensiunea fontului ca să încapă.
- Font: font-family="Arial, Helvetica, sans-serif", font-weight 700–900 pentru titlu.
- Scrie în limba cererii (implicit română) cu diacritice corecte (ă, â, î, ș, ț).
- Decor doar din forme vectoriale (cercuri, valuri, linii, iconițe desenate cu path). Fără <image>, fără <style>, fără fonturi sau resurse externe, fără <script>, fără <foreignObject>, fără animații.
- Nu desena logo-uri sau personaje protejate de drepturi de autor.`;
  const content = base
    ? `Acesta este SVG-ul actual al slide-ului:\n\n${base}\n\nModifică-l după instrucțiunile de mai jos și întoarce SVG-ul COMPLET modificat (nu doar diferențele). Păstrează ce nu se cere schimbat.\n\nInstrucțiuni: ${prompt}`
    : prompt;
  const r = await fetch((process.env.PANOU_AI_BASE || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ai.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ai.claudeModel || 'claude-sonnet-5-5', max_tokens: 16000, system, messages: [{ role: 'user', content }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude: ' + (j.error?.message || r.status));
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const san = sanitizeSvg(text);
  if (!san.ok) throw new Error('Claude nu a trimis o grafică validă. Încearcă din nou.');
  return san.svg;
}
function saveDesign(svg, designId, prompt, title) {
  const name = Date.now() + '-ai-' + newId() + '.svg';
  fs.writeFileSync(path.join(UPLOADS, name), svg);
  db.designs = db.designs || {};
  const id = /^[a-z0-9]{4,32}$/i.test(designId || '') && db.designs[designId] ? designId : newId();
  const d = db.designs[id] || (db.designs[id] = { title: '', versions: [] });
  if (title) d.title = str(title, 120);
  d.versions.push({ url: '/uploads/' + name, prompt: str(prompt, 500), at: Date.now() });
  d.versions = d.versions.slice(-30);
  save();
  return { url: '/uploads/' + name, designId: id, versions: d.versions, title: d.title };
}
async function aiDesign(prompt) { const svg = await aiDesignSvg(prompt); const r = saveDesign(svg, '', prompt, prompt.slice(0, 60)); return { url: r.url, type: 'image', designId: r.designId }; }
async function aiImage(prompt) {
  const ai = db.secrets.ai || {};
  if (!ai.openaiKey) throw new Error('Adaugă cheia OpenAI în Setări → Inteligență artificială.');
  const { w, h } = panelSize();
  const full = prompt + '\n\nImagine pentru un ecran LED publicitar exterior, orientare ' + (w >= h ? 'orizontală' : 'verticală') + ', culori vii, contrast mare, compoziție simplă, lizibilă de la distanță. Dacă apare text, să fie foarte puțin și foarte mare.';
  const call = (size) => fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { Authorization: 'Bearer ' + ai.openaiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ai.imageModel || 'gpt-image-2', prompt: full, size, n: 1 }),
  });
  const wide = w >= h;
  let r = await call(wide ? '1536x864' : '864x1536');
  if (r.status === 400) r = await call(wide ? '1536x1024' : '1024x1536');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('OpenAI: ' + (j.error?.message || r.status));
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI nu a trimis nicio imagine.');
  const name = Date.now() + '-ai-' + newId() + '.png';
  fs.writeFileSync(path.join(UPLOADS, name), Buffer.from(b64, 'base64'));
  return { url: '/uploads/' + name, type: 'image' };
}

// ---------- YouTube ----------
const YT = 'https://www.googleapis.com/youtube/v3/';
async function ytToken() {
  const y = db.secrets.youtube;
  if (!y?.refresh) throw new Error('YouTube nu e conectat');
  if (y.access && y.expires > Date.now() + 60000) return y.access;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: y.clientId, client_secret: y.clientSecret, refresh_token: y.refresh, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!r.ok) throw new Error('YouTube: ' + (j.error_description || j.error || r.status));
  y.access = j.access_token; y.expires = Date.now() + j.expires_in * 1000; save();
  return y.access;
}
async function yt(pathq) {
  const r = await fetch(YT + pathq, { headers: { Authorization: 'Bearer ' + (await ytToken()) } });
  const j = await r.json();
  if (!r.ok) throw new Error('YouTube: ' + (j.error?.message || r.status));
  return j;
}
function isoDur(s) { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; }
async function ytVideos(ids) {
  if (!ids.length) return [];
  const j = await yt('videos?part=snippet,contentDetails,status&maxResults=50&id=' + ids.join(','));
  return j.items.map(videoOut);
}
function videoOut(v) {
  return { id: v.id, title: v.snippet?.title || '', thumb: v.snippet?.thumbnails?.medium?.url || '', seconds: isoDur(v.contentDetails?.duration),
    privacy: v.status?.privacyStatus || '', embeddable: v.status?.embeddable !== false, url: 'https://www.youtube.com/watch?v=' + v.id };
}
async function ytList(tab, id) {
  if (tab === 'playlists') {
    const j = await yt('playlists?part=snippet,contentDetails&mine=true&maxResults=50');
    return j.items.map((p) => ({ id: p.id, title: p.snippet.title, thumb: p.snippet.thumbnails?.medium?.url || '', count: p.contentDetails.itemCount, url: 'https://www.youtube.com/playlist?list=' + p.id, playlist: true }));
  }
  if (tab === 'liked') { const j = await yt('videos?part=snippet,contentDetails,status&myRating=like&maxResults=50'); return j.items.map(videoOut); }
  const pl = tab === 'playlist' ? id : db.secrets.youtube.uploads;
  if (!pl) return [];
  const j = await yt('playlistItems?part=contentDetails&maxResults=50&playlistId=' + encodeURIComponent(pl));
  return ytVideos(j.items.map((i) => i.contentDetails.videoId));
}

// ---------- Canva ----------
const CANVA = 'https://api.canva.com/rest/v1/';
async function canvaToken() {
  const c = db.secrets.canva;
  if (!c?.refresh) throw new Error('Canva nu e conectat');
  if (c.access && c.expires > Date.now() + 60000) return c.access;
  const r = await fetch(CANVA + 'oauth/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(c.clientId + ':' + c.clientSecret).toString('base64') },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh }) });
  const j = await r.json();
  if (!r.ok) throw new Error('Canva: ' + (j.message || j.error || r.status));
  c.access = j.access_token; c.refresh = j.refresh_token || c.refresh; c.expires = Date.now() + j.expires_in * 1000; save();
  return c.access;
}
async function canva(pathq, opts = {}) {
  const r = await fetch(CANVA + pathq, { ...opts, headers: { Authorization: 'Bearer ' + (await canvaToken()), 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Canva: ' + (j.message || r.status));
  return j;
}
async function canvaExport(designId, format) {
  const body = format === 'mp4' ? { design_id: designId, format: { type: 'mp4', quality: 'horizontal_1080p' } } : { design_id: designId, format: { type: 'png' } };
  let job = (await canva('exports', { method: 'POST', body: JSON.stringify(body) })).job;
  for (let i = 0; i < 90 && job.status === 'in_progress'; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    job = (await canva('exports/' + job.id)).job;
  }
  if (job.status !== 'success') throw new Error('Canva: exportul a eșuat');
  const ext = format === 'mp4' ? '.mp4' : '.png';
  const urls = [];
  for (const u of job.urls) urls.push(await download(u, ext));
  return urls;
}

// ---------- rute ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/^(\/oauth\/(?:canva|youtube)\/callback)[.\s%20]+$/, '$1');
  try {
    if (!hostAllowed(req)) return reply(res, 421, 'Adresă nepermisă', 'text/plain; charset=utf-8');
    if (!isLocal(req) && isProxied(req)) lastRemote = Date.now();
    if (p === '/') return redirect(res, '/app.html');

    // ---- public minim: test de conexiune (aplicația iPhone) ----
    if (p === '/api/ping' && req.method === 'GET') return reply(res, 200, { ok: true, app: 'Afișare Druțu', version: VERSION }, undefined, { 'Access-Control-Allow-Origin': '*' });

    // ---- ecranul panoului: doar de pe PC-ul panoului (sau cu sesiune) ----
    const sess = sessionOf(req, url);
    const playerOk = isLocal(req) || !!sess;
    if (p === '/api/state' && req.method === 'GET') {
      if (!playerOk) return reply(res, 401, { error: 'Neautentificat' });
      return reply(res, 200, publicState(sess));
    }
    if (p === '/api/events' && req.method === 'GET') {
      if (!playerOk) return reply(res, 401, { error: 'Neautentificat' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', ...SEC_HEADERS });
      const c = { res, sess, player: url.searchParams.get('role') === 'player' && isLocal(req) };
      clients.add(c);
      if (c.player) { status.players++; broadcast(); }
      res.write(`event: state\ndata: ${JSON.stringify(publicState(sess))}\n\n`);
      req.on('close', () => { clients.delete(c); if (c.player) { status.players--; if (!status.players) { status.now = ''; status.nowId = ''; } broadcast(); } });
      return;
    }
    if ((p === '/api/now' || p === '/api/heartbeat') && req.method === 'POST') {
      if (!isLocal(req) || req.headers['x-panou'] !== 'player') return reply(res, 403, { error: 'Doar ecranul panoului' });
      const b = await readJson(req, 4096);
      status.lastBeat = Date.now();
      if (b.mem) status.playerMem = num(b.mem, 0, 1e12, 0);
      if (p === '/api/now') { status.now = str(b.text, 200); status.nowId = str(b.id, 40); broadcast(); }
      else if (b.id !== undefined && b.id !== status.nowId) { status.nowId = str(b.id, 40); status.now = str(b.text, 200); broadcast(); }
      return reply(res, 200, { ok: true });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const b = await readJson(req, 4096);
      const until = lockedFor(req);
      if (until) return reply(res, 429, { error: `Prea multe încercări greșite. Mai încearcă peste ${Math.ceil((until - Date.now()) / 60000)} min.` });
      const role = checkPassword(b.pin);
      if (!role) { noteFail(req); return reply(res, 401, { error: 'PIN sau parolă greșită' }); }
      fails.delete(ipOf(req));
      return reply(res, 200, { ok: true, role, token: newSession(role, (isLocal(req) ? 'PC panou' : isProxied(req) ? 'internet' : 'rețea') + ' · ' + str(req.headers['user-agent'], 60)) });
    }

    // ---- OAuth (se pornește din aplicație, cu PIN în adresă) ----
    if (p === '/oauth/youtube/start' || p === '/oauth/canva/start') {
      const tk = useTicket(url.searchParams.get('k'));
      if (!tk || tk.role !== 'admin') return reply(res, 401, 'Linkul de conectare a expirat. Apasă din nou „Conectează” în aplicație.', 'text/plain; charset=utf-8');
      if (!isLocal(req)) return reply(res, 403, 'Conectarea conturilor se face doar de pe PC-ul panoului.', 'text/plain; charset=utf-8');
      const provider = p.includes('youtube') ? 'youtube' : 'canva';
      const cfg = db.secrets[provider];
      if (!cfg?.clientId) return reply(res, 400, 'Întâi completează Client ID și Client Secret în Setări → Conturi.', 'text/plain; charset=utf-8');
      const state = b64url(crypto.randomBytes(16));
      const redirectUri = (provider === 'canva' ? `http://127.0.0.1:${PORT}` : `http://localhost:${PORT}`) + '/oauth/' + provider + '/callback';
      const verifier = b64url(crypto.randomBytes(48));
      oauthStates.set(state, { provider, verifier, redirectUri, at: Date.now(), back: url.searchParams.get('back') === '127' ? `http://127.0.0.1:${PORT}` : `http://localhost:${PORT}` });
      if (provider === 'youtube') {
        return redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri, response_type: 'code',
          scope: 'https://www.googleapis.com/auth/youtube.readonly', access_type: 'offline', prompt: 'consent', state }));
      }
      const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
      return redirect(res, 'https://www.canva.com/api/oauth/authorize?' + new URLSearchParams({ code_challenge: challenge, code_challenge_method: 's256',
        scope: 'design:meta:read design:content:read profile:read', response_type: 'code', client_id: cfg.clientId, state, redirect_uri: redirectUri }));
    }
    if (p === '/oauth/youtube/callback' || p === '/oauth/canva/callback') {
      const st = oauthStates.get(url.searchParams.get('state') || '');
      oauthStates.delete(url.searchParams.get('state') || '');
      const code = url.searchParams.get('code');
      const why = url.searchParams.get('error_description') || url.searchParams.get('error');
      if (why) return reply(res, 400, (st ? (st.provider === 'canva' ? 'Canva' : 'Google') : 'Serviciul') + ' a refuzat conectarea: ' + why + '\n\nÎnchide fereastra și încearcă din nou din aplicație.', 'text/plain; charset=utf-8');
      if (!st) return reply(res, 400, 'Conectarea nu mai e valabilă (pagina a fost reîncărcată sau aplicația a fost repornită). Apasă din nou „Conectează” în aplicație.', 'text/plain; charset=utf-8');
      if (!code || Date.now() - st.at > 600000) return reply(res, 400, 'Conectarea a expirat (peste 10 minute). Apasă din nou „Conectează” în aplicație.', 'text/plain; charset=utf-8');
      const cfg = db.secrets[st.provider];
      if (st.provider === 'youtube') {
        const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: st.redirectUri, grant_type: 'authorization_code' }) });
        const j = await r.json();
        if (!r.ok) return reply(res, 400, 'Google a refuzat: ' + (j.error_description || j.error), 'text/plain; charset=utf-8');
        Object.assign(cfg, { access: j.access_token, refresh: j.refresh_token || cfg.refresh, expires: Date.now() + j.expires_in * 1000 });
        try { const ch = await yt('channels?part=snippet,contentDetails&mine=true'); const c0 = ch.items?.[0]; cfg.channel = c0?.snippet?.title || ''; cfg.uploads = c0?.contentDetails?.relatedPlaylists?.uploads || ''; } catch {}
      } else {
        const r = await fetch(CANVA + 'oauth/token', { method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(cfg.clientId + ':' + cfg.clientSecret).toString('base64') },
          body: new URLSearchParams({ grant_type: 'authorization_code', code_verifier: st.verifier, code, redirect_uri: st.redirectUri }) });
        const j = await r.json();
        if (!r.ok) return reply(res, 400, 'Canva a refuzat: ' + (j.message || j.error), 'text/plain; charset=utf-8');
        Object.assign(cfg, { access: j.access_token, refresh: j.refresh_token, expires: Date.now() + j.expires_in * 1000 });
      }
      save(); broadcast();
      return redirect(res, st.back + '/app.html#conectat-' + st.provider);
    }

    // ---- de aici: doar cu sesiune ----
    if (p.startsWith('/api/')) {
      if (!sess) return reply(res, 401, { error: 'Neautentificat' });
      const admin = sess.role === 'admin';
      const needAdmin = () => reply(res, 403, { error: 'Doar administratorul poate schimba asta (Setări avansate).' });
      if (ADMIN_ONLY.has(p) && !admin) return needAdmin();
      if (p === '/api/oauth-ticket' && req.method === 'POST') return reply(res, 200, { k: newTicket(sess.role) });
      if (p === '/api/logout' && req.method === 'POST') { const h = sha(req.headers['x-token'] || ''); db.sessions = db.sessions.filter((x) => x.h !== h); save(); return reply(res, 200, { ok: true }); }
      if (p === '/api/sessions' && req.method === 'DELETE') { const h = sha(req.headers['x-token'] || ''); db.sessions = db.sessions.filter((x) => x.h === h); save(); return reply(res, 200, { ok: true }); }

      if (p === '/api/items' && req.method === 'PUT') {
        const b = await readJson(req);
        if (!Array.isArray(b.items)) return reply(res, 400, { error: 'items lipsă' });
        db.items = b.items.slice(0, 2000).map(cleanItem).filter(Boolean);
        save(); broadcast();
        return reply(res, 200, { ok: true });
      }
      if (p === '/api/settings' && req.method === 'PUT') {
        if (!admin) { const b0 = await readJson(req, 65536); for (const k of Object.keys(b0)) if (!OPERATOR_SETTINGS.has(k)) return needAdmin(); req._body = b0; }
        const b = req._body || await readJson(req);
        db.settings = cleanSettings({ ...db.settings, ...b });
        save(); broadcast();
        if (global.panouDesktop && b.display !== undefined) global.panouDesktop.moveTo(db.settings.display);
        return reply(res, 200, { ok: true });
      }
      if (p === '/api/live' && req.method === 'POST') {
        const b = await readJson(req);
        const item = b.item ? cleanItem(b.item) : null;
        db.live = item ? { ...item, liveId: newId(), loop: !!b.loop } : null;
        save(); broadcast();
        return reply(res, 200, { ok: true });
      }
      if (p === '/api/control' && req.method === 'POST') {   // următorul / înapoi / negru
        const b = await readJson(req, 4096);
        if (['next', 'prev', 'black', 'show'].includes(b.cmd)) send('control', { cmd: b.cmd }, true);
        if (b.cmd === 'black' || b.cmd === 'show') { db.black = b.cmd === 'black'; save(); broadcast(); }
        return reply(res, 200, { ok: true });
      }
      if (p === '/api/upload' && req.method === 'POST') {
        const orig = str(decodeURIComponent(req.headers['x-filename'] || 'fisier'), 200);
        const ext = path.extname(orig).toLowerCase();
        const kind = kindOf(ext);
        if (!kind) return reply(res, 400, { error: `Fișierul „${orig}” nu poate fi afișat direct. Din PowerPoint/Word salvează ca PDF sau video, apoi încarcă-l.` });
        const name = Date.now() + '-' + newId() + ext;
        const dest = path.join(UPLOADS, name);
        const out = fs.createWriteStream(dest);
        let size = 0, aborted = false;
        req.on('data', (c) => { size += c.length; if (size > MAX_UPLOAD && !aborted) { aborted = true; out.destroy(); fs.unlink(dest, () => {}); reply(res, 413, { error: 'Fișier prea mare (max 1 GB)' }); req.destroy(); } });
        req.pipe(out);
        out.on('finish', () => { if (!aborted) reply(res, 200, { url: '/uploads/' + name, type: kind }); });
        return;
      }
      if (p === '/api/yt-title' && req.method === 'GET') {
        try {
          const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url.searchParams.get('url') || ''));
          const j = r.ok ? await r.json() : {};
          return reply(res, 200, { title: j.title || '', thumb: j.thumbnail_url || '' });
        } catch { return reply(res, 200, { title: '' }); }
      }

      if (p === '/api/me' && req.method === 'GET') return reply(res, 200, { role: sess.role, local: isLocal(req), version: VERSION, initial: admin && db.auth.initial ? true : false, operatorSet: !!db.auth.operator });
      if (p === '/api/password' && req.method === 'POST') {   // parola administratorului
        const b = await readJson(req, 4096);
        const np = String(b.pin || '').trim();
        const bad = passProblem(np, 6);
        if (bad) return reply(res, 400, { error: bad });
        db.auth.admin = hashPass(np); db.auth.initial = null;
        db.auth.strong = np.length >= 10 && /[a-z]/i.test(np) && /\d/.test(np);
        const h = sha(req.headers['x-token'] || '');
        db.sessions = db.sessions.filter((x) => x.h === h);   // ceilalți trebuie să se autentifice din nou
        save();
        return reply(res, 200, { ok: true });
      }
      if (p === '/api/operator-pin' && req.method === 'POST') {   // PIN pentru operator (opțional)
        const b = await readJson(req, 4096);
        if (b.pin === null) { db.auth.operator = null; db.sessions = db.sessions.filter((x) => x.role !== 'operator'); save(); return reply(res, 200, { ok: true }); }
        const np = String(b.pin || '').trim();
        const bad = passProblem(np, 4);
        if (bad) return reply(res, 400, { error: bad });
        if (passOk(np, db.auth.admin)) return reply(res, 400, { error: 'PIN-ul operatorului trebuie să fie diferit de parola administratorului.' });
        db.auth.operator = hashPass(np); save();
        return reply(res, 200, { ok: true });
      }
      if (p === '/api/info' && req.method === 'GET') return reply(res, 200, { initialPin: db.auth.initial, port: PORT, addresses: addresses() });
      if (p === '/api/health' && req.method === 'GET') return reply(res, 200, health());
      if (p === '/api/update' && req.method === 'GET') return reply(res, 200, await updateInfo());
      if (p === '/api/update' && req.method === 'POST') {
        const b = await readJson(req, 4096);
        const d = global.panouDesktop;
        if (!d || !d.updateAction) return reply(res, 400, { error: 'Actualizarea automată merge doar în aplicația instalată.' });
        const r = d.updateAction(String(b.action || ''));
        return reply(res, r.ok ? 200 : 400, r.ok ? { ok: true } : { error: b.action === 'install' ? 'Nu există încă o actualizare descărcată.' : 'Nu se poate verifica acum.' });
      }
      if (p === '/api/remote' && req.method === 'GET') return reply(res, 200, await remoteStatus());
      if (p === '/api/remote' && req.method === 'POST') {
        const b = await readJson(req, 4096);
        if (b.mode === 'install') return reply(res, 200, await tsInstall(isLocal(req)));
        return reply(res, 200, await remoteSet(String(b.mode || ''), !!b.confirm));
      }
      // ecrane (doar în aplicația desktop)
      if (p === '/api/displays' && req.method === 'GET') {
        const d = global.panouDesktop;
        return reply(res, 200, { desktop: !!d, displays: d ? d.list() : [], selected: db.settings.display });
      }
      if (p === '/api/identify' && req.method === 'POST') {
        if (global.panouDesktop) global.panouDesktop.identify();
        send('identify', {}, true);
        return reply(res, 200, { ok: true });
      }

      if (p === '/api/ai-keys' && req.method === 'PUT') {
        const b = await readJson(req, 8192);
        const cur = db.secrets.ai || {};
        const nx = { ...cur };
        for (const k of ['anthropicKey', 'openaiKey', 'claudeModel', 'imageModel']) {
          if (b[k] === null) delete nx[k];
          else if (typeof b[k] === 'string' && b[k].trim()) nx[k] = b[k].trim().slice(0, 300);
        }
        db.secrets.ai = nx; save(); broadcast();
        return reply(res, 200, { ok: true });
      }
      if (p === '/api/ai/design' && req.method === 'POST') {   // AI Studio: generează sau modifică (întoarce codul, nu salvează)
        const b = await readJson(req, 1048576);
        const prompt = str(b.prompt, 4000).trim();
        if (!prompt) return reply(res, 400, { error: 'Scrie ce vrei să facă AI-ul.' });
        let base = '';
        if (b.base) { const sb = sanitizeSvg(b.base); if (!sb.ok) return reply(res, 400, { error: sb.error }); base = sb.svg; }
        try { return reply(res, 200, { svg: await aiDesignSvg(prompt, base) }); } catch (e) { return reply(res, 400, { error: e.message }); }
      }
      if (p === '/api/ai/check' && req.method === 'POST') {    // verifică și curăță codul editat manual
        const b = await readJson(req, 1048576);
        const r = sanitizeSvg(b.svg);
        return reply(res, r.ok ? 200 : 400, r.ok ? { svg: r.svg, changed: r.svg !== String(b.svg).trim() } : { error: r.error });
      }
      if (p === '/api/ai/save' && req.method === 'POST') {
        const b = await readJson(req, 1048576);
        const r = sanitizeSvg(b.svg);
        if (!r.ok) return reply(res, 400, { error: r.error });
        return reply(res, 200, saveDesign(r.svg, str(b.designId, 40), str(b.prompt, 500), str(b.title, 120)));
      }
      if (p.startsWith('/api/ai/designs/') && req.method === 'GET') {
        const d = (db.designs || {})[p.slice(16)];
        return d ? reply(res, 200, d) : reply(res, 404, { error: 'Design negăsit' });
      }
      if (p === '/api/ai/generate' && req.method === 'POST') {
        const b = await readJson(req, 16384);
        const prompt = str(b.prompt, 4000).trim();
        if (!prompt) return reply(res, 400, { error: 'Scrie ce vrei să apară pe panou.' });
        try { return reply(res, 200, b.kind === 'photo' ? await aiImage(prompt) : await aiDesign(prompt)); }
        catch (e) { return reply(res, 400, { error: e.message }); }
      }
      // conturi
      if (p === '/api/accounts' && req.method === 'PUT') {
        const b = await readJson(req, 8192);
        for (const prov of ['youtube', 'canva']) {
          if (!b[prov]) continue;
          const cur = db.secrets[prov] || {};
          const id = str(b[prov].clientId, 300).trim(), sec = str(b[prov].clientSecret, 300).trim();
          if (b[prov].disconnect) db.secrets[prov] = { clientId: cur.clientId, clientSecret: cur.clientSecret };
          else db.secrets[prov] = { ...cur, ...(id ? { clientId: id } : {}), ...(sec ? { clientSecret: sec } : {}) };
        }
        save(); broadcast();
        return reply(res, 200, { ok: true });
      }
      if (p === '/api/youtube/list' && req.method === 'GET') {
        return reply(res, 200, { items: await ytList(url.searchParams.get('tab') || 'mine', url.searchParams.get('id') || '') });
      }
      if (p === '/api/canva/designs' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '', cont = url.searchParams.get('continuation') || '';
        const j = await canva('designs?' + new URLSearchParams({ ...(q ? { query: q } : {}), ...(cont ? { continuation: cont } : {}), sort_by: 'modified_descending' }));
        return reply(res, 200, { continuation: j.continuation || '', items: (j.items || []).map((d) => ({ id: d.id, title: d.title || 'Fără titlu', thumb: d.thumbnail?.url || '', pages: d.page_count || 1 })) });
      }
      if (p === '/api/canva/import' && req.method === 'POST') {
        const b = await readJson(req, 8192);
        const format = b.format === 'mp4' ? 'mp4' : 'png';
        const urls = await canvaExport(str(b.designId, 100), format);
        return reply(res, 200, { files: urls.map((u, i) => ({ url: u, page: i + 1, type: format === 'mp4' ? 'video' : 'image' })) });
      }
      if (p === '/api/canva/edit-url' && req.method === 'GET') {
        const j = await canva('designs/' + encodeURIComponent(url.searchParams.get('id') || ''));
        return reply(res, 200, { url: j.design?.urls?.edit_url || '' });
      }
      if (p === '/api/canva/refresh' && req.method === 'POST') {   // după editare în Canva: re-exportă și actualizează slide-urile
        const b = await readJson(req, 8192);
        const designId = str(b.designId, 100);
        const its = db.items.filter((i) => i.canva?.designId === designId);
        if (!its.length) return reply(res, 404, { error: 'Nu există slide-uri din acest design' });
        const format = its[0].canva.format;
        const urls = await canvaExport(designId, format);
        for (const it of its) { const u = urls[(it.canva.page || 1) - 1]; if (u) it.url = u; }
        save(); broadcast();
        return reply(res, 200, { ok: true, updated: its.length });
      }
      return reply(res, 404, { error: 'necunoscut' });
    }

    // ---- fișiere ----
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (p === '/vendor/pdf.min.js' || p === '/vendor/pdf.worker.min.js') {
        try { return serveFile(req, res, require.resolve('pdfjs-dist/build/' + p.slice(8)), 'public, max-age=86400'); }
        catch { return reply(res, 404, 'lipsă', 'text/plain'); }
      }
      if (p.startsWith('/uploads/')) {
        const f = inside(UPLOADS, decodeURIComponent(p.slice('/uploads/'.length)));
        return f ? serveFile(req, res, f, 'public, max-age=86400') : reply(res, 403, 'interzis', 'text/plain');
      }
      const f = inside(PUB, decodeURIComponent(p));
      return f ? serveFile(req, res, f, p.endsWith('.html') ? 'no-store' : 'public, max-age=300') : reply(res, 403, 'interzis', 'text/plain');
    }
    reply(res, 405, 'metodă nepermisă', 'text/plain');
  } catch (e) {
    if (!res.headersSent) reply(res, 400, { error: String(e.message || e) });
  }
});

function addresses() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}
function start(cb) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n  AFIȘARE DRUȚU pornit');
    console.log(`  Ecran panou:  http://localhost:${PORT}/player.html`);
    console.log(`  Control:      http://localhost:${PORT}/`);
    for (const ip of addresses()) console.log(`  Din rețea:    http://${ip}:${PORT}/`);
    console.log(db.auth.initial ? `  PIN:          ${db.auth.initial}\n` : '  Parolă:       setată de administrator\n');
    cb && cb();
  });
}
module.exports = { state: () => ({ live: !!db.live, black: !!db.black }), start, PORT, initialPin: () => db.auth.initial, localAdminToken, addresses, settings: () => db.settings, health, beatAge: () => (status.lastBeat ? Date.now() - status.lastBeat : null), VERSION };
if (require.main === module) start();
