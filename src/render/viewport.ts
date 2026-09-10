import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { type Design } from "../domain/model";
import { buildWatch } from "./watch";
import type { WatchAsset } from "./contract";
import { createDialArtwork } from "./dial";
import { loadFonts, renderManifest } from "./resources";

export type Preset = "Oblique" | "Front" | "Profile" | "Detail";
export type CameraState = {
  position: number[];
  target: number[];
  zoom: number;
};
export const presets: Record<Preset, CameraState> = {
  Oblique: { position: [35, 40, 115], target: [0, 0, 0], zoom: 1 },
  Front: { position: [0, 0, 130], target: [0, 0, 0], zoom: 1 },
  Profile: { position: [100, 28, 12], target: [0, 0, 0], zoom: 1.15 },
  Detail: { position: [18, 25, 110], target: [0, 1, 3], zoom: 2.15 },
};
export const sameCamera = (a: CameraState, b: CameraState) =>
  Math.abs(a.zoom - b.zoom) < 1e-8 &&
  a.position.every((n, i) => Math.abs(n - b.position[i]) < 1e-8) &&
  a.target.every((n, i) => Math.abs(n - b.target[i]) < 1e-8);
export class WatchViewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  readonly controls: OrbitControls;
  private model?: WatchAsset;
  private artwork = createDialArtwork();
  private modelKey = "";
  private environment: THREE.WebGLRenderTarget;
  private applyingCamera = false;
  private contextLost = false;
  private observer?: ResizeObserver;
  private disposed = false;
  private design?: Design;
  private latestInput?: Design;
  private ready = false;
  private fontFailure = "";
  private requested = 0;
  private presetName: Preset = "Oblique";
  private pointer?: [number, number];
  private change = () => {
    this.render();
    if (!this.applyingCamera) this.onCamera?.(this.cameraState());
  };
  private down = (e: PointerEvent) => {
    this.pointer = [e.clientX, e.clientY];
  };
  private up = (e: PointerEvent) => {
    if (
      !this.pointer ||
      Math.hypot(e.clientX - this.pointer[0], e.clientY - this.pointer[1]) >
        4 ||
      !this.model
    )
      return;
    const rect = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hits = ray
      .intersectObjects([...this.model.pickables])
      .filter(
        (h) =>
          h.object.userData.semanticId !==
          this.design?.components.find((c) => c.role === "crystal")?.id,
      );
    const hit = hits[0];
    if (hit) this.onSelect?.(hit.object.userData.semanticId);
  };
  private lost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.ready = false;
    this.onStatus?.(this.contextWarning);
  };
  private get contextWarning() {
    return this.contextLost || this.renderer.getContext().isContextLost()
      ? "3D context lost. Your design is preserved. Waiting for recovery; reload if the viewport does not return."
      : "";
  }
  private createEnvironment() {
    const env = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    try {
      return pmrem.fromScene(env, 0.03);
    } finally {
      env.dispose();
      pmrem.dispose();
    }
  }
  private restored = () => {
    if (this.disposed) return;
    this.contextLost = false;
    // Render-target contents do not survive a lost context. Recreate the lighting
    // projection as well as uploading the latest semantic artwork/geometry again.
    this.environment.dispose();
    this.environment = this.createEnvironment();
    this.scene.environment = this.environment.texture;
    if (this.latestInput)
      void this.update(this.latestInput).catch(() => {
        this.ready = false;
        this.onStatus?.(
          "3D recovery failed. Your design is preserved; reload to retry.",
        );
      });
  };
  onCamera?: (state: CameraState) => void;
  constructor(
    readonly canvas: HTMLCanvasElement,
    private onSelect?: (id: string) => void,
    private onStatus?: (message: string) => void,
    exporting = false,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: exporting,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      exporting ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene.background = new THREE.Color("#151c21");
    this.environment = this.createEnvironment();
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 1.6;
    this.scene.add(new THREE.HemisphereLight(0xe9f0ff, 0x6f4830, 2.2));
    const key = new THREE.DirectionalLight(0xfff4de, 4);
    key.position.set(-35, 55, 70);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xa1c7f6, 2);
    fill.position.set(40, -10, 20);
    this.scene.add(fill);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 220;
    this.controls.addEventListener("change", this.change);
    canvas.addEventListener("webglcontextlost", this.lost);
    canvas.addEventListener("webglcontextrestored", this.restored);
    this.setPreset("Oblique");
    if (!exporting) {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
      canvas.addEventListener("pointerdown", this.down);
      canvas.addEventListener("pointerup", this.up);
      this.resize();
    }
  }
  get status() {
    return {
      ready: this.ready && !this.contextWarning,
      fontFailure: this.fontFailure,
      manifest: this.design
        ? renderManifest(this.design, this.presetName)
        : null,
      resources: { ...this.renderer.info.memory },
    };
  }
  cameraState(): CameraState {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      zoom: this.camera.zoom,
    };
  }
  setCamera(state: CameraState) {
    if (sameCamera(this.cameraState(), state)) return;
    this.applyingCamera = true;
    this.camera.position.fromArray(state.position);
    this.camera.zoom = state.zoom;
    this.controls.target.fromArray(state.target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.applyingCamera = false;
    this.render();
  }
  setPreset(preset: Preset) {
    this.presetName = preset;
    this.setCamera(presets[preset]);
  }
  resize(width = this.canvas.clientWidth, height = this.canvas.clientHeight) {
    if (width < 1 || height < 1) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }
  async update(design: Design) {
    const request = ++this.requested;
    this.ready = false;
    const captured = structuredClone(design);
    this.latestInput = captured;
    try {
      await loadFonts();
    } catch (e) {
      this.fontFailure = (e as Error).message;
    }
    if (this.disposed || request !== this.requested) return;
    const artwork = this.artwork.update(captured);
    const input = {
      design: captured,
      dialTexture: this.artwork.texture,
      textBounds: artwork.textBounds,
    };
    const key = JSON.stringify({
      template: captured.template,
      components: captured.components,
      ids: captured.objects.map((o) => o.id),
      markers: {
        style: captured.objects[2].style,
        length: captured.objects[2].length,
      },
      hands: captured.handStyle,
      strap: captured.strap,
    });
    if (this.model && this.modelKey === key) this.model.update(input);
    else {
      this.model?.dispose();
      if (this.model) this.scene.remove(this.model.root);
      this.model = buildWatch(input);
      this.modelKey = key;
      this.scene.add(this.model.root);
    }
    this.design = captured;
    this.ready = !this.fontFailure && !this.contextWarning;
    this.onStatus?.(
      [
        this.contextWarning,
        this.fontFailure,
        ...artwork.warnings,
        ...this.model.warnings,
      ]
        .filter(Boolean)
        .join(" "),
    );
    this.render();
  }
  render() {
    if (this.disposed || this.contextWarning) return;
    this.renderer.render(this.scene, this.camera);
  }
  dispose(loseContext = true) {
    if (this.disposed) return;
    this.disposed = true;
    ++this.requested;
    this.observer?.disconnect();
    this.controls.removeEventListener("change", this.change);
    this.controls.dispose();
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("webglcontextlost", this.lost);
    this.canvas.removeEventListener("webglcontextrestored", this.restored);
    this.model?.dispose();
    this.artwork.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    if (loseContext) this.renderer.forceContextLoss();
  }
}
export async function exportPNG(
  design: Design,
  preset: Preset = "Oblique",
): Promise<Blob> {
  await loadFonts();
  const canvas = document.createElement("canvas");
  const view = new WatchViewport(canvas, undefined, undefined, true);
  try {
    view.resize(1600, 1200);
    view.setPreset(preset);
    await view.update(structuredClone(design));
    if (
      !view.status.ready ||
      view.status.manifest?.input !== JSON.stringify(design)
    )
      throw new Error("Preview resources are not ready for this design.");
    view.render();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("PNG export failed. Try again.")),
        "image/png",
      ),
    );
  } finally {
    view.dispose();
    canvas.width = canvas.height = 1;
  }
}
