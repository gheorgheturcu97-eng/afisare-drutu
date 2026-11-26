// Afișare Druțu — aplicația desktop (Windows / macOS).
// Pornește serverul, pune ecranul panoului pe monitorul ales (pe tot ecranul) și deschide aplicația de control.
// Stabilitate: paza ecranului (repornire automată dacă se blochează), paznic independent, actualizări automate.
const { app, BrowserWindow, screen, Tray, Menu, nativeImage, powerSaveBlocker, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');   // video cu sunet fără click
process.env.PANOU_DATA = app.getPath('userData');                                // playlist + fișiere încărcate

const DATA = app.getPath('userData');
const LOG = path.join(DATA, 'app.log');
const STOP = path.join(DATA, 'oprit-intentionat');
function log(m) { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); if (fs.statSync(LOG).size > 2e6) fs.renameSync(LOG, LOG + '.old'); } catch {} }
process.on('uncaughtException', (e) => log('eroare: ' + (e && e.stack || e)));      // nu lăsăm o eroare să oprească panoul
process.on('unhandledRejection', (e) => log('eroare (promise): ' + (e && e.stack || e)));

const server = require('../server.js');
const URL = `http://localhost:${server.PORT}`;
const ICON = path.join(__dirname, '..', 'public', 'icon-512.png');
let player = null, control = null, tray = null, quitting = false;

// ---------- ecrane ----------
function displays() {
  const prim = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays()
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d) => ({ id: String(d.id), w: d.size.width, h: d.size.height, primary: d.id === prim, bounds: d.bounds }));
}
function targetDisplay() {
  const list = displays();
  const chosen = server.settings().display;
  return list.find((d) => d.id === chosen)                  // ecranul ales în aplicație
    || list.find((d) => !d.primary)                         // altfel: ecranul secundar (de obicei HDMI spre panou)
    || list[0];
}
function displayInfo() {
  const list = displays(), chosen = server.settings().display, t = targetDisplay();
  return {
    count: list.length,
    chosenMissing: !!chosen && !list.some((d) => d.id === chosen),
    onPrimary: !!(t && t.primary && list.length > 1),
    onlyPrimary: list.length === 1,
    target: t ? `${t.w}×${t.h}${t.primary ? ' (principal)' : ''}` : '',
  };
}
function placePlayer() {
  if (!player || player.isDestroyed()) return;
  const d = targetDisplay();
  player.setFullScreen(false);
  player.setBounds(d.bounds);
  player.setFullScreen(true);
}
function openPlayer() {
  const d = targetDisplay();
  player = new BrowserWindow({
    ...d.bounds, frame: false, show: false, backgroundColor: '#000000', title: 'Afișare Druțu — ecran',
    skipTaskbar: true, autoHideMenuBar: true, fullscreenable: true,
    webPreferences: { backgroundThrottling: false },
  });
  player.loadURL(URL + '/player.html');
  player.once('ready-to-show', () => { player.show(); placePlayer(); });
  player.webContents.on('render-process-gone', (_e, det) => { log('ecranul s-a oprit: ' + det.reason); restartPlayer('proces grafic oprit'); });
  player.webContents.on('did-fail-load', () => setTimeout(() => player && !player.isDestroyed() && player.reload(), 3000));
  let hang = null;
  player.on('unresponsive', () => { hang = setTimeout(() => restartPlayer('blocat'), 20000); });
  player.on('responsive', () => clearTimeout(hang));
  player.on('closed', () => { player = null; if (!quitting) setTimeout(() => !player && openPlayer(), 2000); });   // nu rămâne niciodată fără ecran
}
let restarting = false;
function restartPlayer(why) {
  if (restarting) return; restarting = true;
  log('repornesc ecranul: ' + why);
  const old = player; player = null;
  try { if (old && !old.isDestroyed()) { old.removeAllListeners('closed'); old.destroy(); } } catch {}
  setTimeout(() => { restarting = false; if (!player) openPlayer(); }, 1500);
}
// paza ecranului: playerul trimite „semn de viață” la 10 s
let reloads = 0;
setInterval(() => {
  if (!player || player.isDestroyed() || restarting) return;
  const age = server.beatAge();
  if (age == null) return;                        // încă nu a pornit
  if (age > 120000 || reloads >= 2) { reloads = 0; return restartPlayer('fără semn de viață ' + Math.round(age / 1000) + ' s'); }
  if (age > 45000) { reloads++; log('reîncarc ecranul (fără semn de viață)'); player.reload(); }
  else reloads = 0;
}, 15000);

