const $ = (id) => document.getElementById(id);
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function render(s) {
  if (!s.quest) {
    $('card').classList.add('hidden');
    return;
  }
  $('card').classList.remove('hidden');
  $('card').classList.remove('complete');
  $('title').textContent = s.quest.title;
  const pct = Math.min(100, (100 * s.quest.progress) / Math.max(1, s.quest.goal));
  $('fill').style.width = `${pct}%`;
  $('progress').textContent = `${s.quest.progress} / ${s.quest.goal}`;
  $('heroes').textContent = s.contributors ?? 0;
}

function flashDie(user, die) {
  const face = FACES[die - 1] || '🎲';
  $('dice').innerHTML = `<span class="die">${face}</span> ${user} rolled ${die}`;
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
      flashDie(m.user, m.die);
      render(m);
      return;
    }
    if (m.type === 'join') {
      $('dice').textContent = m.wasNew ? `${m.user} joined the party` : `${m.user} is already in`;
      render(m);
      return;
    }
    if (m.type === 'complete') {
      render(m);
      $('card').classList.add('complete');
      $('title').textContent = `✅ ${(m.quest && m.quest.title) || 'Quest'} complete!`;
      setTimeout(() => $('card').classList.add('hidden'), 6000);
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
