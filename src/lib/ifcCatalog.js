// Catalog of IFC files, generated from the workspace `assets/` folder by
// `scripts/gen-ifc-manifest.js` (runs via `prestart` / `prebuild`).
// Do not edit `ifcManifest.json` by hand — re-run the generator instead.

import manifest from "./ifcManifest.json";

export const ifcCatalog = manifest.groups;

export function buildIfcItems() {
  const items = [];
  for (const g of ifcCatalog) {
    for (const f of g.files) {
      items.push({
        id: `${g.group}::${f}`,
        group: g.group,
        name: f,
        url: `${g.baseUrl}/${encodeURIComponent(f)}`,
      });
    }
  }
  return items;
}
