import { useEffect, useRef, useState } from "react";
import type { Design } from "../domain/model";
import {
  WatchViewport,
  type Preset,
  type CameraState,
} from "../render/viewport";

export function Viewport({
  design,
  preset,
  onSelect,
  syncCamera,
  onCamera,
  label,
}: {
  design: Design;
  preset: Preset;
  onSelect: (id: string) => void;
  syncCamera?: CameraState;
  onCamera?: (s: CameraState) => void;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    view = useRef<WatchViewport | null>(null),
    select = useRef(onSelect),
    camera = useRef(onCamera);
  const [warning, setWarning] = useState(""),
    [ready, setReady] = useState(false);
  select.current = onSelect;
  camera.current = onCamera;
  useEffect(() => {
    try {
      view.current = new WatchViewport(
        canvas.current!,
        (id) => select.current(id),
        (message) => {
          setWarning(message);
          setReady(!!view.current?.status.ready);
        },
      );
      view.current.onCamera = (s) => camera.current?.(s);
    } catch {
      setWarning(
        "3D is unavailable in this browser. Your editable design and JSON export remain available.",
      );
    }
    return () => {
      // Fast Refresh can retain this canvas. Release owned resources but keep its
      // context reusable; removed canvases and export canvases lose context fully.
      view.current?.dispose(!canvas.current?.isConnected);
      view.current = null;
    };
  }, []);
  useEffect(() => {
    setReady(false);
    let active = true;
    void view.current
      ?.update(design)
      .then(() => {
        if (active) setReady(!!view.current?.status.ready);
      })
      .catch(() =>
        setWarning(
          "Unable to render this design. Your saved work has been preserved.",
        ),
      );
    return () => {
      active = false;
    };
  }, [design.id, design.revision]);
  useEffect(() => view.current?.setPreset(preset), [preset]);
  useEffect(() => {
    if (syncCamera) view.current?.setCamera(syncCamera);
  }, [syncCamera]);
  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvas}
        aria-label={`${label} 3D watch, drag to rotate`}
        data-ready={ready}
        data-design-revision={design.revision}
      />
      {warning && (
        <p className="viewport-warning" role="status">
          {warning}
        </p>
      )}
      <div className="view-caption">
        <span>{label}</span>
        <span>{preset.toUpperCase()} / 39 MM CONCEPT</span>
      </div>
    </div>
  );
}
