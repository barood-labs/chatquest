const $ = (id) => document.getElementById(id);
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const REASON_COPY = {
  follow: (u, n) => `💜 ${u} followed · +${n}`,
  subscribe: (u, n) => `⭐ ${u} subscribed · +${n}`,
  raid: (u, n) => `🚨 ${u} raided · +${n}`,
  start: (u) => (u ? `🎬 ${u} started a quest` : '🎬 Quest started'),
  boost: (u, n) => `⚡ ${u} · +${n}`,
};

let soundOn = localStorage.getItem('chatquest.sound') !== '0';
let audioCtx = null;

function syncMute() {
  const btn = $('mute');
  btn.textContent = soundOn ? '🔊' : '🔇';
  btn.classList.toggle('off', !soundOn);
}
$('mute').onclick = () => {
  soundOn = !soundOn;
  localStorage.setItem('chatquest.sound', soundOn ? '1' : '0');
  syncMute();
  if (soundOn) beep(520, 0.05);
};
syncMute();

function beep(freq = 440, dur = 0.08, type = 'sine', gain = 0.04) {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.stop(audioCtx.currentTime + dur);
  } catch {
    /* autoplay / unsupported */
  }
}

function showToast(text, cls = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast ${cls}`;
  requestAnimationFrame(() => el.classList.remove('hidden'));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), 3200);
}

function burst(color = '#00e5ff', n = 48) {
  const c = $('fx');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const parts = Array.from({ length: n }, () => ({
    x: innerWidth * 0.2 + Math.random() * innerWidth * 0.25,
    y: innerHeight * 0.65,
    vx: (Math.random() - 0.5) * 8,
    vy: -4 - Math.random() * 8,
    life: 1,
    size: 2 + Math.random() * 4,
    color,
  }));
  let raf;
  const tick = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = false;
    for (const p of parts) {
      if (p.life <= 0) continue;
      alive = true;
      p.vy += 0.18;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.018;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    if (alive) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  };
  cancelAnimationFrame(raf);
  tick();
}

function renderParty(heroes = []) {
  const el = $('party');
  el.innerHTML = heroes
    .slice(0, 8)
    .map((h) => `<span class="chip" title="${h}">${h}</span>`)
    .join('');
  if (heroes.length > 8) {
    el.innerHTML += `<span class="chip">+${heroes.length - 8}</span>`;
  }
}

function render(s) {
  if (!s.quest) {
    $('card').classList.add('hidden');
    $('card').classList.remove('live');
    return;
  }
  const q = s.quest;
  $('card').classList.remove('hidden');
  $('card').classList.remove('complete');
  $('card').classList.add('live');
  $('card').dataset.type = q.type || 'combat';
  $('icon').textContent = q.icon || '🎲';
  $('type').textContent = q.type || 'quest';
  $('title').textContent = q.title;
  const pct = Math.min(100, (100 * q.progress) / Math.max(1, q.goal));
  $('fill').style.width = `${pct}%`;
  $('progress').textContent = `${q.progress} / ${q.goal}`;
  $('heroes').textContent = s.contributors ?? 0;
  renderParty(s.heroes || []);
}

function flashDie(user, die, crit) {
  const face = FACES[die - 1] || '🎲';
  $('dice').innerHTML = `<span class="die${crit ? ' crit' : ''}">${face}</span> ${user} rolled ${die}${crit ? ' · CRIT!' : ''}`;
  $('card').classList.remove('pulse');
  void $('card').offsetWidth;
  $('card').classList.add('pulse');
  beep(crit ? 880 : 420 + die * 40, crit ? 0.12 : 0.07, crit ? 'triangle' : 'sine');
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.type === 'roll') {
      flashDie(m.user, m.die, m.crit);
      render(m);
      return;
    }
    if (m.type === 'join') {
      $('dice').textContent = m.wasNew ? `${m.user} joined the party` : `${m.user} is already in`;
      if (m.wasNew) beep(360, 0.06);
      render(m);
      return;
    }
    if (m.type === 'boost') {
      const copy = REASON_COPY[m.reason] || REASON_COPY.boost;
      showToast(copy(m.user, m.amount), m.reason || '');
      $('dice').textContent = `${m.user} boosted +${m.amount} (${m.reason})`;
      beep(m.reason === 'raid' ? 240 : 600, 0.1, 'square', 0.03);
      render(m);
      return;
    }
    if (m.type === 'quest') {
      render(m);
      const starter = m.user ? REASON_COPY.start(m.user) : `${m.quest?.icon || '🎬'} ${m.quest?.title}`;
      showToast(starter, m.reason || 'start');
      $('dice').textContent = m.quest?.blurb || 'Type !join then !roll';
      beep(500, 0.1);
      return;
    }
    if (m.type === 'complete') {
      const title = (m.quest && m.quest.title) || 'Quest';
      $('card').classList.add('complete');
      $('title').textContent = `✅ ${title} complete!`;
      $('fill').style.width = '100%';
      showToast(`🏆 ${title} complete!`, 'complete');
      burst('#00e5ff', 64);
      burst('#9146ff', 32);
      beep(660, 0.08);
      setTimeout(() => beep(880, 0.12), 90);
      setTimeout(() => $('card').classList.add('hidden'), 6500);
      return;
    }
    if (m.type === 'stop') {
      $('dice').textContent = 'Quest ended';
      $('card').classList.add('hidden');
      return;
    }
    render(m);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();
