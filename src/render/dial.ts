import { CanvasTexture, SRGBColorSpace } from "three";
import type { Design } from "../domain/model";
import { FONT_FAMILY } from "./resources";

export interface TextBounds {
  id: string;
  width: number;
  height: number;
}
/** A disposable projection of semantic objects, never an editable raster model. */
export function createDialArtwork() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Dial artwork is unavailable.");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const px = 2048 / 32;
  let disposed = false;
  return {
    texture,
    update(design: Design) {
      if (disposed) throw new Error("Dial artwork was disposed.");
      const warnings: string[] = [],
        textBounds: TextBounds[] = [];
      ctx.fillStyle = design.dialColor;
      ctx.fillRect(0, 0, 2048, 2048);
      const track = design.objects[3];
      if (track.visible) {
        ctx.strokeStyle = track.color;
        for (let i = 0; i < 60; i++) {
          const angle = (i / 60) * Math.PI * 2,
            inner = i % 5 === 0 ? 14.7 : 14.9;
          ctx.lineWidth = i % 5 === 0 ? 3 : 1.5;
          ctx.beginPath();
          ctx.moveTo(
            1024 + Math.sin(angle) * 15.2 * px,
            1024 - Math.cos(angle) * 15.2 * px,
          );
          ctx.lineTo(
            1024 + Math.sin(angle) * inner * px,
            1024 - Math.cos(angle) * inner * px,
          );
          ctx.stroke();
        }
      }
      for (const text of [design.objects[0], design.objects[1]]) {
        ctx.font = `500 ${text.size * px}px "${FONT_FAMILY}", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = text.color;
        const width = ctx.measureText(text.text).width / px;
        textBounds.push({
          id: text.id,
          width: Math.max(2, width),
          height: text.size * 1.5,
        });
        if (
          Math.hypot(
            Math.abs(text.x) + width / 2,
            Math.abs(text.y) + text.size * 0.6,
          ) > 15.5
        )
          warnings.push(
            `${text.text || "Text"} extends beyond the dial edge. Reduce its size or move it inward.`,
          );
        ctx.fillText(text.text, 1024 + text.x * px, 1024 - text.y * px);
      }
      texture.needsUpdate = true;
      return { warnings, textBounds };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
      canvas.width = canvas.height = 1;
    },
  };
}
