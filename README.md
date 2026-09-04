# hostply — 1713 Gaussian Splat Viewer

Static web viewer for `1713.ply` (832,888 splats) hosted on GitHub Pages with streaming-optimized `SPZ`.

## Files

| File | Size | Description | In Git? |
|------|------|-------------|---------|
| `1713.ply` | 197 MB | Original PLY (SH degree 3, 248 B/splat) — source of truth | **No** — publish via GitHub Releases (see below) |
| `1713-clean.ply` | 187 MB | Morton-sorted, normals `nx/ny/nz` dropped (lossless), intermediate | **No** |
| `public/1713.spz` | **18.1 MB** | SPZ quantized (Niantic `spz-js 1.2.5`, SH3 preserved, 10.3x) — delivery | **Yes** |
| `index.html` | — | Spark (`@sparkjsdev/spark@2.1.0` + `three@0.180`) viewer | Yes |

### Optimization applied

* **Sorted**: Morton Z-order (21-bit per axis) — improves GPU cache locality, progressive visual coherence, and compression ratio (~5%).
* **Dead attributes dropped**: `nx/ny/nz` normals unused by 3DGS — saves 9.5 MB raw before quantization.
* **Quantized**: SPZ — positions 24-bit, SH 8-bit, quaternion packed, gzip. Near-lossless (typically <1 dB PSNR vs raw). No SH degree reduction, no splat pruning (fidelity kept per request).
* **Not applied**: SH degree reduction (would lose view-dependent lighting), opacity pruning (would drop splats). Re-run `scripts/convert.js` with options if you need smaller mobile target.

## Local dev

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview
```

Or open `index.html` directly (CDN importmap, no build needed) — `python3 -m http.server 8000`.

## Re-creating the SPZ

Original `1713.ply` is gitignored (GitHub 100 MB limit). To regenerate:

```bash
npm install spz-js
node scripts/convert.js           # reads 1713.ply -> public/1713.spz
# or: npx spz-js helpers, or SuperSplat / GaussForge
```

The conversion script does: load PLY stream → `spz-js` `serializeSpz` (SH3) → 18 MB.

## Hosting on GitHub

### Option A — SPZ in repo (default, this repo)

`public/1713.spz` is 18 MB < 100 MB, so it lives in git and Pages serves it same-origin at `https://<user>.github.io/hostply/1713.spz`. Viewer loads via `fetch('./1713.spz')` — no CORS.

### Option B — Hybrid (recommended for fidelity archive)

Keep SPZ for web, attach raw `1713.ply` to a Release for lossless download:

```bash
gh release create v1.0 1713.ply --title "1713 raw PLY (197 MB, SH3)" --notes "Lossless source. Web viewer uses 18 MB SPZ."
# Viewer can also load via ?url=https://github.com/<user>/hostply/releases/download/v1.0/1713.ply
```

Releases allow 2 GB/file, CDN-cached, CORS-enabled.

### Deploy Pages

1. Push to GitHub: `gh repo create hostply --public --source=. --push` (or add remote).
2. Enable Pages: Settings → Pages → Source: **GitHub Actions**.
3. Workflow `.github/workflows/pages.yml` builds `vite` and deploys `dist/` on push to `main`.

CORS / headers: Pages serves `application/octet-stream` for `.spz` correctly. SPZ is already gzip-compressed — do not enable extra server gzip.

## Viewer features

* Orbit/pan/zoom (Three `OrbitControls` + damping)
* Progress bar with streaming fetch (shows MB downloaded)
* Auto-framing via `SplatMesh.getBoundingBox()`
* Drag & drop any `.ply/.spz/.splat/.ksplat/.sog` (Spark auto-detects)
* `?url=` param for sharing: `https://<user>.github.io/hostply/?url=https://.../scene.spz`

## Alternatives not used

* `SPLAT` (~28 MB, no SH) — flat lighting, rejected for quality.
* `KSPLAT` — Three.js-only, SH off by default.
* `SOG` (~12 MB) — smaller but narrower viewer support; can generate alongside SPZ if you need fastest first frame.
* `Git LFS` — 1 GB free quota, Pages does not serve LFS objects.

## After editing code

Run `graphify update .` per repo `AGENTS.md`.
