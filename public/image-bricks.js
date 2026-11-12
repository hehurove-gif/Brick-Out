// Detección de imagen para Brick Out.
//
// Adaptado del motor de SVG-Converter (src/lib/segment.js):
//  1. El color se compara en espacio Lab, mucho más cercano a lo que ve el ojo que el promedio RGB.
//  2. La paleta (k-means en Lab) se calcula SOLO con píxeles "planos"; los píxeles de borde suavizado
//     son mezclas de dos colores y no deben crear colores propios.
//  3. El fondo se detecta por el color que domina el borde de la imagen y se recorre desde allí, de modo
//     que los blancos del interior (ojos, dientes) se conservan.
//  4. Cada ladrillo toma el color de paleta dominante de su celda en lugar de un promedio, así los
//     bordes no se ensucian y los ladrillos del mismo color comparten el mismo valor (el power-up
//     Cadena los reconoce).
//
// No depende del DOM: recibe píxeles RGBA ya leídos, así que también se puede probar en Node.
(function (root, factory) {
  const api = factory();
  root.BrickImage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Píxeles de análisis por lado de cada ladrillo (la imagen se lee a cols*CELL × rows*CELL).
  const CELL = 16;
  const ALPHA_VISIBLE = 40; // por debajo, el píxel se considera vacío
  const ALPHA_SOLID = 250; // por encima, el píxel es opaco (válido para paleta y fondo)
  const FLAT_LIMIT = 6; // diferencia Lab máxima con los vecinos para ser "plano"
  const BG_TOLERANCE = 16; // diferencia Lab máxima con el color de fondo
  const BG_RING_OPAQUE = 0.85; // el borde debe ser casi todo opaco para buscar fondo
  const BG_RING_SHARE = 0.5; // parte del borde que debe tener el mismo color
  const PHOTO_COVERAGE = 0.6; // cobertura de los 16 colores principales bajo la cual es "foto"
  const COVERAGE_STEPS = [0.3, 0.15, 0.05]; // parte mínima de una celda ocupada por el sujeto

  // ---------- Color en espacio Lab ----------

  const SRGB_LINEAR = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    const c = i / 255;
    SRGB_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  function rgbToLab(r, g, b, out, offset) {
    const R = SRGB_LINEAR[r];
    const G = SRGB_LINEAR[g];
    const B = SRGB_LINEAR[b];
    const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
    const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
    const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    out[offset] = 116 * fy - 16;
    out[offset + 1] = 500 * (fx - fy);
    out[offset + 2] = 200 * (fy - fz);
  }

  const dist2 = (a, ai, b, bi) => (a[ai] - b[bi]) ** 2 + (a[ai + 1] - b[bi + 1]) ** 2 + (a[ai + 2] - b[bi + 2]) ** 2;

  // ---------- Píxeles planos ----------

  // Un píxel es "plano" si es casi idéntico a sus 4 vecinos; los de borde (mezclas) no lo son.
  function computeFlat(data, lab, valid, W, H, limit) {
    const flat = new Uint8Array(W * H);
    const lim = limit * limit;

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = y * W + x;
        if (!valid[i] || data[i * 4 + 3] < ALPHA_SOLID) continue;

        let ok = true;
        const test = (j) => {
          if (!valid[j] || dist2(lab, i * 3, lab, j * 3) > lim) ok = false;
        };
        if (x < W - 1) test(i + 1);
        if (ok && x > 0) test(i - 1);
        if (ok && y < H - 1) test(i + W);
        if (ok && y > 0) test(i - W);
        flat[i] = ok ? 1 : 0;
      }
    }

    return flat;
  }

  // ---------- Fondo ----------

  // Devuelve una máscara con los píxeles de fondo, o null si no hay un fondo claro.
  // Solo actúa cuando el borde de la imagen es casi todo opaco y un mismo color cubre la mitad o más
  // de él (logos y personajes sobre blanco, fotos con pared lisa). Las imágenes con transparencia ya
  // tienen el fondo vacío, y las fotos a sangre no tienen un color de borde dominante.
  function detectBackground(data, lab, W, H) {
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    let visible = 0;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (data[(y * W + x) * 4 + 3] < ALPHA_VISIBLE) continue;
        visible += 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (!visible || x1 - x0 < 8 || y1 - y0 < 8) return null;

    // Anillo de 2 px en el borde del contenido.
    const ring = [];
    let ringTotal = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (x >= x0 + 2 && x <= x1 - 2 && y >= y0 + 2 && y <= y1 - 2) continue;
        ringTotal += 1;
        const i = y * W + x;
        if (data[i * 4 + 3] >= ALPHA_SOLID) ring.push(i);
      }
    }
    if (ring.length < ringTotal * BG_RING_OPAQUE) return null;

    // Color semilla: la cubeta (4 bits por canal) más frecuente del borde, promediada en Lab.
    const buckets = new Map();
    for (const i of ring) {
      const key = ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4);
      const bucket = buckets.get(key) || { count: 0, l: 0, a: 0, b: 0 };
      bucket.count += 1;
      bucket.l += lab[i * 3];
      bucket.a += lab[i * 3 + 1];
      bucket.b += lab[i * 3 + 2];
      buckets.set(key, bucket);
    }
    let top = null;
    for (const bucket of buckets.values()) if (!top || bucket.count > top.count) top = bucket;
    const seed = new Float32Array([top.l / top.count, top.a / top.count, top.b / top.count]);

    const tol2 = BG_TOLERANCE * BG_TOLERANCE;
    const near = (i) => data[i * 4 + 3] >= ALPHA_SOLID && dist2(lab, i * 3, seed, 0) <= tol2;

    const seeds = ring.filter(near);
    if (seeds.length < ring.length * BG_RING_SHARE) return null;

    // Relleno desde el borde: solo píxeles conectados con el borde y parecidos al color de fondo.
    const bg = new Uint8Array(W * H);
    const queue = new Int32Array(W * H);
    let head = 0;
    let tail = 0;
    let bgCount = 0;
    for (const i of seeds) {
      if (bg[i]) continue;
      bg[i] = 1;
      queue[tail] = i;
      tail += 1;
    }
    while (head < tail) {
      const i = queue[head];
      head += 1;
      bgCount += 1;
      const x = i % W;
      const y = (i - x) / W;
      const visit = (j) => {
        if (bg[j] || !near(j)) return;
        bg[j] = 1;
        queue[tail] = j;
        tail += 1;
      };
      if (x > 0) visit(i - 1);
      if (x < W - 1) visit(i + 1);
      if (y > 0) visit(i - W);
      if (y < H - 1) visit(i + W);
    }

    // Seguridad: no quitar casi nada ni casi todo (una imagen de un solo color no tiene "fondo").
    // El mínimo de sujeto es bajo (0.5 %) para no perder siluetas finas como una línea o un trazo.
    if (bgCount < visible * 0.05 || visible - bgCount < visible * 0.005) return null;
    return bg;
  }

  // ---------- Paleta ----------

  // Cuánto de la imagen cubren sus 16 colores más frecuentes. Logos e ilustraciones: casi todo.
  // Fotos con degradados: poco.
  function colorCoverage(data, subject, N) {
    const buckets = new Map();
    let opaque = 0;
    for (let i = 0; i < N; i += 1) {
      if (!subject[i] || data[i * 4 + 3] < ALPHA_SOLID) continue;
      opaque += 1;
      const key = ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    if (!opaque) return 1;
    const top = [...buckets.values()].sort((a, b) => b - a).slice(0, 16);
    return top.reduce((sum, c) => sum + c, 0) / opaque;
  }

  // k-means en Lab sobre un histograma de colores (ponderado por número de píxeles).
  function buildPaletteLab(data, maxColors, mask, photo) {
    const buckets = new Map();
    let total = 0;

    for (let i = 0; i < data.length; i += 4) {
      if (!mask[i >> 2]) continue;

      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      bucket.count += 1;
      bucket.r += data[i];
      bucket.g += data[i + 1];
      bucket.b += data[i + 2];
      buckets.set(key, bucket);
      total += 1;
    }

    if (!total) return null;

    const entries = [...buckets.values()];
    const E = entries.length;
    const lab = new Float32Array(E * 3);
    const weight = new Float32Array(E);

    entries.forEach((entry, index) => {
      rgbToLab(Math.round(entry.r / entry.count), Math.round(entry.g / entry.count), Math.round(entry.b / entry.count), lab, index * 3);
      weight[index] = entry.count;
    });

    // Inicialización voraz: el siguiente centro es el color que más error ponderado reduce.
    const k = Math.min(maxColors, E);
    const centers = new Float32Array(k * 3);
    const minD = new Float32Array(E).fill(Infinity);
    let count = 0;
    let pick = 0;

    for (let i = 1; i < E; i += 1) if (weight[i] > weight[pick]) pick = i;

    while (count < k) {
      centers.set(lab.subarray(pick * 3, pick * 3 + 3), count * 3);
      count += 1;

      let best = -1;
      let bestScore = 0;
      for (let i = 0; i < E; i += 1) {
        const d = dist2(lab, i * 3, centers, (count - 1) * 3);
        if (d < minD[i]) minD[i] = d;
        const score = minD[i] * weight[i];
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }

      if (best < 0) break;
      pick = best;
    }

    const centerCount = count;
    const assign = new Int32Array(E);

    for (let iteration = 0; iteration < 8; iteration += 1) {
      const sums = new Float64Array(centerCount * 4);

      for (let i = 0; i < E; i += 1) {
        let best = 0;
        let bestD = Infinity;
        for (let c = 0; c < centerCount; c += 1) {
          const d = dist2(lab, i * 3, centers, c * 3);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        assign[i] = best;
        sums[best * 4] += lab[i * 3] * weight[i];
        sums[best * 4 + 1] += lab[i * 3 + 1] * weight[i];
        sums[best * 4 + 2] += lab[i * 3 + 2] * weight[i];
        sums[best * 4 + 3] += weight[i];
      }

      for (let c = 0; c < centerCount; c += 1) {
        const w = sums[c * 4 + 3];
        if (!w) continue;
        centers[c * 3] = sums[c * 4] / w;
        centers[c * 3 + 1] = sums[c * 4 + 1] / w;
        centers[c * 3 + 2] = sums[c * 4 + 2] / w;
      }
    }

    // Fusión de colores casi idénticos (ΔE < 8) y descarte de colores insignificantes.
    let list = [];
    const weights = new Float64Array(centerCount);
    for (let i = 0; i < E; i += 1) weights[assign[i]] += weight[i];
    for (let c = 0; c < centerCount; c += 1) {
      if (weights[c] > 0) list.push({ l: centers[c * 3], a: centers[c * 3 + 1], b: centers[c * 3 + 2], w: weights[c] });
    }

    let merged = true;
    while (merged && list.length > 1) {
      merged = false;
      outer: for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const d = Math.hypot(list[i].l - list[j].l, list[i].a - list[j].a, list[i].b - list[j].b);
          if (d < (photo ? 6 : 8)) {
            const w = list[i].w + list[j].w;
            list[i] = {
              l: (list[i].l * list[i].w + list[j].l * list[j].w) / w,
              a: (list[i].a * list[i].w + list[j].a * list[j].w) / w,
              b: (list[i].b * list[i].w + list[j].b * list[j].w) / w,
              w
            };
            list.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }

    const significant = list.filter((item) => item.w / total >= (photo ? 0.0003 : 0.0008));
    if (significant.length >= 2) list = significant;

    const result = new Float32Array(list.length * 3);
    list.forEach((item, index) => result.set([item.l, item.a, item.b], index * 3));
    return result;
  }

  // ---------- Análisis principal ----------

  // `pixels`: { width, height, data } RGBA de tamaño (cols*cell) × (rows*cell).
  // Devuelve las celdas con ladrillo: { col, row, r, g, b, lightness } (lightness = L* de Lab, 0–100).
  function analyze(pixels, cols, rows) {
    const { width: W, height: H, data } = pixels;
    const N = W * H;
    const cell = Math.floor(W / cols);
    const info = { photo: false, backgroundRemoved: false, paletteSize: 0 };
    const empty = { cells: [], info };
    if (!N || cell < 1 || Math.floor(H / rows) < cell) return empty;

    const lab = new Float32Array(N * 3);
    const valid = new Uint8Array(N);
    for (let i = 0; i < N; i += 1) {
      if (data[i * 4 + 3] < ALPHA_VISIBLE) continue;
      valid[i] = 1;
      rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], lab, i * 3);
    }

    const bg = detectBackground(data, lab, W, H);
    info.backgroundRemoved = Boolean(bg);

    // Sujeto: píxeles claramente visibles que no son fondo.
    const subject = new Uint8Array(N);
    const flat = computeFlat(data, lab, valid, W, H, FLAT_LIMIT);
    const mask = new Uint8Array(N);
    let subjectCount = 0;
    let flatCount = 0;
    for (let i = 0; i < N; i += 1) {
      if (data[i * 4 + 3] < 128 || (bg && bg[i])) continue;
      subject[i] = 1;
      subjectCount += 1;
      if (flat[i]) {
        mask[i] = 1;
        flatCount += 1;
      }
    }
    if (!subjectCount) return empty;
    // Fotos con mucho grano: casi no hay píxeles planos, se usan todos.
    if (flatCount < subjectCount * 0.05) for (let i = 0; i < N; i += 1) mask[i] = subject[i];

    info.photo = colorCoverage(data, subject, N) < PHOTO_COVERAGE;
    const palette = buildPaletteLab(data, info.photo ? 12 : 8, mask, info.photo);
    if (!palette) return empty;
    const k = palette.length / 3;
    info.paletteSize = k;

    // Cada píxel del sujeto se asigna a su color de paleta más cercano. El color RGB de cada entrada es
    // el promedio de sus píxeles planos (o de todos los suyos si no tiene ninguno).
    const label = new Int16Array(N).fill(-1);
    const flatSums = new Float64Array(k * 4);
    const allSums = new Float64Array(k * 4);
    for (let i = 0; i < N; i += 1) {
      if (!subject[i]) continue;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c += 1) {
        const d = dist2(lab, i * 3, palette, c * 3);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      label[i] = best;
      const target = flat[i] ? flatSums : allSums;
      target[best * 4] += data[i * 4];
      target[best * 4 + 1] += data[i * 4 + 1];
      target[best * 4 + 2] += data[i * 4 + 2];
      target[best * 4 + 3] += 1;
    }
    const rgb = [];
    for (let c = 0; c < k; c += 1) {
      const sums = flatSums[c * 4 + 3] ? flatSums : allSums;
      const n = sums[c * 4 + 3] || 1;
      rgb.push({ r: Math.round(sums[c * 4] / n), g: Math.round(sums[c * 4 + 1] / n), b: Math.round(sums[c * 4 + 2] / n) });
    }

    // Cada celda toma el color de paleta dominante entre los píxeles del sujeto. Si quedan muy pocos
    // ladrillos se acepta menos cobertura por celda, para no perder siluetas finas.
    const cellPixels = cell * cell;
    const counts = new Int32Array(k);
    const minBricks = Math.max(4, Math.round(cols * rows * 0.06));
    let cells = [];
    for (const minCoverage of COVERAGE_STEPS) {
      cells = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          counts.fill(0);
          let n = 0;
          for (let y = row * cell; y < (row + 1) * cell; y += 1) {
            for (let x = col * cell; x < (col + 1) * cell; x += 1) {
              const l = label[y * W + x];
              if (l >= 0) {
                counts[l] += 1;
                n += 1;
              }
            }
          }
          if (!n || n / cellPixels < minCoverage) continue;
          let best = 0;
          for (let c = 1; c < k; c += 1) if (counts[c] > counts[best]) best = c;
          cells.push({ col, row, r: rgb[best].r, g: rgb[best].g, b: rgb[best].b, lightness: palette[best * 3] });
        }
      }
      if (cells.length >= minBricks) break;
    }

    return { cells, info };
  }

  return { CELL, analyze };
});
