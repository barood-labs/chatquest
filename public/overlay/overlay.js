const $ = (id) => document.getElementById(id);
const FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];
function render(s) {
  if (!s.quest) return;
  $('card').classList.remove('hidden');
  $('title').textContent = s.quest.title;
  $('fill').style.width = `${(100 * s.quest.progress) / s.quest.goal}%`;
  $('progress').textContent = `${s.quest.progress} / ${s.quest.goal}`;
  $('heroes').textContent = s.contributors;
}
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'roll') {
      $('dice').innerHTML = `<span class="die">${FACES[m.die - 1]}</span> ${m.user} rolled ${m.die}`;
    }
    if (m.type === 'complete') {
      render(m);
      $('title').textContent = `✅ ${m.quest.title} complete!`;
      setTimeout(() => $('card').classList.add('hidden'), 6000);
      return;
    }
    render(m);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();
