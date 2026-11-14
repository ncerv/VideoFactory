/*
 * vf-textures.js — Texturas procedurales 2D para composiciones VideoFactory (runtime de navegador).
 *
 * Pinta una sola vez, al cargar la escena, los <canvas> que declaran
 * data-vf-texture="sky|fog|grain" junto con sus parámetros en atributos data-*.
 * Todo es determinista: el ruido usa un PRNG con semilla (mulberry32), nunca Math.random.
 * No descarga ni usa imágenes externas.
 *
 * Expone window.VFTextures = { paintAll, paintSky, paintFog, paintGrain, noise2D }.
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

  /** Ruido de gradiente 2D (tipo Perlin) con permutación sembrada. Devuelve valores aprox. en [-1, 1]. */
  function noise2D(seed) {
    const rand = mulberry32(seed);
    const perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const gx = new Float32Array(256);
    const gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const a = rand() * Math.PI * 2;
      gx[i] = Math.cos(a);
      gy[i] = Math.sin(a);
    }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    return function (x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const X = xi & 255;
      const Y = yi & 255;
      const dot = (h, dx, dy) => gx[h] * dx + gy[h] * dy;
      const h00 = perm[X + perm[Y]];
      const h10 = perm[X + 1 + perm[Y]];
      const h01 = perm[X + perm[Y + 1]];
      const h11 = perm[X + 1 + perm[Y + 1]];
      const u = fade(xf);
      const v = fade(yf);
      const n0 = dot(h00, xf, yf) + u * (dot(h10, xf - 1, yf) - dot(h00, xf, yf));
      const n1 = dot(h01, xf, yf - 1) + u * (dot(h11, xf - 1, yf - 1) - dot(h01, xf, yf - 1));
      return (n0 + v * (n1 - n0)) * 1.41;
    };
  }

  function fbm(noise, x, y, octaves) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function parseJson(el, name, fallback) {
    const raw = el.getAttribute(name);
    if (!raw) return fallback;
    return JSON.parse(raw);
  }

  /**
   * Cielo: degradado vertical por paradas + resplandores radiales + velo de nubes fBm.
   * Añade un dithering de ±1 nivel para evitar bandas al codificar en H.264.
   */
  function paintSky(canvas, o) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const stops = o.stops.map(([pos, hex]) => [pos, hexToRgb(hex)]);
    const glows = (o.glows || []).map((g) => ({ ...g, rgb: hexToRgb(g.color) }));
    const clouds = o.clouds || null;
    const cloudNoise = clouds ? noise2D(clouds.seed) : null;
    const cloudRgb = clouds ? hexToRgb(clouds.color) : null;
    const rand = mulberry32(o.seed || 1);

    const rowColor = new Float32Array(3);
    for (let y = 0; y < h; y++) {
      const ty = y / (h - 1);
      let i = 0;
      while (i < stops.length - 2 && ty > stops[i + 1][0]) i++;
      const [p0, c0] = stops[i];
      const [p1, c1] = stops[i + 1];
      const k = smoothstep(0, 1, Math.min(1, Math.max(0, (ty - p0) / (p1 - p0))));
      for (let c = 0; c < 3; c++) rowColor[c] = c0[c] + (c1[c] - c0[c]) * k;

      for (let x = 0; x < w; x++) {
        let r = rowColor[0];
        let g = rowColor[1];
        let b = rowColor[2];
        for (const gl of glows) {
          const dx = (x - gl.x * w) / (gl.r * w);
          const dy = (y - gl.y * h) / (gl.r * w * (gl.squash || 1));
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1) {
            const a = gl.alpha * Math.pow(1 - dist, gl.falloff || 2);
            r += (gl.rgb[0] - r) * a;
            g += (gl.rgb[1] - g) * a;
            b += (gl.rgb[2] - b) * a;
          }
        }
        if (clouds && ty > clouds.from && ty < clouds.to) {
          const band = smoothstep(clouds.from, clouds.from + 0.08, ty) * (1 - smoothstep(clouds.to - 0.1, clouds.to, ty));
          const n = fbm(cloudNoise, (x / w) * clouds.scaleX, (y / h) * clouds.scaleY, 4);
          const a = clouds.alpha * band * smoothstep(clouds.threshold, clouds.threshold + 0.35, n);
          r += (cloudRgb[0] - r) * a;
          g += (cloudRgb[1] - g) * a;
          b += (cloudRgb[2] - b) * a;
        }
        const dither = (rand() + rand() - 1) * 1.2;
        const idx = (y * w + x) * 4;
        d[idx] = r + dither;
        d[idx + 1] = g + dither;
        d[idx + 2] = b + dither;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /**
   * Niebla: máscara fBm estirada en horizontal, modulada por un perfil vertical (banda suave).
   * Se pinta a baja resolución; el CSS la escala y el suavizado bilineal la vuelve más difusa.
   */
  function paintFog(canvas, o) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const noise = noise2D(o.seed);
    const [r, g, b] = hexToRgb(o.color);
    const center = o.center ?? 0.5;
    const spread = o.spread ?? 0.3;
    for (let y = 0; y < h; y++) {
      const ty = y / (h - 1);
      const dy = (ty - center) / spread;
      const profile = Math.exp(-dy * dy * 2.2);
      for (let x = 0; x < w; x++) {
        const n = fbm(noise, (x / w) * o.scaleX, (y / h) * o.scaleY, o.octaves || 5);
        const m = smoothstep(o.threshold, o.threshold + o.softness, n);
        const edge = smoothstep(0, 0.06, x / w) * smoothstep(0, 0.06, 1 - x / w);
        const idx = (y * w + x) * 4;
        d[idx] = r;
        d[idx + 1] = g;
        d[idx + 2] = b;
        d[idx + 3] = 255 * o.alpha * m * profile * edge;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /** Grano: ruido gris centrado en 128, pensado para mezclarse en modo overlay/soft-light. */
  function paintGrain(canvas, o) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const rand = mulberry32(o.seed);
    const amount = o.amount ?? 40;
    for (let i = 0; i < w * h; i++) {
      const v = 128 + (rand() + rand() + rand() - 1.5) * amount;
      d[i * 4] = v;
      d[i * 4 + 1] = v;
      d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  const painters = { sky: paintSky, fog: paintFog, grain: paintGrain };

  /** Pinta todos los canvas con data-vf-texture dentro de root. Devuelve cuántos ha pintado. */
  function paintAll(root) {
    let count = 0;
    root.querySelectorAll("canvas[data-vf-texture]").forEach((canvas) => {
      const kind = canvas.getAttribute("data-vf-texture");
      const painter = painters[kind];
      if (!painter) throw new Error("vf-textures: textura desconocida " + kind);
      painter(canvas, parseJson(canvas, "data-vf-params", {}));
      count++;
    });
    return count;
  }

  global.VFTextures = { paintAll, paintSky, paintFog, paintGrain, noise2D, mulberry32 };
})(window);
