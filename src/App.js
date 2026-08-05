import React, { useMemo, useRef, useState } from "react";
import {
  Box,
  FileBox,
  Focus,
  Layers,
  Loader2,
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
    ([k]) => !["expressID", "type"].includes(k)
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

  const groups = useMemo(() => ifcCatalog, []);

  const handleLoad = async (group, file) => {
    const url = `${group.baseUrl}/${encodeURIComponent(file)}`;
    setError(null);
    setSelection(null);
    setActiveUrl(url);
    setActiveName(file);
    setLoading(true);
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
    await viewerRef.current?.loadFile(file);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-80 shrink-0 flex-col border-r bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Rebar</div>
            <div className="text-xs text-muted-foreground leading-tight">
              IFC Viewer
            </div>
          </div>
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
                          : "hover:bg-accent/60"
                      )}
                    >
                      <FileBox
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground"
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
      <main className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b bg-card px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">
              {activeName ?? "No model loaded"}
            </div>
            {loading && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading
              </Badge>
            )}
            {error && (
              <Badge
                variant="outline"
                className="border-destructive text-destructive"
              >
                Failed to load
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
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
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Upload IFC
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewerRef.current?.fitToFrame()}
              disabled={!activeUrl}
            >
              <Focus className="mr-1.5 h-3.5 w-3.5" />
              Fit view
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewerRef.current?.toggleClipping()}
              disabled={!activeUrl}
            >
              <Scissors className="mr-1.5 h-3.5 w-3.5" />
              Section
            </Button>
          </div>
        </div>

        {/* Viewer + details */}
        <div className="relative flex flex-1 overflow-hidden">
          <div className="relative flex-1">
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
              onSelect={(sel) => setSelection(sel)}
            />
            {!activeUrl && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Card className="pointer-events-auto w-96 border-dashed">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MousePointerClick className="h-4 w-4" />
                      Pick a model to begin
                    </CardTitle>
                    <CardDescription>
                      Choose an IFC file from the sidebar. Then click any
                      element in the viewer to inspect its properties.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    Tip: try one of the small tessellation samples first — the
                    infra models are large and take longer to parse.
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Details panel */}
          <div className="flex w-96 shrink-0 flex-col border-l bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="text-sm font-medium">Selected element</div>
              {selection && (
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setSelection(null)}
                  aria-label="Clear selection"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
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