function identify() {
  for (const [i, d] of displays().entries()) {
    const w = new BrowserWindow({ ...d.bounds, frame: false, transparent: true, alwaysOnTop: true, focusable: false, skipTaskbar: true });
    const html = `<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:rgba(15,23,42,.85);color:#fff;font:900 30vh system-ui">${i + 1}</body>`;
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    setTimeout(() => !w.isDestroyed() && w.close(), 4000);
  }
}
function metrics() {
  const m = app.getAppMetrics();
  return { cpu: Math.round(m.reduce((s, x) => s + (x.cpu?.percentCPUUsage || 0), 0)), memMB: Math.round(m.reduce((s, x) => s + (x.memory?.workingSetSize || 0), 0) / 1024) };
}

// ---------- actualizări automate (GitHub Releases) ----------
const upd = { state: 'idle', version: '', percent: 0, error: '', auto: process.platform === 'win32' && app.isPackaged };
let updater = null;
function backupData(tag) {
  try {
    const dir = path.join(DATA, 'backup'); fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(DATA, 'data.json'), path.join(dir, `data-${server.VERSION}-inainte-de-${tag}-${Date.now()}.json`));
    const all = fs.readdirSync(dir).filter((f) => f.startsWith('data-')).sort();
    for (const f of all.slice(0, -10)) fs.unlinkSync(path.join(dir, f));   // păstrăm ultimele 10
  } catch (e) { log('backup eșuat: ' + e.message); }
}
function setupUpdater() {
  if (!upd.auto) return;
  try { updater = require('electron-updater').autoUpdater; } catch (e) { log('updater indisponibil: ' + e.message); upd.auto = false; return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.on('checking-for-update', () => { upd.state = 'checking'; });
  updater.on('update-not-available', () => { upd.state = 'latest'; });
  updater.on('update-available', (i) => { upd.state = 'downloading'; upd.version = i.version; upd.percent = 0; log('versiune nouă: ' + i.version); });
  updater.on('download-progress', (p) => { upd.state = 'downloading'; upd.percent = Math.round(p.percent); });
  updater.on('update-downloaded', (i) => { upd.state = 'ready'; upd.version = i.version; upd.percent = 100; log('descărcat: ' + i.version); });
  updater.on('error', (e) => { upd.state = 'error'; upd.error = String(e && e.message || e).slice(0, 300); log('updater: ' + upd.error); });
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 30000);
  setInterval(check, 4 * 3600e3);
  // instalare automată doar într-un moment sigur: noaptea (3–5) sau când panoul e oprit, și niciodată în timpul unei redări „acum”
  setInterval(() => {
    if (upd.state !== 'ready') return;
    const h = new Date().getHours(), st = server.state ? server.state() : {};
    const safe = !st.live && (st.black || st.closed || (h >= 3 && h < 5));
    if (safe) installUpdate('automat');
  }, 5 * 60000);
}
function installUpdate(how) {
  if (!updater || upd.state !== 'ready') return false;
  log('instalez actualizarea ' + upd.version + ' (' + how + ')');
  backupData('v' + upd.version);
  quitting = true;
  stopWatchdog(true);
  setImmediate(() => updater.quitAndInstall(true, true));   // instalare silențioasă + repornire
  return true;
}
// verificare după actualizare
function afterUpdateCheck() {
  try {
    const f = path.join(DATA, 'versiune.txt');
    const prev = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
    if (prev && prev !== server.VERSION) { upd.justUpdated = { from: prev, to: server.VERSION }; log(`actualizat ${prev} → ${server.VERSION}`); }
    fs.writeFileSync(f, server.VERSION);
  } catch {}
}

