/* ============================================================================
 * content.js  —  The fun stuff: marble colors/names, easy "building blocks"
 * for making tracks, and the ready-made LEVELS (presets).
 *
 * A LEVEL is just a small recipe. It says:
 *   • which game mode to play (race / survival / elimination)
 *   • how gravity/bounce feel
 *   • what walls & hazards to build
 *   • where the marbles start
 *
 * Kids can copy any recipe below and change the numbers to invent new levels.
 * ==========================================================================*/

(function (global) {
  'use strict';
  const MZ = global.MZ;
  const { Marble, Wall } = MZ;

  // A cheerful, high-contrast palette (great on camera, col-blind friendly-ish).
  const COLORS = [
    '#ff5252', '#ffb300', '#ffee58', '#66bb6a', '#26c6da',
    '#42a5f5', '#7e57c2', '#ec407a', '#8d6e63', '#ff7043',
    '#9ccc65', '#26a69a', '#5c6bc0', '#ab47bc', '#d4e157',
    '#29b6f6',
  ];
  const NAMES = [
    'Red', 'Amber', 'Sunny', 'Leaf', 'Aqua', 'Sky', 'Grape', 'Rosie',
    'Cocoa', 'Ember', 'Lime', 'Teal', 'Indigo', 'Plum', 'Zest', 'Cyan',
  ];

  /* ---------------------- Building blocks (helpers) ---------------------- */
  // Everything is made from line-segment walls, so a builder makes life easy.
  const Build = {
    // a single straight wall
    line(scene, ax, ay, bx, by, opts = {}) {
      scene.walls.push(new Wall({ ax, ay, bx, by, ...opts }));
    },
    // a rectangle made of 4 walls (a box or a solid platform)
    box(scene, x, y, w, h, opts = {}) {
      Build.line(scene, x, y, x + w, y, opts);
      Build.line(scene, x + w, y, x + w, y + h, opts);
      Build.line(scene, x + w, y + h, x, y + h, opts);
      Build.line(scene, x, y + h, x, y, opts);
    },
    // outer arena walls (left, right, floor) so marbles stay on screen
    arena(scene, w, h, opts = {}) {
      Build.line(scene, 4, -400, 4, h, opts);          // left
      Build.line(scene, w - 4, -400, w - 4, h, opts);  // right
    },
    // a row of alternating diagonal ramps (a zig-zag "plinko"-ish descent)
    zigzag(scene, x, y, w, rows, gap, opts = {}) {
      for (let i = 0; i < rows; i++) {
        const yy = y + i * gap;
        if (i % 2 === 0) Build.line(scene, x, yy, x + w * 0.8, yy + gap * 0.55, opts);
        else Build.line(scene, x + w, yy, x + w * 0.2, yy + gap * 0.55, opts);
      }
    },
    // a funnel that gathers marbles toward the middle
    funnel(scene, x, y, w, drop, mouth, opts = {}) {
      Build.line(scene, x, y, x + (w - mouth) / 2, y + drop, opts);
      Build.line(scene, x + w, y, x + (w + mouth) / 2, y + drop, opts);
    },
    // scatter round pegs (static) — bouncy obstacles like a pachinko board
    pegs(scene, x, y, w, cols, rows, gap, opts = {}) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const off = r % 2 ? gap / 2 : 0;
          const px = x + off + c * gap;
          const py = y + r * gap;
          // a "peg" is a tiny 8-sided ring of short walls approximating a circle
          Build.dot(scene, px, py, 10, opts);
        }
      }
    },
    // a small circular bumper approximated by a polygon of short walls
    dot(scene, cx, cy, r, opts = {}) {
      const sides = 8;
      for (let i = 0; i < sides; i++) {
        const a1 = (i / sides) * Math.PI * 2;
        const a2 = ((i + 1) / sides) * Math.PI * 2;
        Build.line(scene,
          cx + Math.cos(a1) * r, cy + Math.sin(a1) * r,
          cx + Math.cos(a2) * r, cy + Math.sin(a2) * r,
          { restitution: 0.7, ...opts });
      }
    },
  };

  // Spawn N marbles in a tidy row near the top.
  function spawnMarbles(scene, n, x, y, spread, opts = {}) {
    for (let i = 0; i < n; i++) {
      const col = COLORS[i % COLORS.length];
      scene.marbles.push(new Marble({
        x: x + (i - (n - 1) / 2) * spread,
        y: y + (i % 2) * 6,
        r: opts.r || 13,
        color: col,
        name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + (i + 1) : ''),
        team: opts.teams ? (i % opts.teams) : null,
        restitution: opts.restitution != null ? opts.restitution : 0.35,
        // Low friction on purpose: our engine fakes rolling, so a bit of
        // "slipperiness" makes marbles accelerate down ramps like real ones.
        friction: opts.friction != null ? opts.friction : 0.05,
      }));
    }
  }

  /* ------------------------------ LEVELS --------------------------------- */
  // Each level returns a fresh scene object every time it is loaded, so
  // resetting always rebuilds cleanly.
  const W = 960, H = 720;

  const PRESETS = [
    {
      id: 'downhill',
      title: '⛰️ Downhill Dash',
      mode: 'race',
      blurb: 'A classic marble race. First marble to the finish line wins!',
      build() {
        const s = { walls: [], marbles: [], gravity: { x: 0, y: 2000 } };
        Build.arena(s, W, H, { color: '#2a3556' });
        // a slalom of ramps (steeper + low friction so marbles really zoom)
        let y = 90;
        const ramps = [
          [40, y, 820, y + 190], [W - 40, y + 250, 140, y + 430],
          [40, y + 470, 820, y + 560], [W - 40, y + 600, 220, y + 660],
        ];
        for (const r of ramps) Build.line(s, r[0], r[1], r[2], r[3], { color: '#3f6ad8', restitution: 0.15, friction: 0.03 });
        Build.pegs(s, 250, 330, 5, 4, 3, 90);
        // finish line at the bottom
        Build.line(s, 4, H - 40, W - 4, H - 40, { tag: 'finish', color: '#00e676', thickness: 10 });
        spawnMarbles(s, 8, W / 2, 40, 34);
        return s;
      },
    },
    {
      id: 'lava',
      title: '🌋 Escape the Rising Lava',
      mode: 'survival',
      blurb: 'Lava rises from the bottom. Bounce, dodge, and survive the longest!',
      lava: { start: H - 20, rise: 26 }, // pixels per second upward
      build() {
        const s = { walls: [], marbles: [], gravity: { x: 0, y: 1600 } };
        Build.arena(s, W, H, { color: '#5a2a2a' });
        // staggered rescue ledges to climb the chaos on
        const ledges = [
          [80, 560, 360, 560], [600, 500, 880, 500],
          [140, 420, 420, 420], [560, 360, 860, 360],
          [80, 260, 380, 260], [600, 220, 900, 220],
        ];
        for (const l of ledges) Build.line(s, l[0], l[1], l[2], l[3], { color: '#a5673f', restitution: 0.4, friction: 0.1 });
        // a slow spinner to stir things up
        s.walls.push(new MZ.Wall({ ax: 380, ay: 640, bx: 580, by: 640, pivot: { x: 480, y: 640 }, spin: 1.4, color: '#ffca28' }));
        spawnMarbles(s, 10, W / 2, 60, 40, { restitution: 0.5 });
        return s;
      },
    },
    {
      id: 'elim',
      title: '🏁 Elimination Tower',
      mode: 'elimination',
      blurb: 'Every few seconds the marble in last place is out. Who survives to the end?',
      elimination: { interval: 3.0, progress: 'down' },
      build() {
        const s = { walls: [], marbles: [], gravity: { x: 0, y: 1800 } };
        Build.arena(s, W, H, { color: '#26324f' });
        // a tall descending maze of funnels
        for (let i = 0; i < 4; i++) {
          const y = 120 + i * 150;
          Build.funnel(s, 120, y, 720, 90, 120, { color: '#4a5ea8', restitution: 0.3, friction: 0.04 });
        }
        Build.zigzag(s, 120, 150, 720, 6, 90, { color: '#5c76c9', friction: 0.04 });
        spawnMarbles(s, 12, W / 2, 50, 30);
        return s;
      },
    },
    {
      id: 'teams',
      title: '🔴🔵 Team Battle',
      mode: 'survival',
      blurb: 'Two teams, rising lava, last team standing wins. Cheer for your color!',
      lava: { start: H - 20, rise: 22 },
      teams: 2,
      build() {
        const s = { walls: [], marbles: [], gravity: { x: 0, y: 1600 } };
        Build.arena(s, W, H, { color: '#2f2a4a' });
        Build.pegs(s, 160, 200, 7, 5, 4, 110);
        const ledges = [[60, 520, 300, 520], [660, 520, 900, 520], [340, 360, 620, 360]];
        for (const l of ledges) Build.line(s, l[0], l[1], l[2], l[3], { color: '#7a6bbf', restitution: 0.45 });
        // teams: alternate colors are forced to two team colors in the renderer
        spawnMarbles(s, 10, W / 2, 60, 44, { teams: 2, restitution: 0.5 });
        // recolor by team so it reads clearly on camera
        s.marbles.forEach((m) => { m.color = m.team === 0 ? '#ff5252' : '#42a5f5'; });
        return s;
      },
    },
    {
      id: 'spinners',
      title: '🌀 Spinner Chaos',
      mode: 'survival',
      blurb: 'Deadly spinning blades! Do not get flung into the walls of doom.',
      lava: { start: H - 20, rise: 14 },
      build() {
        const s = { walls: [], marbles: [], gravity: { x: 0, y: 1500 } };
        Build.arena(s, W, H, { color: '#3a2f2f' });
        const spinners = [
          [240, 250, 1.8], [720, 300, -2.1], [480, 470, 2.4], [300, 560, -1.6],
        ];
        for (const sp of spinners) {
          s.walls.push(new MZ.Wall({
            ax: sp[0] - 90, ay: sp[1], bx: sp[0] + 90, by: sp[1],
            pivot: { x: sp[0], y: sp[1] }, spin: sp[2], color: '#ff7043',
          }));
        }
        Build.line(s, 60, 150, 380, 150, { color: '#8d5a3a' });
        Build.line(s, 580, 180, 900, 180, { color: '#8d5a3a' });
        spawnMarbles(s, 9, W / 2, 60, 40, { restitution: 0.4 });
        return s;
      },
    },
    {
      id: 'pachinko',
      title: '🎰 Pachinko Drop',
      mode: 'race',
      blurb: 'Rain down through a field of bouncy pegs. Pure lucky chaos!',
      build() {
        const s = { walls: [], marbles: [], gravity: { x: 0, y: 1700 } };
        Build.arena(s, W, H, { color: '#243b2f' });
        Build.pegs(s, 120, 120, 8, 8, 70);
        Build.pegs(s, 155, 155, 7, 7, 70);
        // catch bins with a finish line
        for (let x = 120; x < W - 80; x += 110) Build.line(s, x, H - 200, x, H - 40, { color: '#3a7d5a' });
        Build.line(s, 4, H - 30, W - 4, H - 30, { tag: 'finish', color: '#00e676', thickness: 10 });
        spawnMarbles(s, 10, W / 2, 40, 22);
        return s;
      },
    },
  ];

  MZ.content = { COLORS, NAMES, Build, spawnMarbles, PRESETS, W, H };
})(window);
