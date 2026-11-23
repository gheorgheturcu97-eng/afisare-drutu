// Afișare Druțu — aplicația desktop (Windows / macOS).
// Pornește serverul, pune ecranul panoului pe monitorul ales (pe tot ecranul) și deschide aplicația de control.
const { app, BrowserWindow, screen, Tray, Menu, nativeImage, powerSaveBlocker, shell } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');   // video cu sunet fără click
process.env.PANOU_DATA = app.getPath('userData');                                // playlist + fișiere încărcate

const server = require('../server.js');
const URL = `http://localhost:${server.PORT}`;
const ICON = path.join(__dirname, '..', 'public', 'icon-512.png');
let player = null, control = null, tray = null;

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
function placePlayer() {
  if (!player) return;
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
  player.webContents.on('render-process-gone', () => setTimeout(() => player && player.reload(), 2000));
  player.on('closed', () => { player = null; });
}
function identify() {
  for (const [i, d] of displays().entries()) {
    const w = new BrowserWindow({ ...d.bounds, frame: false, transparent: true, alwaysOnTop: true, focusable: false, skipTaskbar: true });
    const html = `<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:rgba(15,23,42,.85);color:#fff;font:900 30vh system-ui">${i + 1}</body>`;
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    setTimeout(() => !w.isDestroyed() && w.close(), 4000);
  }
}
global.panouDesktop = {
  list: () => displays().map(({ bounds, ...d }) => d),
  moveTo: () => placePlayer(),
  identify,
};

// ---------- control ----------
function openControl() {
  if (control) { control.show(); control.focus(); return; }
  const prim = screen.getPrimaryDisplay().workArea;
  control = new BrowserWindow({ width: Math.min(1100, prim.width), height: Math.min(860, prim.height), x: prim.x + 40, y: prim.y + 40,
    title: 'Afișare Druțu', icon: ICON, backgroundColor: '#070b1e', autoHideMenuBar: true });
  control.loadURL(URL + '/app.html#pin=' + server.pin());   // pe PC-ul panoului intră direct, fără PIN
  control.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });   // Canva/YouTube în browser
  control.on('closed', () => { control = null; });
}

app.on('second-instance', openControl);
app.on('window-all-closed', (e) => { /* rămâne pornit în bara de sistem */ });
app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true });          // pornește singur cu Windows / macOS
  powerSaveBlocker.start('prevent-display-sleep');          // ecranul nu intră în standby
  server.start(() => {
    openPlayer(); openControl();
    const img = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
    tray = new Tray(img);
    tray.setToolTip(`Afișare Druțu · PIN ${server.pin()}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Deschide aplicația de control', click: openControl },
      { label: 'Reîncarcă ecranul panoului', click: () => player ? player.reload() : openPlayer() },
      { label: `PIN: ${server.pin()}`, enabled: false },
      ...server.addresses().map((ip) => ({ label: `Din telefon: http://${ip}:${server.PORT}`, enabled: false })),
      { type: 'separator' },
      { label: 'Ieșire (oprește panoul)', click: () => { app.exit(0); } },
    ]));
    tray.on('click', openControl);
  });
  screen.on('display-added', placePlayer);
  screen.on('display-removed', placePlayer);
  screen.on('display-metrics-changed', placePlayer);
});
