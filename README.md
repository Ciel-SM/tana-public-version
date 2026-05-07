# Tana

Full-screen transparent overlay assistant for macOS, powered by the Google Gemini Live API.
Real-time bidirectional voice + vision — draw on your screen and talk to AI about anything visible.

## Prerequisites

- **Node.js 18 or later** — check with `node --version`
- **macOS** (primary supported platform; Windows/Linux targets exist but are untested)
- **Google Gemini API key with Live API access** — specifically access to the `gemini-3.1-flash-live-preview` model (this is a preview model and requires appropriate API access tier)
  - Get your key at https://aistudio.google.com/apikey
  - Verify you have Live API access enabled for your key

## macOS Permissions — Before You Launch

⚠️ **Screen Recording permission must be granted to your terminal BEFORE launching the app.** macOS does not auto-prompt for this in development mode.

### Grant Screen Recording Permission

1. Open **System Settings** > **Privacy & Security** > **Screen Recording**
2. Find your terminal application in the list:
   - `Terminal` (if using built-in Terminal.app)
   - `iTerm2` (if using iTerm2)
   - `Code` (if using VS Code's integrated terminal)
   - Or your terminal of choice
3. Toggle the switch ON for that application

If your terminal isn't listed, run the setup steps below and macOS will offer to add it automatically, or add it manually here.

**Why this is critical:** `desktopCapturer.getSources` silently returns an empty array when permission is missing — there is no error dialog from within the app.

### Microphone Permission

Microphone access will be requested by an OS dialog when you first click **Connect** in the app. Click **Allow** when prompted.

## Setup

1. Clone this repository and navigate into the directory.

2. Install dependencies:
   ```bash
   npm install
   ```

3. Grant Screen Recording permission to your terminal (see macOS Permissions section above).

4. Start the development app:
   ```bash
   npm run dev:electron
   ```
   This command:
   - Compiles the Electron main process (`electron/main.ts` → `electron/main.js`)
   - Starts the Vite dev server
   - Launches Electron (waits for Vite to be ready)

   If a teammate is on a lower-memory Mac and the app struggles to stay responsive, launch Lite mode:
   ```bash
   npm run dev:electron -- --lite
   ```
   You can also force it through the environment:
   ```bash
   TANA_LITE_MODE=1 npm run dev:electron
   ```
   Lite mode reduces screen-capture cost, limits active focus-region streaming, and keeps heavier Mind Palace UI paths deferred until they are opened.

5. **On first run**, the Settings modal opens automatically. Enter your Gemini API key and click **Get Started**. Your key is saved securely in your local browser storage; no configuration file is needed.

## Mind Palace — Persistent Semantic Memory

Mind Palace is a second-brain feature that automatically captures, embeds, and indexes every conversation turn alongside screenshots and focus-region crops. It uses **Gemini Embedding 2** for multimodal semantic embeddings and stores everything locally in a SQLite database (via sql.js WASM).

### How It Works

1. **Toggle on** via the brain icon in the HUD or press `Cmd+M` to open the sidebar.
2. While active, each conversation turn is embedded with its associated screenshot and focus-region images, then stored locally.
3. **Search** your memory from the sidebar — type a natural-language query and results are ranked by semantic similarity (with keyword fallback when embedding search is unavailable).
4. **3D Visualization** — open from the sidebar to explore all stored memories as a UMAP-projected 3D point cloud. Orbit, zoom, filter by time range, and hover nodes for details.

### Storage

All data lives under `~/Library/Application Support/Tana/mind-palace/` (or the platform equivalent). The SQLite database holds embeddings, transcriptions, and metadata; screenshots and focus-region crops are stored as image files on disk.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Browser-only Vite dev server (no Electron, no screen capture, no global hotkeys) |
| `npm run dev:electron` | **Primary development command.** Compiles Electron main, starts Vite + Electron concurrently. |
| `npm run build` | Vite production web build to `dist/` |
| `npm run build:electron` | Full packaged app. Creates a universal DMG on macOS. |

## How to Use

1. The overlay is full-screen and transparent — your desktop shows through.

2. Click **Connect** in the HUD (heads-up display) to start a Gemini Live session. Your microphone activates automatically once connected.

3. Use the drawing tools to annotate on top of your screen:
   - **Focus Box**: Draws a rectangle; active focus boxes are streamed alongside the full-screen feed so the AI keeps seeing both the whole screen and rotating focus crops without replying until you ask
   - **Laser Pointer**: Visual feedback for pointing at on-screen elements
   - **Free Draw**: Hand-draw shapes or highlights
   - **Cursor**: Click-through mode — let your mouse and clicks pass through to apps underneath while the overlay stays visible

4. **Toggle visibility** with the global hotkey: `Cmd+Shift+Space`

5. The menu bar (tray) icon provides **Show**, **Hide**, and **Quit** options.

6. To change your API key: press `Cmd+,` or use the tray menu to access Settings.
   The in-app Settings panel also includes a `General` tab with an internal testing control for all 30 Gemini Live voice choices.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+Space` | Toggle overlay show / hide (global, works when overlay is hidden) |
| `Escape` | Disconnect from Gemini session / clear annotations (global) |
| `Cmd+,` | Open Settings modal to change API key |
| `Cmd+M` | Toggle Mind Palace sidebar |
| `` ` `` (backtick) | Cursor tool (click-through mode) |
| `1` | Focus box tool |
| `2` | Laser pointer tool |
| `3` | Free draw tool |

## Troubleshooting

### Screen capture returns nothing / "Could not access screen"

**Root cause:** Your terminal application lacks Screen Recording permission.

**Fix:**
1. Go to **System Settings** > **Privacy & Security** > **Screen Recording**
2. Ensure your terminal app is enabled
3. Fully quit `npm run dev:electron` and restart it

### Audio doesn't work / Microphone never activates

**Root cause:** Microphone permission not yet granted, or previously denied.

**Fix:**
1. When Electron starts, an OS dialog will appear asking for microphone permission — click **Allow**
2. If you previously denied it: **System Settings** > **Privacy & Security** > **Microphone** > enable "Electron" (or "Tana" if running a packaged build)
3. Restart the app

### Interim transcript fails or spams Chromium upload errors after the 3.1 port

**Known issue:** In Electron, the optional local interim caption path built on browser `SpeechRecognition` is currently unreliable after the Gemini Live 3.1 migration.

**What you may see:**
1. No live word-by-word user transcript while you are still speaking
2. DevTools logs showing repeated `SpeechRecognitionErrorEvent` events with `error: 'network'`
3. Electron terminal logs such as `chunked_data_pipe_upload_data_stream.cc(217) OnSizeReceived failed with Error: -2`

**What still works:** Gemini Live microphone streaming and final Gemini input transcripts still work. This issue affects only the local interim-caption path, not the core Gemini conversation audio stream.

**Current workaround:** Disable the local interim recognizer in DevTools if you hit the restart loop:

```js
window.__TANA_DISABLE_LOCAL_INTERIM_TRANSCRIPT__ = true
location.reload()
```

### "Cannot connect" or connection error at startup

**Root cause:** Invalid API key, or the `gemini-3.1-flash-live-preview` model is not available on your API key tier.

**Fix:**
1. Verify your key at https://aistudio.google.com/apikey
2. Confirm you have **Live API access enabled** — this preview model requires it
3. To update your key in the app: press `Cmd+,` to open Settings, paste your new key, and click Get Started

### Blank window or white screen at startup

**Root cause:** Electron launched before Vite finished starting the dev server.

**Fix:** The `wait-on` utility handles this automatically, but if you see a blank window:
1. Wait 5–10 seconds — Electron retries loading
2. If it persists, quit the process (`Ctrl+C`) and run `npm run dev:electron` again

### Error: Cannot find module `.../electron/main.js`

**Root cause:** The Electron main process TypeScript file was not compiled to JavaScript.

**Fix:** Run `npm run build:electron:main` to compile. The `npm run dev:electron` command does this automatically as a first step, so this error should not occur during normal development. If it does, something unexpected happened.

### Open DevTools for debugging

Set the `TANA_DEVTOOLS` environment variable:

```bash
TANA_DEVTOOLS=1 npm run dev:electron
```

### Lower-memory Mac launch option

If the overlay is too heavy on an 8 GB Mac, force Lite mode for the current session:

```bash
npm run dev:electron -- --lite
```

To explicitly disable it for a run:

```bash
npm run dev:electron -- --no-lite
```

## Architecture Notes

- **Renderer:** React 19 + TypeScript + Vite 6
- **Electron main:** TypeScript (`electron/main.ts` → `electron/main.js`)
- **IPC bridge:** `electron/preload.cjs` exposes `window.tana` to the renderer
- **API key storage:** Securely stored in browser `localStorage` (key: `tana_api_key`) — never leaves your device
- **AI engine:** Google Gemini Live API, managed in `hooks/use-live-api.ts`
- **Visual input stream:** `hooks/use-visual-input-queue.ts` alternates full-screen screenshots and active focus-region crops over realtime image input at 1 FPS
- **Interim transcript note:** local interim captions currently rely on browser `SpeechRecognition`, which is known to be unreliable in Electron after the Gemini 3.1 migration; final Gemini transcripts remain the authoritative user transcript path
- **Mind Palace:** `lib/mind-palace/` — SQLite storage (sql.js WASM), vector index, embed queue, and UMAP 3D projection. Pipeline hook in `hooks/use-mind-palace-pipeline.ts`; sidebar/search hook in `hooks/use-mind-palace-sidebar.ts`. UI components: `components/MindPalace*.tsx`

## Platform Support

**macOS** is the primary and fully supported platform. The transparent overlay, dock hide/show behavior, and global hotkey registration are all macOS-native features.

**Windows (NSIS) and Linux (AppImage)** electron-builder targets exist in the configuration, but they are untested and the macOS-specific UI/UX behavior will not work on those platforms.

---

For questions or issues, please open an issue in the repository.
