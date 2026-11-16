import { inflateSync } from "node:zlib";
import { decode as decodeJpeg } from "jpeg-js";
import { assessRaster, type IdentityAssessment, type IdentityExpectation } from "@/lib/ascension/image-identity-check";

/** Decode the approved provider's PNG or JPEG and refuse pictures that fail
 * the structural identity check. WebP and unreadable files are not shown.
 */
export function assessImageBytes(bytes: Uint8Array, expect: IdentityExpectation): IdentityAssessment {
  try {
    const raster = decodePng(bytes) ?? decodeJpegGray(bytes);
    if (!raster) {
      return { ok: false, reason: "The picture could not be checked against this design, so it was not shown.", objects: 0, collage: false, checked: false };
    }
    return assessRaster(raster.gray, raster.width, raster.height, expect);
  } catch {
    return { ok: false, reason: "The picture could not be checked against this design, so it was not shown.", objects: 0, collage: false, checked: false };
  }
}

function decodeJpegGray(bytes: Uint8Array): { width: number; height: number; gray: Uint8Array } | null {
  if (bytes[0] !== 255 || bytes[1] !== 216) return null;
  const decoded = decodeJpeg(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 20 });
  if (!decoded.width || !decoded.height || decoded.width > 4096 || decoded.height > 4096) return null;
  const gray = new Uint8Array(decoded.width * decoded.height);
  const source = decoded.data;
  for (let index = 0, pixel = 0; index < gray.length; index++, pixel += 4) {
    gray[index] = ((source[pixel] ?? 0) * 30 + (source[pixel + 1] ?? 0) * 59 + (source[pixel + 2] ?? 0) * 11) / 100 | 0;
  }
  return { width: decoded.width, height: decoded.height, gray };
}

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) * 16777216) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
}

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dlu = Math.abs(estimate - upperLeft);
  if (dl <= du && dl <= dlu) return left;
  return du <= dlu ? up : upperLeft;
}

function decodePng(bytes: Uint8Array): { width: number; height: number; gray: Uint8Array } | null {
  if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const chunks: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = readU32(bytes, offset);
    if (offset + 12 + length > bytes.length) return null;
    const type = String.fromCharCode(bytes[offset + 4] ?? 0, bytes[offset + 5] ?? 0, bytes[offset + 6] ?? 0, bytes[offset + 7] ?? 0);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = readU32(data, 0);
      height = readU32(data, 4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? -1;
      interlace = data[12] ?? 0;
    } else if (type === "IDAT") chunks.push(data);
    else if (type === "IEND") break;
  }
  if (!width || !height || width > 4096 || height > 4096 || bitDepth !== 8 || interlace !== 0 || ![0, 2, 6].includes(colorType)) return null;
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : 4;
  const compressed = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  const raw = inflateSync(compressed);
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) return null;
  const gray = new Uint8Array(width * height);
  let previous = new Uint8Array(stride);
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++] ?? 0;
    if (filter > 4) return null;
    const recon = new Uint8Array(stride);
    for (let index = 0; index < stride; index++) {
      const left = index >= channels ? recon[index - channels] ?? 0 : 0;
      const up = previous[index] ?? 0;
      const upperLeft = index >= channels ? previous[index - channels] ?? 0 : 0;
      const value = raw[cursor++] ?? 0;
      recon[index] = filter === 1 ? (value + left) & 255
        : filter === 2 ? (value + up) & 255
        : filter === 3 ? (value + ((left + up) >> 1)) & 255
        : filter === 4 ? (value + paeth(left, up, upperLeft)) & 255
        : value;
    }
    for (let x = 0; x < width; x++) {
      const index = x * channels;
      const red = recon[index] ?? 0;
      const green = channels > 1 ? recon[index + 1] ?? 0 : red;
      const blue = channels > 1 ? recon[index + 2] ?? 0 : red;
      gray[y * width + x] = (red * 30 + green * 59 + blue * 11) / 100 | 0;
    }
    previous = recon;
  }
  return { width, height, gray };
}
