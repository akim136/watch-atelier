import { sha256 } from "../storage/assets";
import { type Design } from "../domain/model";

export const FONT_HASHES = {
  regular: "a71a56e516751883cb7877112d39f9c13b92c2dc15caaf00277b7f9d941d673a",
  medium: "eb93da02ace70c39e4c4e811b8b02dd5f5d4804d186202d6668bea60d22f57d0",
};
export const FONT_FAMILY = "Atelier Plex";
let fontPromise: Promise<void> | undefined;
export function loadFonts() {
  return (fontPromise ??= Promise.all(
    (["regular", "medium"] as const).map(async (key) => {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(
          `/fonts/IBMPlexSansCondensed-${key === "regular" ? "Regular" : "Medium"}.woff2`,
          { signal: controller.signal },
        );
        if (!response.ok) throw Error("Font unavailable");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if ((await sha256(bytes)) !== FONT_HASHES[key])
          throw Error("Font hash mismatch");
        const face = await new FontFace(FONT_FAMILY, bytes, {
          weight: key === "regular" ? "400" : "500",
        }).load();
        document.fonts.add(face);
      } finally {
        clearTimeout(timer);
      }
    }),
  )
    .then(() => undefined)
    .catch(() => {
      throw new Error(
        "The intended dial font is unavailable. A fallback preview is shown; PNG export is blocked. Restore the bundled font and reload.",
      );
    }));
}
export const dialKey = (d: Design) =>
  JSON.stringify({
    font: d.font,
    hashes: FONT_HASHES,
    dialColor: d.dialColor,
    objects: d.objects,
  });
export const renderManifest = (d: Design, camera: string) => ({
  designId: d.id,
  revision: d.revision,
  input: JSON.stringify(d),
  dialKey: dialKey(d),
  recipe: "atelier-39-v1",
  materials: "steel-studio-v1",
  fontHashes: FONT_HASHES,
  camera,
  output: "sRGB/ACES/exposure1",
});
