/* ============================================================================
 * game.js  —  The referee. Loads a level into the physics World and runs the
 * rules for each mode: countdown → play → someone wins.
 *
 * Modes:
 *   race        first marble across the finish line wins (others get ranked).
 *   survival    rising lava / hazards; the last marble alive wins.
 *   elimination every few seconds the marble in last place is removed.
 * ==========================================================================*/

(function (global) {
  'use strict';
  const MZ = global.MZ;

  class Game {
    constructor(world) {
      this.world = world;
      this.level = null;
      this.mode = 'race';
      this.state = 'idle';   // idle | countdown | running | finished
      this.time = 0;         // seconds since GO
      this.countdown = 0;
      this.winner = null;
      this.winnerTeam = null;
      this.results = [];      // finishing / elimination order (worst→best pushed)
      this.eliminatedOrder = [];
      this._elimTimer = 0;
      this.onEvent = null;    // callback(type, payload) for UI/sound/confetti

      world.onEliminate = (m, cause) => this._handleEliminate(m, cause);
      world.onFinish = (m) => this._handleFinish(m);
    }

    load(level, overrides = {}) {
      const scene = level.build();
      const w = this.world;
      w.clearWalls();
      w.clearMarbles();
      scene.walls.forEach((x) => w.add(x));
      scene.marbles.forEach((x) => w.add(x));
      w.gravity = { ...scene.gravity };
      w.deadlyBelow = null;

      // apply user slider overrides
      if (overrides.gravity != null) w.gravity.y = overrides.gravity;
      if (overrides.bounce != null) w.marbles.forEach((m) => (m.restitution = overrides.bounce));
      if (overrides.friction != null) w.marbles.forEach((m) => (m.friction = overrides.friction));

      this.level = level;
      this.mode = level.mode;
      this.lavaCfg = level.lava ? { ...level.lava } : null;
      if (overrides.lavaRise != null && this.lavaCfg) this.lavaCfg.rise = overrides.lavaRise;
      this.elimCfg = level.elimination ? { ...level.elimination } : { interval: 3, progress: 'down' };

      this.state = 'idle';
      this.time = 0;
      this.winner = null;
      this.winnerTeam = null;
      this.results = [];
      this.eliminatedOrder = [];
      this._elimTimer = 0;
      this.lavaLevel = this.lavaCfg ? this.lavaCfg.start : null;
      this._startTotal = w.marbles.length;
    }

    start() {
      if (!this.level) return;
      this.state = 'countdown';
      this.countdown = 3.0;
      this._emit('countdown', 3);
    }

    reset() {
      if (this.level) this.load(this.level, this._overrides || {});
    }

    setOverrides(o) { this._overrides = o; }

    _emit(type, payload) { if (this.onEvent) this.onEvent(type, payload); }

    update(dt) {
      if (this.state === 'countdown') {
        const prev = Math.ceil(this.countdown);
        this.countdown -= dt;
        const now = Math.ceil(this.countdown);
        if (now !== prev && now >= 1) this._emit('countdown', now);
        if (this.countdown <= 0) {
          this.state = 'running';
          this._emit('go');
        }
        return; // marbles held at the gate until GO
      }

      if (this.state !== 'running') return;

      this.time += dt;
      this.world.step(dt);

      if (this.mode === 'survival') this._updateSurvival(dt);
      if (this.mode === 'elimination') this._updateElimination(dt);

      this._checkWin();
    }

    _updateSurvival(dt) {
      if (this.lavaCfg) {
        this.lavaLevel -= this.lavaCfg.rise * dt; // rises = y decreases
        this.world.deadlyBelow = this.lavaLevel;
      }
    }

    _updateElimination(dt) {
      this._elimTimer += dt;
      if (this._elimTimer >= this.elimCfg.interval) {
        this._elimTimer = 0;
        const alive = this.world.aliveMarbles();
        if (alive.length > 1) {
          const loser = this._lastPlace(alive);
          if (loser) {
            this._emit('warn', loser);
            this.world.eliminate(loser, 'eliminated');
          }
        }
      }
    }

    // "Last place" depends on the level's progress direction.
    _lastPlace(alive) {
      const p = this.elimCfg.progress;
      let worst = alive[0];
      for (const m of alive) {
        if (p === 'down' && m.pos.y < worst.pos.y) worst = m;      // highest = least progress
        else if (p === 'right' && m.pos.x < worst.pos.x) worst = m;
        else if (p === 'score' && m.score < worst.score) worst = m;
      }
      return worst;
    }

    _handleEliminate(m, cause) {
      this.eliminatedOrder.push(m);
      m.rank = this._startTotal - this.eliminatedOrder.length + 1; // 1 = best
      this._emit('eliminate', { marble: m, cause });
    }

    _handleFinish(m) {
      if (this.results.includes(m)) return;
      this.results.push(m);
      m.rank = this.results.length; // 1st, 2nd, ...
      this._emit('finish', { marble: m, place: m.rank });
      if (this.mode === 'race' && m.rank === 1) {
        this.winner = m;
        this._emit('firstFinish', m);
      }
    }

    _checkWin() {
      if (this.state !== 'running') return;

      if (this.mode === 'race') {
        // Race ends when everybody has finished or fallen out.
        const active = this.world.marbles.filter((m) => m.alive && !m.finished);
        if (active.length === 0) this._finish(this.winner || this.results[0] || null);
        return;
      }

      // survival + elimination: last marble (or last team) standing.
      const alive = this.world.aliveMarbles();
      if (this.level && this.level.teams) {
        const teams = new Set(alive.map((m) => m.team));
        if (teams.size <= 1) {
          this.winnerTeam = teams.size === 1 ? [...teams][0] : null;
          this._finish(alive[0] || null);
        }
      } else if (alive.length <= 1) {
        const w = alive[0] || null;
        if (w) w.rank = 1;
        this._finish(w);
      }
    }

    _finish(winner) {
      if (this.state === 'finished') return;
      this.state = 'finished';
      this.winner = winner || this.winner;
      this._emit('win', { winner: this.winner, team: this.winnerTeam });
    }

    // A live leaderboard the UI can render.
    leaderboard() {
      const rows = this.world.marbles.map((m) => ({
        name: m.name,
        color: m.color,
        team: m.team,
        alive: m.alive && !m.finished,
        finished: m.finished,
        rank: m.rank,
        // progress metric shown as a bar
        progress: m.finished ? 1 : Math.max(0, Math.min(1, m.pos.y / (MZ.content.H))),
      }));
      // sort: finishers by rank, then alive by progress, then eliminated last
      rows.sort((a, b) => {
        const av = a.finished ? -1000 + a.rank : (a.alive ? -a.progress : 1000 + (a.rank || 999));
        const bv = b.finished ? -1000 + b.rank : (b.alive ? -b.progress : 1000 + (b.rank || 999));
        return av - bv;
      });
      return rows;
    }
  }

  MZ.Game = Game;
})(window);
