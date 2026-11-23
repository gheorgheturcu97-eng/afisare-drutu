// Cod comun pentru aplicația de control și ecranul panoului.
(function (g) {
  const GRADIENTS = {
    g0: 'linear-gradient(135deg, #dc2626, #be185d 60%, #4c0519)',   // roșu promo
    g1: 'linear-gradient(135deg, #f59e0b, #ea580c 60%, #7c2d12)',   // portocaliu
    g2: 'linear-gradient(135deg, #0f766e, #134e4a 60%, #042f2e)',   // smarald
    g3: 'linear-gradient(135deg, #2563eb, #0891b2 60%, #064e3b)',   // ocean
    g4: 'linear-gradient(135deg, #6366f1, #7c3aed 55%, #1e1b4b)',   // violet
    g5: 'linear-gradient(135deg, #f59e0b, #db2777 60%, #7c3aed)',   // apus
    g6: 'linear-gradient(135deg, #111827, #000000)',                // negru
    g7: 'linear-gradient(135deg, #facc15, #eab308)',                // galben
  };
  const bgOf = (bg) => GRADIENTS[bg] || bg || GRADIENTS.g4;

  function ytId(u) {
    const m = String(u || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  function ytListId(u) {
    const m = String(u || '').match(/[?&]list=([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : null;
  }
  const mins = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
  function inRange(from, to, now) { const a = mins(from), b = mins(to); return a <= b ? now >= a && now < b : now >= a || now < b; }
  const dayIdx = (d) => (d.getDay() + 6) % 7;   // 0 = luni ... 6 = duminică
  const isoDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  // e programat elementul în ziua d (fără oră)?
  function onDay(it, d) {
    if (it.enabled === false) return false;
    if (it.until && isoDate(d) > it.until) return false;
    return !it.days || !!it.days[dayIdx(d)];
  }
  // e programat acum (zi + oră)?
  function activeAt(it, d) {
    if (!onDay(it, d)) return false;
    if (it.allDay !== false) return true;
    return inRange(it.from || '00:00', it.to || '23:59', d.getHours() * 60 + d.getMinutes());
  }
  // panoul e în programul de funcționare?
  function panelOpen(settings, d) {
    const h = settings && settings.hours;
    if (!h || !h.enabled) return true;
    const now = d.getHours() * 60 + d.getMinutes();
    const t = h.days[dayIdx(d)], y = h.days[(dayIdx(d) + 6) % 7];
    if (y && y.on && mins(y.from) > mins(y.to) && now < mins(y.to)) return true;   // program peste miezul nopții
    if (!t || !t.on) return false;
    if (mins(t.from) > mins(t.to)) return now >= mins(t.from);
    return inRange(t.from, t.to, now);
  }
  const isVideo = (it) => it.type === 'video' || it.type === 'youtube' || it.type === 'ytlist';
  // durata în secunde pentru afișare în listă (null = până se termină videoul)
  function shownSeconds(it, settings) {
    if (it.duration > 0) return it.duration;
    if (isVideo(it)) return null;
    return (settings && settings.imageSeconds) || 10;
  }
  g.Panou = { GRADIENTS, bgOf, ytId, ytListId, mins, inRange, dayIdx, isoDate, onDay, activeAt, panelOpen, isVideo, shownSeconds };
})(window);
