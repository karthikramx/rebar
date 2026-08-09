import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
} from "react";
import { Color } from "three";
import { IfcViewerAPI } from "web-ifc-viewer";

/**
 * Wraps web-ifc-viewer. Exposes an imperative API via ref:
 *   - load(url)              → load an IFC model (disposes previous)
 *   - loadFile(file)         → load an IFC model from a File object
 *   - clear()                → remove currently loaded model
 *   - fitToFrame()           → zoom camera to scene extents
 *   - toggleClipping()       → toggle a clipping plane at cursor
 *
 * Callbacks:
 *   - onSelect({ modelID, expressID, properties })
 *   - onLoadStart(url) / onLoadEnd(url) / onLoadError(err)
 */
const IFCViewer = forwardRef(function IFCViewer(
  { onSelect, onLoadStart, onLoadEnd, onLoadError, className, style },
  ref,
) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const modelRef = useRef(null);
  const readyRef = useRef(false); // true only while a model is fully loaded
  const loadingRef = useRef(false); // true while a load is in progress
  const disposedRef = useRef(false);

  // ---------- init ----------
  useEffect(() => {
    disposedRef.current = false;
    const container = containerRef.current;
    if (!container) return;

    const viewer = new IfcViewerAPI({
      container,
      backgroundColor: new Color(0xf5f5f7),
    });
    viewerRef.current = viewer;

    viewer.axes.setAxes();
    viewer.grid.setGrid();
    // web-ifc's SetWasmPath treats paths as relative to the script directory
    // (e.g. /static/js/) unless we pass absolute=true. The higher-level
    // wrappers (viewer.IFC.setWasmPath / ifcManager.setWasmPath) drop the
    // absolute flag, so call the underlying IfcAPI directly.
    try {
      const ifcAPI = viewer.IFC.loader.ifcManager.state.api;
      ifcAPI.SetWasmPath("/wasm/", true);
      viewer.IFC.loader.ifcManager.state.wasmPath = "/wasm/";
    } catch (e) {
      // Fallback for older APIs.
      // eslint-disable-next-line no-console
      console.warn("Falling back to relative wasm path:", e);
      viewer.IFC.setWasmPath("/wasm/");
    }

    // hover pre-selection — only when a model is fully loaded. NOTE:
    // prePickIfcItem() is async, so a plain try/catch will NOT catch its
    // rejections — we must attach .catch() to the promise itself.
    const handleMove = () => {
      if (disposedRef.current || !readyRef.current) return;
      Promise.resolve()
        .then(() => viewer.IFC.selector.prePickIfcItem())
        .catch(() => {
          /* raycast noise mid-load — ignore */
        });
    };
    // click selection
    const handleClick = async () => {
      if (disposedRef.current || !readyRef.current) return;
      try {
        const result = await viewer.IFC.selector.pickIfcItem(true);
        if (!result) {
          onSelect?.(null);
          return;
        }
        const { modelID, id } = result;
        const properties = await viewer.IFC.getProperties(
          modelID,
          id,
          true,
          false,
        );
        onSelect?.({ modelID, expressID: id, properties });
      } catch (err) {
        // swallow selection errors – they are usually raycast noise
        // eslint-disable-next-line no-console
        console.warn("Selection error:", err);
      }
    };

    container.addEventListener("mousemove", handleMove);
    container.addEventListener("click", handleClick);

    // web-ifc-viewer only re-fits the renderer/camera on the window
    // "resize" event, so layout changes that resize the container itself
    // (e.g. collapsing a sidebar) leave the canvas at its old resolution
    // and aspect ratio, making the render appear to shift/stretch. Watch
    // the container directly and re-sync the viewer whenever its size
    // changes.
    const resizeObserver = new ResizeObserver(() => {
      if (disposedRef.current) return;
      try {
        viewer.context.updateAspect();
      } catch (_) {
        // ignore transient errors during dispose/init races
      }
    });
    resizeObserver.observe(container);

    return () => {
      disposedRef.current = true;
      resizeObserver.disconnect();
      container.removeEventListener("mousemove", handleMove);
      container.removeEventListener("click", handleClick);
      try {
        if (viewer.dispose) {
          viewer.dispose();
        }
      } catch (e) {
        // ignore double-dispose
      }
      viewerRef.current = null;
      modelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- imperative API ----------
  const clearModel = useCallback(async () => {
    const viewer = viewerRef.current;
    const model = modelRef.current;
    readyRef.current = false;
    if (!viewer || !model) return;
    try {
      await viewer.IFC.selector.unpickIfcItems();
      await viewer.IFC.selector.unHighlightIfcItems();
    } catch (_) {}
    // Remove the mesh from the viewer's raycast target lists BEFORE closing
    // the model, otherwise hover picks keep hitting the stale mesh and crash
    // with "Cannot read properties of undefined (reading 'mesh')".
    try {
      const items = viewer.context.items;
      items.ifcModels = items.ifcModels.filter((m) => m !== model);
      items.pickableIfcModels = items.pickableIfcModels.filter(
        (m) => m !== model,
      );
    } catch (_) {}
    try {
      viewer.context.getScene().remove(model);
    } catch (_) {}
    try {
      await viewer.IFC.loader.ifcManager.close(model.modelID);
    } catch (_) {}
    modelRef.current = null;
  }, []);

  const load = useCallback(
    async (url) => {
      const viewer = viewerRef.current;
      if (!viewer || !url) return;
      if (loadingRef.current) {
        // eslint-disable-next-line no-console
        console.warn("IFC load already in progress; ignoring:", url);
        return;
      }
      loadingRef.current = true;
      onLoadStart?.(url);
      try {
        await clearModel();
        const model = await viewer.IFC.loadIfcUrl(url);
        if (!model) throw new Error("loadIfcUrl returned null");
        modelRef.current = model;
        // fit camera to the newly loaded model before enabling interactions
        try {
          viewer.context.fitToFrame();
        } catch (_) {}
        readyRef.current = true;
        onLoadEnd?.(url);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to load IFC:", err);
        onLoadError?.(err);
      } finally {
        loadingRef.current = false;
      }
    },
    [clearModel, onLoadStart, onLoadEnd, onLoadError],
  );

  const fitToFrame = useCallback(() => {
    try {
      viewerRef.current?.context.fitToFrame();
    } catch (_) {}
  }, []);

  // Load from a user-provided File (e.g. <input type="file">). We convert it
  // to an object URL, reuse `load`, then revoke the URL.
  const loadFile = useCallback(
    async (file) => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      try {
        await load(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [load],
  );

  const toggleClipping = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      viewer.clipper.active = !viewer.clipper.active;
      if (viewer.clipper.active) viewer.clipper.createPlane();
    } catch (_) {}
  }, []);

  useImperativeHandle(
    ref,
    () => ({ load, loadFile, clear: clearModel, fitToFrame, toggleClipping }),
    [load, loadFile, clearModel, fitToFrame, toggleClipping],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...style,
      }}
    />
  );
});

export default IFCViewer;
