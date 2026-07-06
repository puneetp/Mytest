/* ============================================================================
 * app.js  —  Ties everything together: builds the UI, runs the animation loop,
 * updates the glowing trails, plays little sounds, and connects every button.
 * ==========================================================================*/

(function (global) {
  'use strict';
  const MZ = global.MZ;

  /* ------------------------------- Sound --------------------------------- */
  // Tiny built-in beeps (no audio files needed). Can be muted.
  const Sound = {
    ctx: null, muted: false,
    _ac() { if (!this.ctx) this.ctx = new (global.AudioContext || global.webkitAudioContext)(); return this.ctx; },
    blip(freq, dur = 0.08, type = 'sine', vol = 0.2) {
      if (this.muted) return;
      try {
        const ac = this._ac();
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.value = vol;
        o.connect(g); g.connect(ac.destination);
        const t = ac.currentTime;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.start(t); o.stop(t + dur);
      } catch (e) { /* audio not allowed yet */ }
    },
    fanfare() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.25), i * 120));
    },
  };

  /* ------------------------------- Setup --------------------------------- */
  const canvas = document.getElementById('stage');
  const renderer = new MZ.Renderer(canvas);
  const world = new MZ.World();
  const game = new MZ.Game(world);
  const editor = new MZ.Editor(game, renderer);
  editor.onChange = (level) => {
    document.getElementById('levelTitle').textContent = level.title;
    document.getElementById('blurb').textContent = 'Your own creation — press ▶ Play!';
    updateLavaControl();
  };

  const overrides = { gravity: null, bounce: null, friction: null, lavaRise: null };
  game.setOverrides(overrides);

  let running = false;    // is the animation loop stepping physics?
  let paused = false;

  /* --------------------------- Game events ------------------------------- */
  game.onEvent = (type, payload) => {
    if (type === 'countdown') Sound.blip(440 + (3 - payload) * 120, 0.1, 'square', 0.18);
    else if (type === 'go') Sound.blip(880, 0.2, 'square', 0.22);
    else if (type === 'eliminate') Sound.blip(140, 0.18, 'sawtooth', 0.18);
    else if (type === 'finish') Sound.blip(660, 0.12, 'sine', 0.2);
    else if (type === 'win') {
      Sound.fanfare();
      renderer.burstConfetti(payload.winner ? payload.winner.color : '#ffd54f');
    }
  };

  /* ---------------------------- Main loop -------------------------------- */
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 1 / 30); // clamp big gaps (tab switches)

    if (running && !paused) {
      game.update(dt);
      // update glowing trails
      if (game.state === 'running') {
        for (const m of world.marbles) {
          if (m.alive || m.finished) {
            m.trail.push({ x: m.pos.x, y: m.pos.y });
            if (m.trail.length > 20) m.trail.shift();
          }
        }
      }
    }
    renderer.draw(game);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ----------------------------- Controls -------------------------------- */
  const $ = (id) => document.getElementById(id);

  function loadLevel(level) {
    // Reset overrides so each level plays with its OWN authored physics.
    // A slider only takes over once the kid actually moves it.
    overrides.gravity = overrides.bounce = overrides.friction = overrides.lavaRise = null;
    game.load(level, overrides);
    world.timeScale = parseFloat($('speed').value);
    running = true; paused = false;   // loop renders; physics waits for GO
    // physics won't move until start() → countdown → running
    syncSlidersToLevel();
    updateLavaControl();
    $('levelTitle').textContent = level.title;
    $('blurb').textContent = level.blurb || 'Build something and press Play!';
  }

  // Make the sliders show this level's real numbers (so what the kid sees is true).
  function setSlider(id, val) {
    const el = $(id); if (!el) return;
    el.value = val;
    const out = $(id + 'Val'); if (out) out.textContent = el.value;
  }
  function syncSlidersToLevel() {
    setSlider('gravity', Math.round(world.gravity.y));
    const m = world.marbles[0];
    if (m) { setSlider('bounce', m.restitution); setSlider('friction', m.friction); }
    if (game.lavaCfg) setSlider('lava', game.lavaCfg.rise);
  }

  function startRun() {
    // resume audio on first user gesture
    try { Sound._ac().resume(); } catch (e) {}
    if (game.state === 'finished' || game.state === 'idle') game.reset();
    editor.setTool('none');
    highlightTool('none');
    game.start();
    paused = false;
    running = true;
  }

  // build the level buttons
  const levelWrap = $('levels');
  MZ.content.PRESETS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.className = 'level-btn';
    b.innerHTML = `<span class="lv-title">${lv.title}</span>`;
    b.onclick = () => {
      [...levelWrap.children].forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
      loadLevel(lv);
    };
    levelWrap.appendChild(b);
    if (i === 0) b.classList.add('active');
  });

  // transport
  $('play').onclick = startRun;
  $('pause').onclick = () => {
    if (game.state === 'running' || game.state === 'countdown') {
      paused = !paused;
      $('pause').classList.toggle('on', paused);
    }
  };
  $('reset').onclick = () => {
    game.reset();
    world.timeScale = parseFloat($('speed').value);
    paused = false;
    $('pause').classList.remove('on');
  };

  // sliders — only change physics when the kid actually drags them, so they
  // never silently clobber a level's authored feel on load.
  function bindSlider(id, apply) {
    const el = $(id);
    const out = $(id + 'Val');
    el.addEventListener('input', () => {
      if (out) out.textContent = el.value;
      apply(parseFloat(el.value));
    });
    if (out) out.textContent = el.value; // show initial number only
  }
  bindSlider('gravity', (v) => { overrides.gravity = v; world.gravity.y = v; });
  bindSlider('bounce', (v) => { overrides.bounce = v; world.marbles.forEach((m) => (m.restitution = v)); });
  bindSlider('friction', (v) => { overrides.friction = v; world.marbles.forEach((m) => (m.friction = v)); });
  bindSlider('speed', (v) => { world.timeScale = v; });
  bindSlider('lava', (v) => { overrides.lavaRise = v; if (game.lavaCfg) game.lavaCfg.rise = v; });

  // toggles
  $('tTrails').onclick = () => toggle('tTrails', (on) => (renderer.showTrails = on));
  $('tNames').onclick = () => toggle('tNames', (on) => (renderer.showNames = on));
  $('tBoard').onclick = () => toggle('tBoard', (on) => (renderer.showBoard = on));
  $('tMute').onclick = () => toggle('tMute', (on) => (Sound.muted = on));
  function toggle(id, apply) {
    const el = $(id);
    el.classList.toggle('on');
    apply(el.classList.contains('on'));
  }

  // build tools
  const tools = ['none', 'wall', 'ramp', 'spinner', 'marble', 'finish', 'lava', 'erase'];
  tools.forEach((t) => {
    const el = $('tool-' + t);
    if (el) el.onclick = () => { editor.setTool(t); highlightTool(t); };
  });
  function highlightTool(t) {
    tools.forEach((x) => { const el = $('tool-' + x); if (el) el.classList.toggle('active', x === t); });
    canvas.style.cursor = t === 'none' ? 'default' : 'crosshair';
  }
  $('clearAll').onclick = () => {
    world.clearWalls(); world.clearMarbles();
    game.lavaCfg = null; world.deadlyBelow = null;
    editor._snapshot();
  };

  // fullscreen for clean recording
  $('fs').onclick = () => {
    const stageWrap = document.getElementById('stageWrap');
    if (!document.fullscreenElement) stageWrap.requestFullscreen && stageWrap.requestFullscreen();
    else document.exitFullscreen && document.exitFullscreen();
  };

  // help modal
  $('helpBtn').onclick = () => $('help').classList.add('show');
  $('help').onclick = (e) => { if (e.target.id === 'help' || e.target.id === 'helpClose') $('help').classList.remove('show'); };

  function updateLavaControl() {
    const isSurv = game.mode === 'survival';
    $('lavaRow').style.display = isSurv || game.lavaCfg ? 'flex' : 'none';
    if (game.lavaCfg) { $('lava').value = game.lavaCfg.rise; $('lavaVal').textContent = game.lavaCfg.rise; }
  }

  global.addEventListener('resize', () => renderer.resize());
  document.addEventListener('fullscreenchange', () => setTimeout(() => renderer.resize(), 50));

  // keyboard shortcuts
  global.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); startRun(); }
    else if (e.key === 'r' || e.key === 'R') $('reset').click();
    else if (e.key === 'p' || e.key === 'P') $('pause').click();
  });

  // boot with the first level
  loadLevel(MZ.content.PRESETS[0]);
})(window);
