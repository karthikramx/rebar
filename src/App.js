import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  FileBox,
  Focus,
  Info,
  Layers,
  ListTree,
  Loader2,
  Menu,
  MousePointerClick,
  Scissors,
  Upload,
  X,
} from "lucide-react";

import IFCViewer from "./components/IFCViewer";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Separator } from "./components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { cn } from "./lib/utils";
import { ifcCatalog } from "./lib/ifcCatalog";

const DESKTOP_MEDIA = "(min-width: 768px)";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(DESKTOP_MEDIA).matches
      : true,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MEDIA);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

function formatPropValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    if ("value" in v) return String(v.value);
    return JSON.stringify(v);
  }
  return String(v);
}

function PropertyList({ props }) {
  if (!props) return null;
  const entries = Object.entries(props).filter(
    ([k]) => !["expressID", "type"].includes(k),
  );
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-all font-mono">{formatPropValue(v)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export default function App() {
  const viewerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [activeUrl, setActiveUrl] = useState(null);
  const [activeName, setActiveName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selection, setSelection] = useState(null);

  const isDesktop = useIsDesktop();
  // Panels open on desktop by default, closed on mobile. Whenever the
  // viewport crosses the breakpoint, sync back to the sensible default.
  const [leftOpen, setLeftOpen] = useState(isDesktop);
  const [rightOpen, setRightOpen] = useState(isDesktop);
  useEffect(() => {
    setLeftOpen(isDesktop);
    setRightOpen(isDesktop);
  }, [isDesktop]);

  // On mobile the two side panels are full-screen overlays, so only one
  // should ever be open at a time. On desktop they live side-by-side and
  // can both be open together.
  const toggleLeft = () => {
    setLeftOpen((v) => {
      const next = !v;
      if (next && !isDesktop) setRightOpen(false);
      return next;
    });
  };
  const toggleRight = () => {
    setRightOpen((v) => {
      const next = !v;
      if (next && !isDesktop) setLeftOpen(false);
      return next;
    });
  };

  const groups = useMemo(() => ifcCatalog, []);

  const handleLoad = async (group, file) => {
    const url = `${group.baseUrl}/${encodeURIComponent(file)}`;
    setError(null);
    setSelection(null);
    setActiveUrl(url);
    setActiveName(file);
    setLoading(true);
    if (!isDesktop) setLeftOpen(false);
    await viewerRef.current?.load(url);
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    // reset so selecting the same file again re-triggers onChange
    event.target.value = "";
    if (!file) return;
    setError(null);
    setSelection(null);
    setActiveUrl(`upload::${file.name}`);
    setActiveName(file.name);
    setLoading(true);
    if (!isDesktop) setLeftOpen(false);
    await viewerRef.current?.loadFile(file);
  };

  const handleSelect = (sel) => {
    setSelection(sel);
    if (sel && !isDesktop) {
      setRightOpen(true);
      setLeftOpen(false);
    }
  };

  const showMobileBackdrop = !isDesktop && (leftOpen || rightOpen);

  return (
    <div className="relative flex h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex w-80 max-w-[85vw] shrink-0 flex-col border-r bg-card transition-transform duration-200 ease-out",
          // On mobile the sidebar overlays the viewer.
          "fixed inset-y-0 left-0 z-40 md:relative md:z-auto",
          leftOpen ? "translate-x-0" : "-translate-x-full",
          // When closed on desktop, collapse its footprint to 0.
          !leftOpen && "md:w-0 md:min-w-0 md:overflow-hidden md:border-r-0",
        )}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Box className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight">Rebar</div>
            <div className="text-xs text-muted-foreground leading-tight">
              IFC Viewer
            </div>
          </div>
          <button
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
            onClick={() => setLeftOpen(false)}
            aria-label="Close file list"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {groups.map((g) => (
            <div key={g.group} className="mb-4">
              <div className="mb-2 flex items-center gap-2 px-1">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.group}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {g.files.map((f) => {
                  const url = `${g.baseUrl}/${encodeURIComponent(f)}`;
                  const isActive = url === activeUrl;
                  return (
                    <button
                      key={f}
                      onClick={() => handleLoad(g, f)}
                      className={cn(
                        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/60",
                      )}
                    >
                      <FileBox
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                      <span className="truncate">{f}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t px-4 py-3 text-[11px] text-muted-foreground">
          Click any file to load. Zoom with scroll, orbit with left-drag, pan
          with right-drag.
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b bg-card px-2 py-2 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLeft}
            aria-label={leftOpen ? "Hide file list" : "Show file list"}
            aria-pressed={leftOpen}
            className="shrink-0"
          >
            {leftOpen ? (
              <ListTree className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </Button>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="truncate text-sm font-medium">
              {activeName ?? "No model loaded"}
            </div>
            {loading && (
              <Badge variant="secondary" className="shrink-0 gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">Loading</span>
              </Badge>
            )}
            {error && (
              <Badge
                variant="outline"
                className="shrink-0 border-destructive text-destructive"
              >
                Failed
              </Badge>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".ifc"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="default"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="px-2 sm:px-3"
              aria-label="Upload IFC"
            >
              <Upload className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewerRef.current?.fitToFrame()}
              disabled={!activeUrl}
              className="px-2 sm:px-3"
              aria-label="Fit view"
            >
              <Focus className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Fit</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewerRef.current?.toggleClipping()}
              disabled={!activeUrl}
              className="px-2 sm:px-3"
              aria-label="Toggle section"
            >
              <Scissors className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Section</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleRight}
              aria-label={
                rightOpen ? "Hide details panel" : "Show details panel"
              }
              aria-pressed={rightOpen}
              className="shrink-0"
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Viewer + details */}
        <div className="relative flex flex-1 overflow-hidden">
          <div className="relative min-w-0 flex-1">
            <IFCViewer
              ref={viewerRef}
              onLoadStart={() => {
                setLoading(true);
                setError(null);
              }}
              onLoadEnd={() => setLoading(false)}
              onLoadError={(e) => {
                setLoading(false);
                setError(e?.message || String(e));
              }}
              onSelect={handleSelect}
            />
            {loading && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span>Loading model…</span>
                </div>
              </div>
            )}
            {!activeUrl && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                <Card className="pointer-events-auto w-full max-w-sm border-dashed">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MousePointerClick className="h-4 w-4" />
                      Pick a model to begin
                    </CardTitle>
                    <CardDescription>
                      Choose an IFC file from the sidebar or upload one. Then
                      click any element in the viewer to inspect its
                      properties.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    Tip: infra models are large and take longer to parse — try
                    a smaller building model first.
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Mobile backdrop for the overlay panels */}
          {showMobileBackdrop && (
            <button
              className="fixed inset-0 z-30 bg-black/40 md:hidden"
              onClick={() => {
                setLeftOpen(false);
                setRightOpen(false);
              }}
              aria-label="Close panels"
            />
          )}

          {/* Details panel */}
          <div
            className={cn(
              "flex w-96 max-w-[85vw] shrink-0 flex-col border-l bg-card transition-transform duration-200 ease-out",
              "fixed inset-y-0 right-0 z-40 md:relative md:z-auto",
              rightOpen ? "translate-x-0" : "translate-x-full",
              !rightOpen && "md:w-0 md:min-w-0 md:overflow-hidden md:border-l-0",
            )}
          >
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="text-sm font-medium">Selected element</div>
              <div className="flex items-center gap-1">
                {selection && (
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => setSelection(null)}
                    aria-label="Clear selection"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
                  onClick={() => setRightOpen(false)}
                  aria-label="Close details panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!selection ? (
                <div className="mt-8 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
                  <MousePointerClick className="h-5 w-5" />
                  Click an element in the model to see its properties.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      Model {selection.modelID}
                    </Badge>
                    <Badge variant="outline">
                      Express #{selection.expressID}
                    </Badge>
                    {selection.properties?.type != null && (
                      <Badge>
                        {`type ${typeof selection.properties.type === "object"
                            ? selection.properties.type.value
                            : selection.properties.type
                          }`}
                      </Badge>
                    )}
                  </div>
                  <Separator />
                  <PropertyList props={selection.properties} />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
