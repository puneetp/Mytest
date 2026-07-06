/* ============================================================================
 * render.js  —  Draws the world on the <canvas> with the "MIKAN" look:
 * glowing marble tracers, neon lava, spinning blades, a live leaderboard,
 * a big countdown, and a winner banner with confetti.
 * ==========================================================================*/

(function (global) {
  'use strict';
  const MZ = global.MZ;
  const W = MZ.content.W, H = MZ.content.H;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.scale = 1;
      this.ox = 0; this.oy = 0;
      this.confetti = [];
      this.showTrails = true;
      this.showNames = true;
      this.showBoard = true;
      this.resize();
    }

    resize() {
      const parent = this.canvas.parentElement;
      const cw = parent.clientWidth;
      const ch = parent.clientHeight;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = cw * dpr;
      this.canvas.height = ch * dpr;
      this.canvas.style.width = cw + 'px';
      this.canvas.style.height = ch + 'px';
      // fit the 960x720 world into the canvas, centered (letterboxed)
      const s = Math.min(cw / W, ch / H);
      this.scale = s * dpr;
      this.ox = (cw - W * s) / 2 * dpr;
      this.oy = (ch - H * s) / 2 * dpr;
    }

    // convert a screen (mouse) point to world coordinates — used by the editor
    toWorld(sx, sy) {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = this.canvas.width / rect.width;
      const px = (sx - rect.left) * dpr;
      const py = (sy - rect.top) * dpr;
      return { x: (px - this.ox) / this.scale, y: (py - this.oy) / this.scale };
    }

    draw(game) {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      bg.addColorStop(0, '#0d1220');
      bg.addColorStop(1, '#141b30');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);

      // play-area frame
      ctx.fillStyle = '#0a0f1c';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#243154';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, W, H);

      const world = game.world;

      // lava (survival)
      if (world.deadlyBelow != null) this._drawLava(ctx, world.deadlyBelow, game.time);

      // walls
      for (const wl of world.walls) this._drawWall(ctx, wl);

      // trails then marbles
      if (this.showTrails) for (const m of world.marbles) this._drawTrail(ctx, m);
      for (const m of world.marbles) this._drawMarble(ctx, m);

      // overlays (drawn in screen space)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.showBoard) this._drawBoard(ctx, game);
      this._drawBanner(ctx, game);
      this._drawConfetti(ctx);
    }

    _drawLava(ctx, level, t) {
      const wob = Math.sin(t * 4) * 4;
      const grad = ctx.createLinearGradient(0, level, 0, H);
      grad.addColorStop(0, '#ff8a3d');
      grad.addColorStop(0.4, '#ff5722');
      grad.addColorStop(1, '#b71c1c');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, level + wob);
      for (let x = 0; x <= W; x += 24) {
        ctx.lineTo(x, level + Math.sin(x * 0.04 + t * 5) * 6);
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffd180';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const y = level + Math.sin(x * 0.04 + t * 5) * 6;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    _drawWall(ctx, w) {
      ctx.lineCap = 'round';
      ctx.lineWidth = w.thickness;
      if (w.deadly) {
        ctx.strokeStyle = '#ff1744';
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 10;
      } else if (w.tag === 'finish') {
        // checkered finish line
        ctx.strokeStyle = '#00e676';
        ctx.shadowColor = '#00e676';
        ctx.shadowBlur = 8;
      } else {
        ctx.strokeStyle = w.color || '#3a4a6b';
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.moveTo(w.a.x, w.a.y);
      ctx.lineTo(w.b.x, w.b.y);
      ctx.stroke();
      // hub for spinners
      if (w.pivot && w.spin) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(w.pivot.x, w.pivot.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    _drawTrail(ctx, m) {
      if (m.trail.length < 2) return;
      ctx.lineCap = 'round';
      ctx.strokeStyle = m.color;
      ctx.shadowColor = m.color;
      for (let i = 1; i < m.trail.length; i++) {
        const p0 = m.trail[i - 1], p1 = m.trail[i];
        const a = i / m.trail.length;
        ctx.globalAlpha = a * (m.alive ? 0.55 : 0.15);
        ctx.shadowBlur = 12 * a;
        ctx.lineWidth = m.r * 1.4 * a;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    _drawMarble(ctx, m) {
      if (!m.alive && !m.finished) {
        // fading "poof" for eliminated marbles handled via trail only
        return;
      }
      // glossy ball
      const g = ctx.createRadialGradient(
        m.pos.x - m.r * 0.35, m.pos.y - m.r * 0.35, m.r * 0.1,
        m.pos.x, m.pos.y, m.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, m.color);
      g.addColorStop(1, shade(m.color, -0.35));
      ctx.fillStyle = g;
      ctx.shadowColor = m.color;
      ctx.shadowBlur = m.finished ? 4 : 10;
      ctx.beginPath();
      ctx.arc(m.pos.x, m.pos.y, m.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // spin marker so rolling is visible
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.pos.x, m.pos.y);
      ctx.lineTo(m.pos.x + Math.cos(m.angle) * m.r * 0.8, m.pos.y + Math.sin(m.angle) * m.r * 0.8);
      ctx.stroke();

      if (this.showNames) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.name, m.pos.x, m.pos.y - m.r - 4);
      }
    }

    _drawBoard(ctx, game) {
      const rows = game.leaderboard();
      const x = 12, y = 12, w = 190;
      const rh = 22;
      const h = 34 + rows.length * rh;
      roundRect(ctx, x, y, w, h, 10);
      ctx.fillStyle = 'rgba(10,15,28,0.78)';
      ctx.fill();
      ctx.fillStyle = '#cdd6f0';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      const modeLabel = { race: 'RACE', survival: 'SURVIVAL', elimination: 'ELIMINATION' }[game.mode] || '';
      ctx.fillText('🏆 ' + modeLabel, x + 12, y + 22);
      rows.forEach((r, i) => {
        const ry = y + 34 + i * rh;
        ctx.fillStyle = r.color;
        ctx.globalAlpha = r.alive || r.finished ? 1 : 0.35;
        ctx.beginPath();
        ctx.arc(x + 20, ry + 8, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = r.alive || r.finished ? '#e8edfa' : '#7a88a0';
        ctx.font = '500 12px system-ui, sans-serif';
        let label = r.name;
        if (r.finished) label += '  #' + r.rank;
        else if (!r.alive) label += '  ✖';
        ctx.fillText(label, x + 34, ry + 12);
        ctx.globalAlpha = 1;
      });
    }

    _drawBanner(ctx, game) {
      const cw = this.canvas.width, ch = this.canvas.height;
      ctx.textAlign = 'center';
      if (game.state === 'countdown') {
        const n = Math.ceil(game.countdown);
        const frac = n - game.countdown; // 0→1 within the second
        const scale = 1 + (1 - frac) * 0.8;
        ctx.save();
        ctx.globalAlpha = Math.min(1, 1.2 - frac);
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.round(120 * scale * (this.scale / (this.scale)))}px system-ui, sans-serif`;
        ctx.shadowColor = '#42a5f5';
        ctx.shadowBlur = 30;
        ctx.fillText(n > 0 ? String(n) : 'GO!', cw / 2, ch / 2);
        ctx.restore();
      } else if (game.state === 'running' && game.time < 0.6) {
        ctx.save();
        ctx.globalAlpha = 1 - game.time / 0.6;
        ctx.fillStyle = '#69f0ae';
        ctx.font = '800 96px system-ui, sans-serif';
        ctx.fillText('GO!', cw / 2, ch / 2);
        ctx.restore();
      } else if (game.state === 'finished') {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, ch / 2 - 90, cw, 180);
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 42px system-ui, sans-serif';
        let txt = 'Winner!';
        if (game.winnerTeam != null) txt = (game.winnerTeam === 0 ? '🔴 Red Team' : '🔵 Blue Team') + ' Wins!';
        else if (game.winner) txt = '🏆 ' + game.winner.name + ' Wins!';
        else txt = 'Game Over';
        ctx.fillStyle = game.winner ? game.winner.color : '#ffffff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 24;
        ctx.fillText(txt, cw / 2, ch / 2 + 6);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#cdd6f0';
        ctx.font = '500 18px system-ui, sans-serif';
        ctx.fillText('Press Reset ↻ to play again', cw / 2, ch / 2 + 48);
        ctx.restore();
      }
    }

    burstConfetti(color) {
      for (let i = 0; i < 90; i++) {
        this.confetti.push({
          x: this.canvas.width / 2, y: this.canvas.height / 2,
          vx: (Math.sin(i) - Math.cos(i * 1.3)) * (2 + (i % 7)),
          vy: -6 - (i % 9),
          life: 1,
          c: i % 3 === 0 ? color : ['#ffd54f', '#4fc3f7', '#ff8a80', '#b9f6ca'][i % 4],
          s: 4 + (i % 5),
        });
      }
    }

    _drawConfetti(ctx) {
      for (const p of this.confetti) {
        p.vy += 0.28;
        p.x += p.vx; p.y += p.vy;
        p.life -= 0.008;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, p.s, p.s);
      }
      ctx.globalAlpha = 1;
      this.confetti = this.confetti.filter((p) => p.life > 0 && p.y < this.canvas.height + 40);
    }
  }

  function shade(hex, amt) {
    const c = hexToRgb(hex);
    const f = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    const r = Math.round((f - c.r) * p + c.r);
    const g = Math.round((f - c.g) * p + c.g);
    const b = Math.round((f - c.b) * p + c.b);
    return `rgb(${r},${g},${b})`;
  }
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  MZ.Renderer = Renderer;
})(window);