global.panouDesktop = {
  list: () => displays().map(({ bounds, ...d }) => d),
  moveTo: () => placePlayer(),
  identify,
  openPath: (f) => shell.openPath(f),
  metrics,
  displayInfo,
  update: () => ({ ...upd }),
  updateAction: (a) => {
    if (a === 'check') { if (updater) updater.checkForUpdates().catch(() => {}); return { ok: !!updater }; }
    if (a === 'install') return { ok: installUpdate('manual') };
    return { ok: false };
  },
};

// ---------- paznic independent ----------
let dog = null;
function startWatchdog() {
  try { fs.rmSync(STOP, { force: true }); } catch {}
  const args = process.argv.slice(1).filter((a) => !a.startsWith('--inspect'));   // aceleași argumente ca la pornire
  dog = spawn(process.execPath, [path.join(__dirname, 'watchdog.js'), String(process.pid), String(server.PORT), STOP, process.execPath, ...args],
    { detached: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true });
  dog.unref();
}
function stopWatchdog(temporarily) {
  try { if (!temporarily) fs.writeFileSync(STOP, new Date().toISOString()); } catch {}
  try { dog && dog.kill(); } catch {}
}

// ---------- control ----------
function openControl() {
  if (control) { control.show(); control.focus(); return; }
  const prim = screen.getPrimaryDisplay().workArea;
  control = new BrowserWindow({ width: Math.min(1100, prim.width), height: Math.min(860, prim.height), x: prim.x + 40, y: prim.y + 40,
    title: 'Afișare Druțu', icon: ICON, backgroundColor: '#0b0c10', autoHideMenuBar: true });
  control.loadURL(URL + '/app.html#t=' + encodeURIComponent(server.localAdminToken()));   // pe PC-ul panoului intră direct
  control.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });   // linkuri externe în browser
  control.on('closed', () => { control = null; });
}

app.on('second-instance', openControl);
app.on('window-all-closed', () => { /* rămâne pornit în bara de sistem */ });
app.on('before-quit', () => { quitting = true; });
app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true });          // pornește singur cu Windows / macOS (și după o pană de curent)
  powerSaveBlocker.start('prevent-display-sleep');          // ecranul nu intră în standby
  afterUpdateCheck();
  server.start(() => {
    openPlayer(); openControl();
    startWatchdog(); setupUpdater();
    const img = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
    tray = new Tray(img);
    let shown = null;
    const buildTray = () => {
      const pin = server.initialPin();
      const key = String(pin) + upd.state;
      if (key === shown) return; shown = key;
      tray.setToolTip(pin ? `Afișare Druțu · PIN ${pin}` : 'Afișare Druțu');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Deschide aplicația de control', click: openControl },
        { label: 'Reîncarcă ecranul panoului', click: () => player ? player.reload() : openPlayer() },
        { label: pin ? `PIN: ${pin}` : 'Parolă: setată de administrator', enabled: false },
        ...server.addresses().map((ip) => ({ label: `Din telefon: http://${ip}:${server.PORT}`, enabled: false })),
        ...(upd.state === 'ready' ? [{ label: `Instalează actualizarea ${upd.version}`, click: () => installUpdate('meniu') }] : []),
        { type: 'separator' },
        { label: 'Ieșire (oprește panoul)', click: () => { quitting = true; stopWatchdog(); app.exit(0); } },
      ]));
    };
    buildTray(); setInterval(buildTray, 3000);
    tray.on('click', openControl);
  });
  screen.on('display-added', placePlayer);
  screen.on('display-removed', placePlayer);
  screen.on('display-metrics-changed', placePlayer);
});
