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
  Moon,
  MousePointerClick,
  Scissors,
  Sun,
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
const THEME_STORAGE_KEY = "rebar-theme";

function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    // Light mode is the default; only switch to dark if explicitly stored.
    return stored === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((t) => (t === "dark" ? "light" : "dark"));

  return [theme, toggleTheme];
}

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

// ---------- IFC property extraction helpers ----------
//
// web-ifc returns wrapped values like { value: 3.44, type: 4 } for every
// scalar. Unwrap once here so the rest of the code can stay readable.
function unwrap(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value;
  return v;
}

function formatPropValue(v) {
  const u = unwrap(v);
  if (u === null || u === undefined || u === "") return "—";
  if (typeof u === "number") {
    // Avoid noisy floating-point tails like 2775.000000000045.
    return Number.isInteger(u) ? String(u) : Number(u.toFixed(4)).toString();
  }
  if (typeof u === "object") return JSON.stringify(u);
  return String(u);
}

// Quantities in this file are already in the units Revit exported with
// (mm for length, m² for area, m³ for volume, kg for mass). The IFC type
// name on each quantity tells us which unit to render.
function formatQuantity(rawValue, ifcType) {
  const v = unwrap(rawValue);
  if (typeof v !== "number") return formatPropValue(rawValue);
  const t = (ifcType || "").toUpperCase();
  if (t.includes("LENGTH")) {
    return Math.abs(v) >= 1000
      ? `${(v / 1000).toFixed(3)} m`
      : `${v.toFixed(1)} mm`;
  }
  if (t.includes("AREA")) return `${v.toFixed(2)} m²`;
  if (t.includes("VOLUME")) return `${v.toFixed(3)} m³`;
  if (t.includes("WEIGHT") || t.includes("MASS")) return `${v.toFixed(2)} kg`;
  if (t.includes("COUNT")) return String(Math.round(v));
  if (t.includes("TIME")) return `${v} s`;
  return formatPropValue(rawValue);
}

// A pset from web-ifc has either .HasProperties (IfcPropertySet) or
// .Quantities (IfcElementQuantity). We split them for a cleaner UI.
function partitionPsets(psets) {
  const propertySets = [];
  const quantitySets = [];
  for (const pset of psets || []) {
    if (!pset) continue;
    const name = unwrap(pset.Name) ?? "Properties";
    if (Array.isArray(pset.Quantities)) {
      quantitySets.push({
        name,
        items: pset.Quantities.filter(Boolean).map((q) => ({
          name: unwrap(q.Name),
          ifcType: q.type ?? q.constructor?.name,
          // Different IfcQuantity* subclasses store the value under a
          // different key. Pick whichever one is present.
          value:
            q.LengthValue ??
            q.AreaValue ??
            q.VolumeValue ??
            q.CountValue ??
            q.WeightValue ??
            q.TimeValue,
        })),
      });
    } else if (Array.isArray(pset.HasProperties)) {
      propertySets.push({
        name,
        items: pset.HasProperties.filter(Boolean).map((p) => ({
          name: unwrap(p.Name),
          value: p.NominalValue,
        })),
      });
    }
  }
  return { propertySets, quantitySets };
}

