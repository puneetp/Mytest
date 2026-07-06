/* ============================================================================
 * physics.js  —  A tiny, self-contained 2D physics engine for marble worlds.
 *
 * This is the "Algodoo" part of the app: gravity, bouncing, rolling, friction
 * and collisions. It has NO external dependencies so the whole simulator runs
 * from a single folder with no internet.
 *
 * The two things that exist in the world:
 *   • Marbles  — round balls that MOVE (dynamic circles).
 *   • Walls    — straight line segments that DON'T move (static/kinematic).
 *
 * Everything MIKAN builds (ramps, funnels, boxes, spinners, crushers, lava
 * floors) is made out of these two ingredients. Keeping it that simple is what
 * makes the engine small enough for a curious kid to read.
 * ==========================================================================*/

(function (global) {
  'use strict';

  /* ----------------------------- 2D Vectors ------------------------------ */
  const V = {
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    mul: (a, s) => ({ x: a.x * s, y: a.y * s }),
    dot: (a, b) => a.x * b.x + a.y * b.y,
    len: (a) => Math.hypot(a.x, a.y),
    norm: (a) => {
      const l = Math.hypot(a.x, a.y) || 1;
      return { x: a.x / l, y: a.y / l };
    },
    // perpendicular (rotate 90°)
    perp: (a) => ({ x: -a.y, y: a.x }),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  };

  /* ------------------------------ Marble --------------------------------- */
  // A dynamic circle. This is the only thing that moves under gravity.
  class Marble {
    constructor(opts) {
      this.type = 'marble';
      this.pos = { x: opts.x, y: opts.y };
      this.vel = { x: opts.vx || 0, y: opts.vy || 0 };
      this.r = opts.r || 12;
      this.mass = Math.PI * this.r * this.r * 0.001; // area-based mass
      this.invMass = 1 / this.mass;
      this.restitution = opts.restitution != null ? opts.restitution : 0.35; // bounciness
      this.friction = opts.friction != null ? opts.friction : 0.25;
      this.angle = 0;      // visual spin
      this.angVel = 0;     // visual spin speed

      // Identity / gameplay
      this.color = opts.color || '#ff5252';
      this.name = opts.name || 'Marble';
      this.team = opts.team || null;
      this.alive = true;
      this.finished = false;
      this.rank = 0;       // finishing place (race) or elimination order
      this.score = 0;
      this.trail = [];     // recent positions for the glowing tracer
    }
  }

  /* ------------------------------- Wall ---------------------------------- */
  // A line segment from a→b. Static by default. If it has a pivot + spin it
  // becomes KINEMATIC (rotates forever, pushing marbles — spinners/paddles).
  // If it has moveAxis it slides back and forth (crushers / moving platforms).
  class Wall {
    constructor(opts) {
      this.type = 'wall';
      this.a = { x: opts.ax, y: opts.ay };
      this.b = { x: opts.bx, y: opts.by };
      this.thickness = opts.thickness || 6;
      this.restitution = opts.restitution != null ? opts.restitution : 0.3;
      this.friction = opts.friction != null ? opts.friction : 0.3;
      this.color = opts.color || '#3a4a6b';
      this.deadly = !!opts.deadly;   // touching it eliminates the marble
      this.tag = opts.tag || null;   // e.g. 'finish' for the finish line

      // Kinematic motion (optional)
      this.pivot = opts.pivot || null;        // {x,y} to rotate around
      this.spin = opts.spin || 0;             // radians / second
      this.moveAxis = opts.moveAxis || null;  // {x,y} unit direction to slide along
      this.moveDist = opts.moveDist || 0;     // half travel distance
      this.moveSpeed = opts.moveSpeed || 0;   // cycles-ish speed
      this._phase = 0;

      // remember the "home" endpoints so kinematic motion is reproducible
      this._a0 = { x: this.a.x, y: this.a.y };
      this._b0 = { x: this.b.x, y: this.b.y };
    }

    get moving() {
      return (this.pivot && this.spin) || (this.moveAxis && this.moveSpeed);
    }

    // Advance a kinematic wall and return the velocity of a point p on it.
    step(dt) {
      if (this.pivot && this.spin) {
        const rot = this.spin * dt;
        this.a = rotateAround(this.a, this.pivot, rot);
        this.b = rotateAround(this.b, this.pivot, rot);
      }
      if (this.moveAxis && this.moveSpeed) {
        this._phase += this.moveSpeed * dt;
        const off = Math.sin(this._phase) * this.moveDist;
        this.a = { x: this._a0.x + this.moveAxis.x * off, y: this._a0.y + this.moveAxis.y * off };
        this.b = { x: this._b0.x + this.moveAxis.x * off, y: this._b0.y + this.moveAxis.y * off };
      }
    }

    // Velocity of the material point at world position p (for momentum transfer).
    velocityAt(p) {
      let v = { x: 0, y: 0 };
      if (this.pivot && this.spin) {
        const r = V.sub(p, this.pivot);
        v = V.add(v, { x: -this.spin * r.y, y: this.spin * r.x });
      }
      if (this.moveAxis && this.moveSpeed) {
        const dphase = this.moveSpeed;
        const dOff = Math.cos(this._phase) * this.moveDist * dphase;
        v = V.add(v, { x: this.moveAxis.x * dOff, y: this.moveAxis.y * dOff });
      }
      return v;
    }
  }

  function rotateAround(p, c, ang) {
    const s = Math.sin(ang), co = Math.cos(ang);
    const dx = p.x - c.x, dy = p.y - c.y;
    return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co };
  }

  // Closest point on segment a-b to point p.
  function closestOnSegment(p, a, b) {
    const ab = V.sub(b, a);
    const t = Math.max(0, Math.min(1, V.dot(V.sub(p, a), ab) / (V.dot(ab, ab) || 1)));
    return { x: a.x + ab.x * t, y: a.y + ab.y * t };
  }

  /* ------------------------------- World --------------------------------- */
  class World {
    constructor() {
      this.marbles = [];
      this.walls = [];
      this.gravity = { x: 0, y: 2000 }; // pixels / second^2
      this.bounds = { x: 0, y: 0, w: 960, h: 720 };
      this.timeScale = 1;
      this.onEliminate = null; // callback(marble, cause)
      this.onFinish = null;    // callback(marble)
      this.deadlyBelow = null; // y value: any marble whose bottom passes it dies (lava)
    }

    add(obj) {
      if (obj.type === 'marble') this.marbles.push(obj);
      else this.walls.push(obj);
      return obj;
    }

    clearWalls() { this.walls = []; }
    clearMarbles() { this.marbles = []; }

    // Fixed-timestep stepping keeps the simulation stable and identical across
    // fast and slow computers (important when recording videos).
    step(dt) {
      const scaled = dt * this.timeScale;
      const h = 1 / 240;                 // physics sub-step
      let remaining = scaled;
      let guard = 0;
      while (remaining > 1e-6 && guard < 40) {
        const step = Math.min(h, remaining);
        this.substep(step);
        remaining -= step;
        guard++;
      }
    }

    substep(h) {
      // 1. Move kinematic walls (spinners, crushers).
      for (const w of this.walls) if (w.moving) w.step(h);

      // 2. Integrate marbles (gravity + velocity).
      for (const m of this.marbles) {
        if (!m.alive || m.finished) continue;
        m.vel.x += this.gravity.x * h;
        m.vel.y += this.gravity.y * h;
        m.pos.x += m.vel.x * h;
        m.pos.y += m.vel.y * h;
        m.angle += m.angVel * h;
      }

      // 3. Resolve collisions (a few iterations = stable stacking/rolling).
      for (let iter = 0; iter < 4; iter++) {
        this.collideMarblesWithWalls();
        this.collideMarblesWithMarbles();
      }

      // 4. Hazards & world limits.
      this.applyHazards();
    }

    collideMarblesWithWalls() {
      for (const m of this.marbles) {
        if (!m.alive || m.finished) continue;
        for (const w of this.walls) {
          const cp = closestOnSegment(m.pos, w.a, w.b);
          const d = V.sub(m.pos, cp);
          let dist = V.len(d);
          const minDist = m.r + w.thickness * 0.5;
          if (dist < minDist) {
            // Deadly / tagged walls fire gameplay events instead of bouncing.
            if (w.deadly) { this.eliminate(m, 'hazard'); break; }
            if (w.tag === 'finish') { this.finish(m); break; }

            const n = dist > 1e-6 ? V.mul(d, 1 / dist) : { x: 0, y: -1 };
            const pen = minDist - dist;
            // Positional correction (push marble out of the wall).
            m.pos.x += n.x * pen;
            m.pos.y += n.y * pen;

            // Impulse resolution with restitution + friction.
            const surfV = w.moving ? w.velocityAt(cp) : { x: 0, y: 0 };
            const rv = V.sub(m.vel, surfV);
            const vn = V.dot(rv, n);
            if (vn < 0) {
              const e = Math.min(m.restitution, w.restitution);
              const jn = -(1 + e) * vn;
              m.vel.x += n.x * jn;
              m.vel.y += n.y * jn;

              // Friction along the tangent.
              const t = V.perp(n);
              const vt = V.dot(rv, t);
              const mu = (m.friction + w.friction) * 0.5;
              let jt = -vt;
              const maxJt = mu * Math.abs(jn);
              jt = Math.max(-maxJt, Math.min(maxJt, jt));
              m.vel.x += t.x * jt;
              m.vel.y += t.y * jt;

              // Visual rolling: spin follows tangential speed.
              m.angVel = -vt / m.r;
            }
          }
        }
      }
    }

    collideMarblesWithMarbles() {
      const arr = this.marbles;
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (!a.alive || a.finished) continue;
        for (let j = i + 1; j < arr.length; j++) {
          const b = arr[j];
          if (!b.alive || b.finished) continue;
          const d = V.sub(b.pos, a.pos);
          const dist = V.len(d);
          const minDist = a.r + b.r;
          if (dist < minDist && dist > 1e-6) {
            const n = V.mul(d, 1 / dist);
            const pen = minDist - dist;
            const totalInv = a.invMass + b.invMass;
            // Push apart proportional to inverse mass.
            a.pos.x -= n.x * pen * (a.invMass / totalInv);
            a.pos.y -= n.y * pen * (a.invMass / totalInv);
            b.pos.x += n.x * pen * (b.invMass / totalInv);
            b.pos.y += n.y * pen * (b.invMass / totalInv);

            const rv = V.sub(b.vel, a.vel);
            const vn = V.dot(rv, n);
            if (vn < 0) {
              const e = Math.min(a.restitution, b.restitution);
              const jn = -(1 + e) * vn / totalInv;
              a.vel.x -= n.x * jn * a.invMass;
              a.vel.y -= n.y * jn * a.invMass;
              b.vel.x += n.x * jn * b.invMass;
              b.vel.y += n.y * jn * b.invMass;
            }
          }
        }
      }
    }

    applyHazards() {
      for (const m of this.marbles) {
        if (!m.alive || m.finished) continue;
        // Rising lava (deadlyBelow is a y-line; higher on screen = smaller y).
        if (this.deadlyBelow != null && m.pos.y + m.r >= this.deadlyBelow) {
          this.eliminate(m, 'lava');
          continue;
        }
        // Fell out of the world.
        if (m.pos.y - m.r > this.bounds.y + this.bounds.h + 200) {
          this.eliminate(m, 'fell');
        }
      }
    }

    eliminate(m, cause) {
      if (!m.alive) return;
      m.alive = false;
      m.deathCause = cause;
      if (this.onEliminate) this.onEliminate(m, cause);
    }

    finish(m) {
      if (m.finished || !m.alive) return;
      m.finished = true;
      if (this.onFinish) this.onFinish(m);
    }

    aliveMarbles() { return this.marbles.filter((m) => m.alive && !m.finished); }
  }

  /* ------------------------------ Exports -------------------------------- */
  global.MZ = global.MZ || {};
  global.MZ.V = V;
  global.MZ.Marble = Marble;
  global.MZ.Wall = Wall;
  global.MZ.World = World;
  global.MZ.util = { closestOnSegment, rotateAround };
})(window);
