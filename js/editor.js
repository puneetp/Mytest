/* ============================================================================
 * editor.js  —  The "build your own" tools. Pick a tool, then click or drag on
 * the play area to add walls, ramps, marbles, spinners, a finish line, or lava.
 *
 * Anything you build is snapshotted into the current level, so pressing Reset ↻
 * replays YOUR creation from the start instead of throwing it away.
 * ==========================================================================*/

(function (global) {
  'use strict';
  const MZ = global.MZ;
  const { Wall, Marble } = MZ;
  const COLORS = MZ.content.COLORS;

  class Editor {
    constructor(game, renderer) {
      this.game = game;
      this.renderer = renderer;
      this.world = game.world;
      this.tool = 'none';      // none | wall | ramp | spinner | marble | finish | lava | erase
      this.dragStart = null;
      this.preview = null;
      this.spawnIndex = 0;
      this._bind();
    }

    setTool(t) { this.tool = t; this.dragStart = null; this.preview = null; }

    _bind() {
      const c = this.renderer.canvas;
      c.addEventListener('pointerdown', (e) => this._down(e));
      c.addEventListener('pointermove', (e) => this._move(e));
      c.addEventListener('pointerup', (e) => this._up(e));
      c.addEventListener('pointerleave', () => { this.dragStart = null; this.preview = null; });
    }

    _down(e) {
      if (this.tool === 'none') return;
      const p = this.renderer.toWorld(e.clientX, e.clientY);
      if (this.tool === 'marble') { this._addMarble(p); this._snapshot(); return; }
      if (this.tool === 'lava') { this._toggleLava(); this._snapshot(); return; }
      if (this.tool === 'erase') { this._erase(p); this._snapshot(); return; }
      // drag tools
      this.dragStart = p;
    }

    _move(e) {
      if (!this.dragStart) return;
      this.preview = this.renderer.toWorld(e.clientX, e.clientY);
    }

    _up(e) {
      if (!this.dragStart) return;
      const p = this.renderer.toWorld(e.clientX, e.clientY);
      const a = this.dragStart, b = p;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 10) {
        if (this.tool === 'wall' || this.tool === 'ramp') {
          this.world.add(new Wall({ ax: a.x, ay: a.y, bx: b.x, by: b.y, color: '#4a5ea8', restitution: 0.3 }));
        } else if (this.tool === 'spinner') {
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          this.world.add(new Wall({ ax: a.x, ay: a.y, bx: b.x, by: b.y, pivot: mid, spin: 2.0, color: '#ff7043' }));
        } else if (this.tool === 'finish') {
          this.world.add(new Wall({ ax: a.x, ay: a.y, bx: b.x, by: b.y, tag: 'finish', color: '#00e676', thickness: 10 }));
        }
        this._snapshot();
      }
      this.dragStart = null;
      this.preview = null;
    }

    _addMarble(p) {
      const col = COLORS[this.spawnIndex % COLORS.length];
      this.world.add(new Marble({
        x: p.x, y: p.y, r: 13, color: col,
        name: MZ.content.NAMES[this.spawnIndex % MZ.content.NAMES.length],
        restitution: 0.4, friction: 0.2,
      }));
      this.spawnIndex++;
    }

    _toggleLava() {
      if (this.world.deadlyBelow == null) {
        this.game.lavaCfg = { start: MZ.content.H - 20, rise: 22 };
        this.game.lavaLevel = this.game.lavaCfg.start;
        this.world.deadlyBelow = this.game.lavaLevel;
        this.game.mode = 'survival';
      } else {
        this.world.deadlyBelow = null;
        this.game.lavaCfg = null;
      }
    }

    _erase(p) {
      // remove nearest marble or wall within reach
      let best = null, bestD = 28, kind = null;
      this.world.marbles.forEach((m, i) => {
        const d = Math.hypot(m.pos.x - p.x, m.pos.y - p.y);
        if (d < bestD) { bestD = d; best = i; kind = 'm'; }
      });
      this.world.walls.forEach((w, i) => {
        const cp = MZ.util.closestOnSegment(p, w.a, w.b);
        const d = Math.hypot(cp.x - p.x, cp.y - p.y);
        if (d < bestD) { bestD = d; best = i; kind = 'w'; }
      });
      if (best != null) {
        if (kind === 'm') this.world.marbles.splice(best, 1);
        else this.world.walls.splice(best, 1);
      }
    }

    // Freeze the current world into a replayable level so Reset keeps edits.
    _snapshot() {
      const walls = this.world.walls.map(serializeWall);
      const marbles = this.world.marbles.map(serializeMarble);
      const gravity = { ...this.world.gravity };
      const mode = this.game.mode;
      const lava = this.game.lavaCfg ? { ...this.game.lavaCfg } : null;
      const teams = this.game.level && this.game.level.teams;
      this.game.level = {
        id: 'custom',
        title: '✏️ My Creation',
        mode, lava, teams,
        elimination: this.game.elimCfg,
        build() {
          return {
            gravity: { ...gravity },
            walls: walls.map((w) => new Wall(w)),
            marbles: marbles.map((m) => Object.assign(new Marble(m), { color: m.color, name: m.name, team: m.team })),
          };
        },
      };
      if (this.onChange) this.onChange(this.game.level);
    }
  }

  function serializeWall(w) {
    return {
      ax: w._a0.x, ay: w._a0.y, bx: w._b0.x, by: w._b0.y,
      thickness: w.thickness, restitution: w.restitution, friction: w.friction,
      color: w.color, deadly: w.deadly, tag: w.tag,
      pivot: w.pivot ? { ...w.pivot } : null, spin: w.spin,
      moveAxis: w.moveAxis ? { ...w.moveAxis } : null, moveDist: w.moveDist, moveSpeed: w.moveSpeed,
    };
  }
  function serializeMarble(m) {
    return {
      x: m.pos.x, y: m.pos.y, r: m.r, color: m.color, name: m.name, team: m.team,
      restitution: m.restitution, friction: m.friction,
    };
  }

  MZ.Editor = Editor;
})(window);
