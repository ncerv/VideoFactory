/*
 * vf-motion.js — Patrones de movimiento 2D para composiciones VideoFactory (runtime de navegador).
 *
 * Convierte especificaciones declarativas (JSON) en tweens GSAP colocados en tiempos absolutos
 * de una línea de tiempo en pausa, según el contrato de HyperFrames:
 *  - todo valor depende solo del tiempo de la línea (sin Date.now, timers ni Math.random);
 *  - la aleatoriedad usa un PRNG con semilla;
 *  - repeticiones finitas: los ciclos se despliegan en tweens explícitos;
 *  - estados iniciales en el propio tween (fromTo), no en CSS.
 *
 * Expone window.VFMotion = { apply, patterns }.
 */
(function (global) {
  "use strict";

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const range = (rand, [a, b]) => lerp(a, b, rand());
  const els = (sel) => Array.from(document.querySelectorAll(sel));
  const r3 = (n) => Math.round(n * 1000) / 1000;

  /**
   * Cámara 2D por parallax: cada capa escala y se desplaza en proporción a su profundidad
   * (0 = fondo, 1 = primer plano) alrededor de un punto de fuga común.
   * El desplazamiento se limita a lo que la escala gana de margen, para que ningún borde de capa entre en cuadro.
   */
  function camera(tl, s, ctx) {
    const [ox, oy] = s.origin; // fracciones del encuadre
    for (const layer of s.layers) {
      const k = Math.pow(layer.depth, s.depthCurve ?? 1.25);
      const scale = 1 + s.push * k;
      const marginX = (scale - 1) * ctx.width * Math.min(ox, 1 - ox) * 0.9;
      const marginY = (scale - 1) * ctx.height * Math.min(oy, 1 - oy) * 0.9;
      const x = Math.max(-marginX, Math.min(marginX, (s.panX || 0) * ctx.width * k));
      const y = Math.max(-marginY, Math.min(marginY, (s.panY || 0) * ctx.height * k));
      tl.fromTo(
        layer.sel,
        { scale: 1, x: 0, y: 0, transformOrigin: `${ox * 100}% ${oy * 100}%` },
        { scale: r3(scale), x: r3(x), y: r3(y), duration: s.duration, ease: s.ease },
        s.start,
      );
    }
  }

  /** Desplazamiento lineal y continuo (niebla, nubes). */
  function drift(tl, s) {
    tl.fromTo(
      s.sel,
      { x: s.x ? s.x[0] : 0, y: s.y ? s.y[0] : 0 },
      { x: s.x ? s.x[1] : 0, y: s.y ? s.y[1] : 0, duration: s.duration, ease: s.ease || "none" },
      s.start,
    );
  }

  /**
   * Oscilación suave entre dos valores de una propiedad (luz, balanceo).
   * Los semiciclos se despliegan en tweens explícitos: no hay repeat infinito.
   */
  function oscillate(tl, s) {
    const half = s.cycle / 2;
    const steps = Math.max(1, Math.floor(s.duration / half));
    const props = (v) => ({ [s.prop]: v });
    const startAtFrom = s.phase !== "to";
    const extra = { ...(s.transformOrigin ? { transformOrigin: s.transformOrigin } : {}), ...(s.svgOrigin ? { svgOrigin: s.svgOrigin } : {}) };
    tl.fromTo(s.sel, { ...props(startAtFrom ? s.from : s.to), ...extra }, { ...props(startAtFrom ? s.to : s.from), duration: half, ease: s.ease || "sine.inOut" }, s.start);
    for (let i = 1; i < steps; i++) {
      const a = (i % 2 === 0) === startAtFrom ? s.from : s.to;
      const b = a === s.from ? s.to : s.from;
      tl.fromTo(s.sel, props(a), { ...props(b), duration: half, ease: s.ease || "sine.inOut", immediateRender: false }, s.start + i * half);
    }
  }

  /**
   * Balanceo individual: cada elemento oscila alrededor de su data-svg-origin con amplitud,
   * ciclo y fase sembrados, para que un grupo de frondas no se mueva al unísono.
   */
  function sway(tl, s) {
    els(s.sel).forEach((el, i) => {
      const rand = mulberry32((s.seed || 1) * 1000 + i * 104729);
      const amp = range(rand, s.amplitude);
      const cycle = range(rand, s.cycle);
      const base = range(rand, [-amp * 0.3, amp * 0.3]);
      oscillate(tl, {
        sel: "#" + el.id,
        prop: "rotation",
        from: r3(base - amp),
        to: r3(base + amp),
        cycle: r3(cycle),
        start: s.start,
        duration: s.duration,
        phase: rand() < 0.5 ? "from" : "to",
        svgOrigin: el.getAttribute("data-svg-origin") || undefined,
      });
    });
  }

  /**
   * Deambular orgánico (luciérnagas, motas): cada elemento recorre puntos aleatorios sembrados
   * dentro de un radio, con duraciones variables, y parpadea en opacidad de forma independiente.
   */
  function wander(tl, s, ctx) {
    const list = els(s.sel);
    list.forEach((el, i) => {
      const rand = mulberry32((s.seed || 1) * 1000 + i * 7919);
      const scale = parseFloat(el.getAttribute("data-depth-scale") || "1");
      const rx = s.radius[0] * scale;
      const ry = s.radius[1] * scale;
      const fallX = (s.fall ? s.fall[0] : 0) * scale;
      const fallY = (s.fall ? s.fall[1] : 0) * scale;
      // Trayectoria
      let t = s.start;
      let px = range(rand, [-rx, rx]) * 0.5;
      let py = range(rand, [-ry, ry]) * 0.5;
      tl.set(el, { x: r3(px), y: r3(py) }, t);
      while (t < s.start + s.duration - 1e-6) {
        const dur = Math.min(range(rand, s.hop), s.start + s.duration - t);
        const progress = (t + dur - s.start) / s.duration;
        const nx = range(rand, [-rx, rx]) + fallX * progress;
        const ny = range(rand, [-ry, ry]) + fallY * progress;
        tl.fromTo(el, { x: r3(px), y: r3(py) }, { x: r3(nx), y: r3(ny), duration: r3(dur), ease: "sine.inOut", immediateRender: false }, r3(t));
        px = nx;
        py = ny;
        t += dur;
      }
      // Parpadeo de luz
      if (s.flicker) {
        let ft = s.start;
        let op = range(rand, s.flicker.range);
        tl.set(el, { opacity: r3(op) }, ft);
        while (ft < s.start + s.duration - 1e-6) {
          const dur = Math.min(range(rand, s.flicker.hop), s.start + s.duration - ft);
          const next = rand() < (s.flicker.darkChance || 0) ? s.flicker.range[0] * 0.3 : range(rand, s.flicker.range);
          tl.fromTo(el, { opacity: r3(op) }, { opacity: r3(next), duration: r3(dur), ease: "sine.inOut", immediateRender: false }, r3(ft));
          op = next;
          ft += dur;
        }
      }
    });
  }

  /** Vibración por pasos a una cadencia fija (grano de película), con posiciones sembradas. */
  function jitter(tl, s) {
    const rand = mulberry32(s.seed || 1);
    const step = 1 / s.fps;
    for (let t = s.start; t < s.start + s.duration - 1e-6; t += step) {
      tl.set(s.sel, { x: Math.round(range(rand, [-s.amount, s.amount])), y: Math.round(range(rand, [-s.amount, s.amount])) }, r3(t));
    }
  }

  /** Secuencia explícita de fotogramas clave: [{at, to:{...}, from:{...}, duration, ease}]. */
  function sequence(tl, s) {
    s.keys.forEach((k, i) => {
      const vars = { ...k.to, duration: k.duration, ease: k.ease || "sine.inOut" };
      if (i > 0) vars.immediateRender = false;
      tl.fromTo(s.sel, k.from, vars, k.at);
    });
  }

  const patterns = { camera, drift, oscillate, sway, wander, jitter, sequence };

  /** Aplica una lista de especificaciones {type, ...} sobre la línea de tiempo tl. */
  function apply(tl, specs, ctx) {
    for (const spec of specs) {
      const fn = patterns[spec.type];
      if (!fn) throw new Error("vf-motion: patrón desconocido " + spec.type);
      fn(tl, spec, ctx);
    }
    return tl;
  }

  global.VFMotion = { apply, patterns };
})(window);