// Materials can be a plain IfcMaterial, an IfcMaterialLayerSet(Usage), or an
// IfcMaterialList / IfcMaterialConstituentSet. Walk the common shapes and
// collect unique names + layer thicknesses when present.
function extractMaterials(mats) {
  const seen = new Set();
  const results = [];
  const push = (name, extra) => {
    if (!name) return;
    const key = `${name}|${extra ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ name, extra });
  };
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (unwrap(node.Name)) push(unwrap(node.Name));
    // IfcMaterialLayerSet / IfcMaterialLayerSetUsage
    if (node.ForLayerSet) walk(node.ForLayerSet);
    if (Array.isArray(node.MaterialLayers)) {
      for (const layer of node.MaterialLayers) {
        const matName = unwrap(layer?.Material?.Name);
        const thickness = unwrap(layer?.LayerThickness);
        if (matName) {
          push(
            matName,
            thickness != null ? `${Number(thickness).toFixed(1)} mm` : null,
          );
        }
      }
    }
    // IfcMaterialConstituentSet
    if (Array.isArray(node.MaterialConstituents)) {
      for (const c of node.MaterialConstituents) {
        push(unwrap(c?.Material?.Name));
      }
    }
    // IfcMaterialList
    if (Array.isArray(node.Materials)) node.Materials.forEach(walk);
  };
  walk(mats);
  return results;
}

// The "identity" section shows the handful of top-level scalar attributes
// that are useful to a human (GlobalId, Name, Tag, ...) — not the numeric
// expressID or nested pset/mat blobs.
const IDENTITY_KEYS = [
  "GlobalId",
  "Name",
  "LongName",
  "Description",
  "ObjectType",
  "Tag",
  "PredefinedType",
];

function PropertyList({ props }) {
  if (!props) return null;
  const entries = IDENTITY_KEYS.map((k) => [k, props[k]]).filter(
    ([, v]) => unwrap(v) !== null && unwrap(v) !== undefined && unwrap(v) !== "",
  );
  if (entries.length === 0) return null;
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

function Section({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium hover:bg-accent"
      >
        <span>{title}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {count != null && <span>{count}</span>}
          <span>{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && <div className="border-t px-3 py-2">{children}</div>}
    </div>
  );
}

function KeyValueTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <div className="text-xs text-muted-foreground">—</div>;
  }
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map((r, i) => (
        <React.Fragment key={`${r.label}-${i}`}>
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="break-all font-mono">{r.value}</dd>
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
  const [theme, toggleTheme] = useTheme();

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
              onClick={toggleTheme}
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              className="shrink-0"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
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
              theme={theme}
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

          {/* Details panel — a bottom sheet on mobile, a side panel on desktop */}
          <div
            className={cn(
              "flex flex-col bg-card transition-transform duration-200 ease-out",
              // Mobile: bottom drawer that slides up from off-screen.
              "fixed inset-x-0 bottom-0 z-40 max-h-[50vh] translate-x-0 rounded-t-2xl border-t",
              rightOpen ? "translate-y-0" : "translate-y-full",
              // Desktop: side panel that slides in from the right, as before.
              "md:relative md:inset-auto md:z-auto md:w-96 md:max-w-[85vw] md:max-h-none md:shrink-0 md:translate-y-0 md:rounded-none md:border-t-0 md:border-l",
              rightOpen ? "md:translate-x-0" : "md:translate-x-full",
              !rightOpen && "md:w-0 md:min-w-0 md:overflow-hidden md:border-l-0",
            )}
          >
            {/* Drag handle affordance, mobile only */}
            <div className="flex justify-center pb-1 pt-2 md:hidden">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>
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
                    {selection.ifcClass && (
                      <Badge>{selection.ifcClass}</Badge>
                    )}
                    <Badge variant="secondary">
                      Model {selection.modelID}
                    </Badge>
                    <Badge variant="outline">
                      Express #{selection.expressID}
                    </Badge>
                    {selection.properties?.type != null &&
                      !selection.ifcClass && (
                        <Badge>
                          {`type ${typeof selection.properties.type === "object"
                              ? selection.properties.type.value
                              : selection.properties.type
                            }`}
                        </Badge>
                      )}
                  </div>
                  <Separator />
                  {(() => {
                    const props = selection.properties || {};
                    const { propertySets, quantitySets } = partitionPsets(
                      props.psets,
                    );
                    const materials = extractMaterials(props.mats);
                    const typeName = unwrap(props.type?.Name);
                    return (
                      <div className="space-y-3">
                        <Section title="Identity" defaultOpen>
                          <PropertyList props={props} />
                        </Section>

                        {typeName && (
                          <Section title="Type" defaultOpen>
                            <KeyValueTable
                              rows={[
                                { label: "Name", value: typeName },
                                {
                                  label: "PredefinedType",
                                  value: formatPropValue(
                                    props.type?.PredefinedType,
                                  ),
                                },
                                {
                                  label: "Tag",
                                  value: formatPropValue(props.type?.Tag),
                                },
                              ].filter((r) => r.value && r.value !== "—")}
                            />
                          </Section>
                        )}

                        {quantitySets.length > 0 && (
                          <Section
                            title="Quantities"
                            count={quantitySets.reduce(
                              (n, q) => n + q.items.length,
                              0,
                            )}
                            defaultOpen
                          >
                            <div className="space-y-3">
                              {quantitySets.map((qs) => (
                                <div key={qs.name}>
                                  <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                                    {qs.name}
                                  </div>
                                  <KeyValueTable
                                    rows={qs.items.map((q) => ({
                                      label: q.name,
                                      value: formatQuantity(q.value, q.ifcType),
                                    }))}
                                  />
                                </div>
                              ))}
                            </div>
                          </Section>
                        )}

                        {materials.length > 0 && (
                          <Section
                            title="Materials"
                            count={materials.length}
                            defaultOpen
                          >
                            <ul className="space-y-1 text-xs">
                              {materials.map((m, i) => (
                                <li
                                  key={`${m.name}-${i}`}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span className="font-mono">{m.name}</span>
                                  {m.extra && (
                                    <span className="text-muted-foreground">
                                      {m.extra}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </Section>
                        )}

                        {propertySets.length > 0 && (
                          <Section
                            title="Property sets"
                            count={propertySets.length}
                            defaultOpen={false}
                          >
                            <div className="space-y-3">
                              {propertySets.map((ps) => (
                                <div key={ps.name}>
                                  <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                                    {ps.name}
                                  </div>
                                  <KeyValueTable
                                    rows={ps.items.map((p) => ({
                                      label: p.name,
                                      value: formatPropValue(p.value),
                                    }))}
                                  />
                                </div>
                              ))}
                            </div>
                          </Section>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
