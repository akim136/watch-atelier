import type { Group, Object3D, Texture } from "three";
import type { Design } from "../domain/model";

export const WATCH_RENDER_CONTRACT = "watch-render-v1" as const;
export const WATCH_ASSET_VERSION = "atelier-39-v1" as const;
export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

/** Read-only projection inputs. Never retain mutable product state in an asset. */
export interface WatchRenderInput {
  readonly design: DeepReadonly<Design>;
  /** Integrator-owned semantic dial artwork. Asset must not mutate or dispose it. */
  readonly dialTexture: Texture;
  /** Font-measured mm bounds from the same artwork producer, for semantic hit targets. */
  readonly textBounds: readonly {
    readonly id: string;
    readonly width: number;
    readonly height: number;
  }[];
}

export interface WatchAsset {
  readonly contractVersion: typeof WATCH_RENDER_CONTRACT;
  readonly assetVersion: typeof WATCH_ASSET_VERSION;
  readonly root: Group;
  /** Pickable nodes use userData.semanticId from the supplied design, never invented IDs. */
  readonly pickables: readonly Object3D[];
  readonly warnings: readonly string[];
  /** Synchronous update after resources are ready. Reuse unaffected geometry/materials. */
  update(input: WatchRenderInput): void;
  /** Idempotent. Dispose all owned resources, but not input textures or host resources. */
  dispose(): void;
}

export type CreateWatchAsset = (input: WatchRenderInput) => WatchAsset;
