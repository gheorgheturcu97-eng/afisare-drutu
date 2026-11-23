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
fs.mkdirSync(UPLOADS, { recursive: true });

// ---------- utilitare ----------
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
    pin: String(crypto.randomInt(100000, 1000000)),
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
if (process.env.PANOU_PIN) db.pin = String(process.env.PANOU_PIN);
db.secrets = db.secrets || {};
db.settings = cleanSettings(db.settings || {});
db.items = (db.items || []).map(cleanItem).filter(Boolean);
save();

function save() {
  fs.writeFileSync(DATA + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(DATA + '.tmp', DATA);
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
    source: ['upload', 'canva', 'youtube', 'link', 'text'].includes(i.source) ? i.source : 'link',
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
const status = { now: '', nowId: '', players: 0 };
function publicState() {
  const s = db.secrets;
  return {
    settings: db.settings, items: db.items, live: db.live, black: !!db.black, status: { ...status },
    integrations: {
      youtube: { configured: !!(s.youtube?.clientId && s.youtube?.clientSecret), connected: !!s.youtube?.refresh, channel: s.youtube?.channel || '' },
      canva: { configured: !!(s.canva?.clientId && s.canva?.clientSecret), connected: !!s.canva?.refresh },
    },
    desktop: !!global.panouDesktop,
  };
}
const clients = new Set();
function send(ev, data, onlyPlayers) {
  const msg = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) if (!onlyPlayers || c.player) c.res.write(msg);
}
function broadcast() { send('state', publicState()); }
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25000);

// ---------- PIN ----------
const fails = new Map();
function ipOf(req) { return (req.socket.remoteAddress || '').replace('::ffff:', ''); }
function locked(ip) { const f = fails.get(ip); return f && f.until > Date.now(); }
function checkPin(req, pin) {
  const ip = ipOf(req);
  if (locked(ip)) return false;
  const a = Buffer.from(String(pin || '')), b = Buffer.from(db.pin);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (ok) fails.delete(ip);
  else { const f = fails.get(ip) || { n: 0, until: 0 }; if (++f.n >= 8) { f.until = Date.now() + 600000; f.n = 0; } fails.set(ip, f); }
  return ok;
}

// ---------- HTTP ----------
function reply(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
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
    if (err || !st.isFile()) return reply(res, 404, 'negăsit', 'text/plain');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache };
    if (type === 'image/svg+xml') head['Content-Security-Policy'] = "script-src 'none'";
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
  const p = url.pathname;
  try {
    if (p === '/') return redirect(res, '/app.html');

    // ---- public: ecranul panoului ----
    if (p === '/api/state' && req.method === 'GET') return reply(res, 200, publicState(), undefined, { 'Access-Control-Allow-Origin': '*' });   // folosit și de aplicația iPhone ca test de conexiune
    if (p === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      const c = { res, player: url.searchParams.get('role') === 'player' };
      clients.add(c);
      if (c.player) { status.players++; broadcast(); }
      res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`);
      req.on('close', () => { clients.delete(c); if (c.player) { status.players--; if (!status.players) { status.now = ''; status.nowId = ''; } broadcast(); } });
      return;
    }
    if (p === '/api/now' && req.method === 'POST') {
      const b = await readJson(req, 4096);
      status.now = str(b.text, 200); status.nowId = str(b.id, 40);
      broadcast();
      return reply(res, 200, { ok: true });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const b = await readJson(req, 4096);
      if (locked(ipOf(req))) return reply(res, 429, { error: 'Prea multe încercări. Așteaptă 10 minute.' });
      return checkPin(req, b.pin) ? reply(res, 200, { ok: true }) : reply(res, 401, { error: 'PIN greșit' });
    }

    // ---- OAuth (se pornește din aplicație, cu PIN în adresă) ----
    if (p === '/oauth/youtube/start' || p === '/oauth/canva/start') {
      if (!checkPin(req, url.searchParams.get('pin'))) return reply(res, 401, 'PIN greșit', 'text/plain; charset=utf-8');
      const provider = p.includes('youtube') ? 'youtube' : 'canva';
      const cfg = db.secrets[provider];
      if (!cfg?.clientId) return reply(res, 400, 'Întâi completează Client ID și Client Secret în Setări → Conturi.', 'text/plain; charset=utf-8');
      const state = b64url(crypto.randomBytes(16));
      const redirectUri = originOf(req) + '/oauth/' + provider + '/callback';
      const verifier = b64url(crypto.randomBytes(48));
      oauthStates.set(state, { provider, verifier, redirectUri, at: Date.now() });
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
      if (!st || !code || Date.now() - st.at > 600000) return reply(res, 400, 'Conectarea a expirat sau a fost refuzată. Încearcă din nou din aplicație.', 'text/plain; charset=utf-8');
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
      return redirect(res, '/app.html#conectat-' + st.provider);
    }

    // ---- de aici: doar cu PIN ----
    if (p.startsWith('/api/')) {
      if (!checkPin(req, req.headers['x-pin'])) return reply(res, 401, { error: 'PIN greșit' });

      if (p === '/api/items' && req.method === 'PUT') {
        const b = await readJson(req);
        if (!Array.isArray(b.items)) return reply(res, 400, { error: 'items lipsă' });
        db.items = b.items.slice(0, 2000).map(cleanItem).filter(Boolean);
        save(); broadcast();
        return reply(res, 200, { ok: true });
      }
      if (p === '/api/settings' && req.method === 'PUT') {
        const b = await readJson(req);
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

      if (p === '/api/info' && req.method === 'GET') return reply(res, 200, { pin: db.pin, port: PORT, addresses: addresses() });
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
    console.log(`  PIN:          ${db.pin}\n`);
    cb && cb();
  });
}
module.exports = { start, PORT, pin: () => db.pin, addresses, settings: () => db.settings };
if (require.main === module) start();
