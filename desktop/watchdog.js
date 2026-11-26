// Afișare Druțu — paznic independent (proces separat).
// Dacă aplicația se închide neașteptat sau serverul nu mai răspunde, o pornește din nou.
// Nu face nimic dacă aplicația a fost oprită intenționat (din meniul „Ieșire”).
// Rulează cu: ELECTRON_RUN_AS_NODE=1 <exe> watchdog.js <pid> <port> <fișier-stop> <exe> [argumente...]
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const [pid, port, stopFile, exe, ...args] = process.argv.slice(2);
const log = (m) => { try { fs.appendFileSync(stopFile.replace(/[^\\/]+$/, 'watchdog.log'), new Date().toISOString() + ' ' + m + '\n'); } catch {} };
let bad = 0;

function alive() { try { process.kill(Number(pid), 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function stopped() { return fs.existsSync(stopFile); }
function ping() {
  return new Promise((res) => {
    const r = http.get({ host: '127.0.0.1', port: Number(port), path: '/api/ping', timeout: 8000 }, (x) => { x.resume(); res(x.statusCode === 200); });
    r.on('timeout', () => { r.destroy(); res(false); });
    r.on('error', () => res(false));
  });
}
function relaunch(why) {
  if (stopped()) return process.exit(0);
  log('repornesc aplicația: ' + why);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  spawn(exe, args, { detached: true, stdio: 'ignore', env, windowsHide: false }).unref();
  process.exit(0);
}

setTimeout(function loop() {
  (async () => {
    if (stopped()) return process.exit(0);
    if (!alive()) return relaunch('procesul principal nu mai există');
    if (await ping()) bad = 0;
    else if (++bad >= 4) {          // ~2 minute fără răspuns: aplicația e blocată
      try { process.kill(Number(pid)); } catch {}
      setTimeout(() => relaunch('serverul nu mai răspunde'), 5000);
      return;
    }
    setTimeout(loop, 30000);
  })();
}, 60000);   // lăsăm aplicația să pornească liniștită
