/** Structural gate for every selected-design picture, whatever the object is.
 * Counts separated foreground masses and split layouts. It does not identify
 * parts, measure anything, or prove the picture is the right object.
 * Callers must withhold the picture when ok is false, and must not treat the
 * opening screen as the result before a picture that passes this gate is shown.
 */
export type IdentityExpectation = { count: 1 | 3 };
export type IdentityAssessment = {
  ok: boolean;
  reason: string;
  objects: number;
  collage: boolean;
  checked: boolean;
};

const UNCHECKED = "The picture could not be checked against this design, so it was not shown.";
const SEPARATE = "The picture shows separate objects instead of one assembled machine, so it was not shown.";
const COLLAGE = "The picture is a split layout or multiple views, so it was not shown.";
const EMPTY = "The picture does not show a clear machine, so it was not shown.";
const TOO_MANY = "The picture shows too many separate objects for the selected group, so it was not shown.";

export function assessRaster(gray: Uint8Array, width: number, height: number, expect: IdentityExpectation): IdentityAssessment {
  if (width < 8 || height < 8 || gray.length < width * height) {
    return { ok: false, reason: UNCHECKED, objects: 0, collage: false, checked: false };
  }
  const small = downsample(gray, width, height, 96);
  const pixels = small.gray;
  const w = small.width;
  const h = small.height;
  const corners = cornerMeans(pixels, w, h);
  const background = corners.reduce((sum, value) => sum + value, 0) / corners.length;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const index = y * w + x;
      const lum = pixels[index] ?? 0;
      // Luminance only. Edge detection treated studio shadows as extra objects
      // and joined a real group into one blob.
      if (Math.abs(lum - background) > 36) mask[index] = 1;
    }
  }
  let foreground = 0;
  for (const bit of mask) foreground += bit;
  if (foreground / mask.length < 0.03) return { ok: false, reason: EMPTY, objects: 0, collage: false, checked: true };
  const collage = hasGutter(mask, w, h);
  const objects = countLarge(dilate(mask, w, h, 2), w, h, Math.floor(w * h * 0.04));
  if (objects < 1) return { ok: false, reason: EMPTY, objects, collage: false, checked: true };
  if (collage) return { ok: false, reason: COLLAGE, objects, collage: true, checked: true };
  if (expect.count === 1 && objects >= 2) return { ok: false, reason: SEPARATE, objects, collage: false, checked: true };
  // A close group often joins into one silhouette. Reject only a scattered crowd.
  // Pixel counting cannot prove that a joined silhouette contains exactly three craft.
  if (expect.count === 3 && objects > 4) return { ok: false, reason: TOO_MANY, objects, collage: false, checked: true };
  return {
    ok: true,
    reason: "The picture passed a structural check for object count and layout. It is not engineering verification.",
    objects, collage: false, checked: true,
  };
}

function downsample(gray: Uint8Array, width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  if (scale === 1) return { gray, width, height };
  const w = Math.max(8, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * height / h);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * height / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * width / w);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * width / w));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { sum += gray[yy * width + xx] ?? 0; count++; }
      out[y * w + x] = count ? (sum / count) | 0 : 0;
    }
  }
  return { gray: out, width: w, height: h };
}

function cornerMeans(pixels: Uint8Array, w: number, h: number): number[] {
  const size = Math.max(2, Math.min(8, Math.floor(Math.min(w, h) / 4)));
  return [[0, 0], [w - size, 0], [0, h - size], [w - size, h - size]].map(([x0, y0]) => {
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) { sum += pixels[y * w + x] ?? 0; count++; }
    return sum / count;
  });
}

function dilate(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(h - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) out[row + xx] = 1;
      }
    }
  }
  return out;
}

function countLarge(mask: Uint8Array, w: number, h: number, minArea: number): number {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let found = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let area = 0;
    while (top) {
      const index = stack[--top]!;
      area++;
      const x = index % w;
      const next = [index - 1, index + 1, index - w, index + w];
      for (const neighbor of next) {
        if (neighbor < 0 || neighbor >= mask.length || seen[neighbor] || !mask[neighbor]) continue;
        if (Math.abs((neighbor % w) - x) > 1) continue;
        seen[neighbor] = 1;
        stack[top++] = neighbor;
      }
    }
    if (area >= minArea) found++;
  }
  return found;
}

function density(mask: Uint8Array, w: number, x0: number, x1: number, y0: number, y1: number): number {
  let hits = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { total++; hits += mask[y * w + x] ?? 0; }
  return total ? hits / total : 0;
}

function hasSpan(empty: (index: number) => boolean, from: number, to: number, minRun: number): boolean {
  let run = 0;
  for (let index = from; index < to; index++) {
    if (empty(index)) {
      run++;
      if (run >= minRun) return true;
    } else run = 0;
  }
  return false;
}

function hasGutter(mask: Uint8Array, w: number, h: number): boolean {
  const column = (x: number) => {
    let hits = 0;
    for (let y = 0; y < h; y++) hits += mask[y * w + x] ?? 0;
    return hits / h;
  };
  const rowDensity = (y: number) => {
    let hits = 0;
    const offset = y * w;
    for (let x = 0; x < w; x++) hits += mask[offset + x] ?? 0;
    return hits / w;
  };
  // A real split layout has a wide empty band, not the small gap between rotors or a close group.
  const vertical = hasSpan(x => column(x) < 0.04, Math.floor(w * 0.28), Math.ceil(w * 0.72), Math.max(6, Math.floor(w * 0.12)));
  if (vertical) {
    const left = density(mask, w, 0, Math.floor(w * 0.28), 0, h);
    const right = density(mask, w, Math.ceil(w * 0.72), w, 0, h);
    if (left > 0.16 && right > 0.16) return true;
  }
  const horizontal = hasSpan(y => rowDensity(y) < 0.04, Math.floor(h * 0.28), Math.ceil(h * 0.72), Math.max(6, Math.floor(h * 0.12)));
  if (horizontal) {
    const top = density(mask, w, 0, w, 0, Math.floor(h * 0.28));
    const bottom = density(mask, w, 0, w, Math.ceil(h * 0.72), h);
    if (top > 0.16 && bottom > 0.16) return true;
  }
  return false;
}
