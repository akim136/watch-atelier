import { test, expect } from "@playwright/test";

test("[M1-09] actual raster pipeline normalizes orientation and enforces decode and byte limits", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-ready",
    "true",
  );
  const result = await page.evaluate(async () => {
    const modulePath = "/src/storage/assets.ts";
    const { ingestReference, rasterHeader } = await import(modulePath);
    const pixel = Uint8Array.from(
      atob("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA"),
      (c) => c.charCodeAt(0),
    );
    // Byte-budget control: valid 10 MiB still WebP with an inert RIFF JUNK chunk.
    const padded = new Uint8Array(10 * 1024 ** 2);
    padded.set(pixel);
    const view = new DataView(padded.buffer);
    view.setUint32(4, padded.length - 8, true);
    padded.set(new TextEncoder().encode("JUNK"), pixel.length);
    view.setUint32(pixel.length + 4, padded.length - pixel.length - 8, true);
    const maxBytes = await ingestReference(
      new File([padded], "max.webp", { type: "image/webp" }),
    );
    let overBytes = "";
    try {
      await ingestReference(
        new File([padded, new Uint8Array(1)], "over.webp", {
          type: "image/webp",
        }),
      );
    } catch (e) {
      overBytes = (e as Error).message;
    }
    let wrongMime = "";
    try {
      await ingestReference(
        new File([pixel], "wrong.png", { type: "image/png" }),
      );
    } catch (e) {
      wrongMime = (e as Error).message;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 6000;
    canvas.height = 4000;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#678987";
    ctx.fillRect(0, 0, 6000, 4000);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png"),
    );
    const maxPixels = await ingestReference(
      new File([blob], "24mp.png", { type: "image/png" }),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer()),
      header = new DataView(bytes.buffer);
    header.setUint32(16, 6001);
    let overPixels = "";
    try {
      rasterHeader(bytes);
    } catch (e) {
      overPixels = (e as Error).message;
    }
    header.setUint32(16, 12000);
    header.setUint32(20, 1);
    const sideControl = rasterHeader(bytes).width;
    header.setUint32(16, 12001);
    let overSide = "";
    try {
      rasterHeader(bytes);
    } catch (e) {
      overSide = (e as Error).message;
    }
    // Decoder-normalized JPEG EXIF orientation 6, authored from a synthetic 50×30 raster.
    canvas.width = 50;
    canvas.height = 30;
    ctx.fillStyle = "#ab6543";
    ctx.fillRect(0, 0, 50, 30);
    const jpeg = new Uint8Array(
      await (
        await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), "image/jpeg"),
        )
      ).arrayBuffer(),
    );
    const exif = Uint8Array.from([
      0xff, 0xe1, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1,
      0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const oriented = new Uint8Array(jpeg.length + exif.length);
    oriented.set(jpeg.subarray(0, 2));
    oriented.set(exif, 2);
    oriented.set(jpeg.subarray(2), 2 + exif.length);
    const orientation = await ingestReference(
      new File([oriented], "oriented.jpg", { type: "image/jpeg" }),
    );
    canvas.width = canvas.height = 1;
    // Animated content is rejected at bounded header inspection, before decode.
    const animated = new Uint8Array(pixel.length + 18);
    animated.set(pixel.subarray(0, 12));
    animated.set(new TextEncoder().encode("VP8X"), 12);
    new DataView(animated.buffer).setUint32(16, 10, true);
    animated[20] = 2;
    animated.set(pixel.subarray(12), 30);
    new DataView(animated.buffer).setUint32(4, animated.length - 8, true);
    let animation = "";
    try {
      rasterHeader(animated);
    } catch (e) {
      animation = (e as Error).message;
    }
    return {
      maxBytes: maxBytes.record,
      maxPixels: maxPixels.record,
      orientation: orientation.record,
      overBytes,
      wrongMime,
      overPixels,
      sideControl,
      overSide,
      animation,
    };
  });
  expect(result.maxBytes.width).toBe(1);
  expect(result.maxBytes.bytes).toBeLessThan(1024);
  expect(result.overBytes).toMatch(/10 MiB/);
  expect(result.wrongMime).toMatch(/signature/);
  expect([result.maxPixels.width, result.maxPixels.height]).toEqual([
    2048, 1365,
  ]);
  expect(result.overPixels).toMatch(/24 megapixels/);
  expect(result.sideControl).toBe(12000);
  expect(result.overSide).toMatch(/12,000/);
  expect([result.orientation.width, result.orientation.height]).toEqual([
    30, 50,
  ]);
  expect(result.animation).toMatch(/Animated/);
});
