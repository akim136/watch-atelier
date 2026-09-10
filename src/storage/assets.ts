import { LIMITS, type AssetRecord } from "../domain/model";

export type AssetBytes = Map<string, Uint8Array<ArrayBuffer>>;
export const sha256 = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const bad = (): never => {
  throw new Error(
    "This image is malformed or unsupported. Choose a still PNG, JPEG, or WebP.",
  );
};
const ascii = (b: Uint8Array, start: number, n: number) =>
  String.fromCharCode(...b.subarray(start, start + n));
export function rasterHeader(bytes: Uint8Array): {
  width: number;
  height: number;
  mediaType: string;
} {
  const b = bytes;
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let width = 0,
    height = 0,
    mediaType = "";
  const fits = (p: number, n: number) => {
    if (p < 0 || n < 0 || p + n > b.length) bad();
  };
  if (b.length >= 24 && ascii(b, 0, 8) === "\x89PNG\r\n\x1a\n") {
    mediaType = "image/png";
    let p = 8,
      seen = false,
      end = false;
    while (p < b.length) {
      fits(p, 12);
      const size = d.getUint32(p);
      fits(p, size + 12);
      const kind = ascii(b, p + 4, 4);
      if (!seen && kind !== "IHDR") bad();
      if (kind === "acTL" || kind === "fcTL" || kind === "fdAT")
        throw new Error("Animated images are not supported.");
      if (kind === "IHDR") {
        if (seen || size !== 13) bad();
        width = d.getUint32(p + 8);
        height = d.getUint32(p + 12);
        seen = true;
      }
      p += size + 12;
      if (kind === "IEND") {
        if (size !== 0 || p !== b.length) bad();
        end = true;
        break;
      }
    }
    if (!end) bad();
  } else if (
    b.length >= 12 &&
    ascii(b, 0, 4) === "RIFF" &&
    ascii(b, 8, 4) === "WEBP"
  ) {
    mediaType = "image/webp";
    if (d.getUint32(4, true) + 8 !== b.length) bad();
    let p = 12,
      xw = 0,
      xh = 0,
      images = 0;
    while (p < b.length) {
      fits(p, 8);
      const kind = ascii(b, p, 4),
        size = d.getUint32(p + 4, true);
      fits(p + 8, size);
      const q = p + 8;
      if (kind === "ANIM" || kind === "ANMF")
        throw new Error("Animated images are not supported.");
      if (kind === "VP8X") {
        if (size !== 10 || xw) bad();
        if (b[q] & 2) throw new Error("Animated images are not supported.");
        xw = 1 + b[q + 4] + b[q + 5] * 256 + b[q + 6] * 65536;
        xh = 1 + b[q + 7] + b[q + 8] * 256 + b[q + 9] * 65536;
      } else if (kind === "VP8 ") {
        if (size < 10 || ascii(b, q + 3, 3) !== "\x9d\x01\x2a") bad();
        width = d.getUint16(q + 6, true) & 0x3fff;
        height = d.getUint16(q + 8, true) & 0x3fff;
        images++;
      } else if (kind === "VP8L") {
        if (size < 5 || b[q] !== 0x2f) bad();
        const bits = d.getUint32(q + 1, true);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
        images++;
      }
      p = q + size + (size % 2);
      fits(p, 0);
    }
    if (images !== 1 || (xw && (xw !== width || xh !== height))) bad();
  } else if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    mediaType = "image/jpeg";
    let p = 2;
    let frame = false,
      scan = false;
    if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) bad();
    while (p < b.length - 2) {
      if (b[p++] !== 0xff) bad();
      while (b[p] === 0xff) p++;
      fits(p, 1);
      const marker = b[p++];
      if (marker === 0xda) {
        scan = true;
        break;
      }
      if (marker === 0 || marker === 0xd8 || marker === 0xd9) bad();
      fits(p, 2);
      const size = d.getUint16(p);
      if (size < 2) bad();
      fits(p, size);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (frame || size < 8) bad();
        height = d.getUint16(p + 3);
        width = d.getUint16(p + 5);
        frame = true;
      }
      p += size;
    }
    if (!frame || !scan) bad();
  } else bad();
  if (
    width < 1 ||
    height < 1 ||
    width > 12000 ||
    height > 12000 ||
    width * height > 24000000
  )
    throw new Error(
      "Images must be at most 24 megapixels and 12,000 pixels per side.",
    );
  return { width, height, mediaType };
}
export async function decodeRaster(
  bytes: Uint8Array<ArrayBuffer>,
  mediaType: string,
): Promise<ImageBitmap> {
  let expired = false;
  let timeout: ReturnType<typeof setTimeout>;
  const load = createImageBitmap(new Blob([bytes], { type: mediaType }), {
    imageOrientation: "from-image",
  }).then((bitmap) => {
    if (expired) {
      bitmap.close();
      throw new Error("Image decoding timed out.");
    }
    return bitmap;
  });
  try {
    return await Promise.race([
      load,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          expired = true;
          reject(new Error("Image decoding timed out."));
        }, 10000);
      }),
    ]);
  } finally {
    clearTimeout(timeout!);
  }
}
export async function ingestReference(
  file: File,
): Promise<{ record: AssetRecord; bytes: Uint8Array<ArrayBuffer> }> {
  if (file.size > LIMITS.sourceBytes)
    throw new Error("Choose an image of 10 MiB or less.");
  const source = new Uint8Array(await file.arrayBuffer());
  const info = rasterHeader(source);
  if (file.type && file.type !== info.mediaType)
    throw new Error("The image signature does not match its file type.");
  const bitmap = await decodeRaster(source, info.mediaType);
  try {
    if (bitmap.width * bitmap.height !== info.width * info.height)
      throw new Error("Decoded image dimensions do not match its header.");
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Unable to prepare this image.")),
        "image/webp",
        0.86,
      ),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > LIMITS.assetBytes)
      throw new Error("The processed image exceeds 5 MiB.");
    const normalized = rasterHeader(bytes);
    if (normalized.mediaType !== "image/webp")
      throw new Error("This browser cannot encode WebP references.");
    return {
      bytes,
      record: {
        hash: await sha256(bytes),
        mediaType: "image/webp",
        width: canvas.width,
        height: canvas.height,
        bytes: bytes.length,
        source: "user-local-unverified",
        recipe: "reference-preview-v1",
      },
    };
  } finally {
    bitmap.close();
  }
}
export async function validateAsset(
  record: AssetRecord,
  bytes: Uint8Array<ArrayBuffer>,
  decode = false,
) {
  if (bytes.length !== record.bytes || (await sha256(bytes)) !== record.hash)
    throw new Error(
      "Reference data is missing or its content hash does not match.",
    );
  const info = rasterHeader(bytes);
  if (
    info.mediaType !== record.mediaType ||
    info.width !== record.width ||
    info.height !== record.height
  )
    throw new Error("Reference dimensions or media type do not match.");
  if (decode) {
    const image = await decodeRaster(bytes, info.mediaType);
    try {
      if (image.width !== record.width || image.height !== record.height)
        throw new Error("Decoded reference dimensions do not match.");
    } finally {
      image.close();
    }
  }
}
