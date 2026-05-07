# AGENTS.md

## Purpose
Electron + React desktop overlay for Gemini Live voice-and-vision workflows.

## Team Workflow
- Use `npm run dev:electron` for normal development.
- Use `npm test` as the current-behavior safety net.
- Use `npm run test:acceptance` to inspect future-fix tests. Those tests stay skipped until the corresponding issue is being fixed.
- Read `issues.json` before making changes. It is the shared source of truth for known issues, urgency, status, and acceptance criteria.
- For Gemini Live API migration work, consult `docs/vendor/gemini/gemini-live-api-dev.SKILL.md` first, then verify time-sensitive details against the latest official Google AI docs before changing models, SDK usage, or session semantics.
- Keep Electron TypeScript sources and generated runtime artifacts aligned when touching preload or display-geometry code.
- If a change intentionally alters current behavior, update the matching current-behavior test in the same change.
- When fixing a tracked issue, unskip or update the matching acceptance test in `tests/acceptance`.

## Key Files
- `App.tsx`: top-level orchestration for settings, live API state, screen capture, overlay tools, and HUD.
- `electron/main.ts`: Electron window lifecycle, tray, global shortcuts, and screenshot IPC.
- `electron/preload.ts`: preload bridge source of truth for renderer-facing Electron APIs.
- `electron/build-preload.mjs`: build step that derives the shipped preload artifact from the TypeScript source.
- `electron/display-geometry.ts`: display scaling helpers used to keep screenshot crops aligned with overlay coordinates.
- `hooks/use-live-api.ts`: Gemini Live session, audio I/O, transcripts, and image uploads.
- `hooks/use-visual-input-queue.ts`: alternating realtime queue for full-screen and focus-region visual context.
- `components/CanvasLayer.tsx`: overlay rendering, focus boxes, free-draw, and laser trail.
- `lib/mind-palace/sqlite-storage.ts`: SQLite (sql.js WASM) persistence for memory records and images.
- `lib/mind-palace/vector-index.ts`: in-memory cosine-similarity search over 3072-dim embeddings.
- `lib/mind-palace/embed.ts` / `embed-queue.ts`: Gemini Embedding 2 wrapper and async embed queue.
- `lib/mind-palace/projection.ts`: UMAP 3D projection of embedding vectors for visualization.
- `hooks/use-mind-palace-pipeline.ts`: capture-embed-store pipeline that runs while Mind Palace is enabled.
- `hooks/use-mind-palace-sidebar.ts`: sidebar state, semantic + keyword search, and thumbnail cache.
- `components/MindPalace3DScene.tsx`: Three.js `InstancedMesh` point cloud (raycasting, hover tooltips).
- `components/MindPalace3DView.tsx`: 3D view modal with `OrbitControls`, UMAP loading, and timeline filter.
- `components/MindPalaceSidebar.tsx` / `MindPalaceSearchBar.tsx` / `MindPalaceMemoryCard.tsx` / `MindPalaceStatsPanel.tsx` / `MindPalaceTimeline.tsx`: sidebar UI components.

## Current Priorities
1. Preserve the preload/build pipeline as the source of truth; do not hand-edit generated Electron bridge artifacts without updating the TypeScript path.
2. Keep connect, disconnect, failed-connect, server-close, and global-Escape shutdown flows behaviorally aligned.
3. Preserve visual-input queue semantics: passive focus capture, alternating full-screen and focus-region uploads, and no unsolicited model turns.
4. Keep focus-box geometry, crop refresh, and display-scaling math aligned so visible selections match what screenshot capture sends.
5. Make focus-box edit and delete semantics explicit in the UI and tests whenever model context behavior changes.
6. Add bounds, backpressure, and token-budget management before expanding simultaneous focus-region streaming.
7. Keep Mind Palace IPC handlers, storage layer, and preload bridge in sync when adding new queries or storage operations.
8. After updating `InstancedMesh` instance matrices in the 3D scene, always call `computeBoundingSphere()` so raycasting stays valid after camera movement.

## Notes
- The app currently works, but some behavior depends on checked-in generated Electron artifacts.
- Prefer small, scoped fixes for the high-priority runtime issues before larger refactors.
- Keep `issues.json` current when issue status or acceptance criteria change.
- Recent fixes hardened preload generation, CanvasLayer render-loop lifecycle, live API cleanup, overlay teardown, global Escape handling, settings modal resync, alternating visual input, and screenshot crop alignment. Avoid regressing those paths.
- Low-memory support now includes a Lite mode that can be auto-recommended and explicitly forced at launch with `--lite`, `--no-lite`, or `TANA_LITE_MODE=1/0`. Preserve that override path when changing startup or settings behavior.
- Local interim user captions currently use browser `SpeechRecognition` and are known to be unreliable inside Electron after the Gemini 3.1 migration. In observed dev runs, the recognizer loops on `error: 'network'` while Gemini final input transcripts still work. Treat interim captions as optional until a more reliable STT path exists.
- Focus-region streaming currently has no hard cap on active focus boxes. Future changes must add bounds/backpressure and token-budget management before scaling this behavior.
- Mind Palace stores all data locally (SQLite via sql.js WASM + image files on disk). The vector index is rebuilt in-memory on startup from the SQLite database. The embed queue uses Gemini Embedding 2 (`gemini-embedding-2-preview`) for multimodal embeddings.
- The 3D visualization uses UMAP for dimensionality reduction and Three.js `InstancedMesh` for rendering. `computeBoundingSphere()` must be called after setting instance matrices to keep raycasting reliable after orbit/zoom.
