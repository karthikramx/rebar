#!/usr/bin/env node
/* eslint-disable no-console */
// Walk the workspace `assets/` folder and produce
// `src/lib/ifcManifest.json` listing every .ifc file that actually exists.
// Files are grouped by their immediate parent directory (relative to assets/),
// or "Root" when the file sits directly under assets/.
//
// Run automatically via the `prestart` / `prebuild` npm scripts.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets");
const OUT_FILE = path.join(ROOT, "src", "lib", "ifcManifest.json");

function walk(dir, acc = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        return acc;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, acc);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".ifc")) {
            acc.push(full);
        }
    }
    return acc;
}

function toPosix(p) {
    return p.split(path.sep).join("/");
}

if (!fs.existsSync(ASSETS_DIR)) {
    console.warn(`[gen-ifc-manifest] assets folder not found: ${ASSETS_DIR}`);
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify({ groups: [] }, null, 2));
    process.exit(0);
}

const files = walk(ASSETS_DIR).sort();
const groupsMap = new Map();

for (const abs of files) {
    const rel = path.relative(ASSETS_DIR, abs); // e.g. "Sub/dir/file.ifc"
    const relPosix = toPosix(rel);
    const dir = path.posix.dirname(relPosix); // "." if directly under assets/
    const name = path.posix.basename(relPosix);
    const groupLabel = dir === "." ? "Root" : dir;

    if (!groupsMap.has(groupLabel)) {
        groupsMap.set(groupLabel, {
            group: groupLabel,
            baseUrl:
                dir === "."
                    ? "/assets"
                    : `/assets/${dir
                        .split("/")
                        .map(encodeURIComponent)
                        .join("/")}`,
            files: [],
        });
    }
    groupsMap.get(groupLabel).files.push(name);
}

const groups = Array.from(groupsMap.values()).sort((a, b) => {
    // Keep "Root" first, then alphabetical
    if (a.group === "Root") return -1;
    if (b.group === "Root") return 1;
    return a.group.localeCompare(b.group);
});

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(
    OUT_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), groups }, null, 2)
);

const total = groups.reduce((n, g) => n + g.files.length, 0);
console.log(
    `[gen-ifc-manifest] wrote ${total} IFC file(s) across ${groups.length} group(s) → ${path.relative(ROOT, OUT_FILE)}`
);
