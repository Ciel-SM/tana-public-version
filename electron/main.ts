import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, Menu, session, screen, Tray, nativeImage, systemPreferences } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { getCaptureThumbnailSize, getOverlayWindowBounds, mapOverlayRegionToCaptureRegion } from './display-geometry.js';
import { SqliteStorage } from '../lib/mind-palace/sqlite-storage.js';
import { VectorIndex } from '../lib/mind-palace/vector-index.js';
import type { StorePayload } from '../lib/mind-palace/types.js';
import { runAppleScript, openUrl, getFrontmostApp, openApp, typeText, pressKeys, shellExec, webSearch } from './agent-tools.js';

const isDev = process.env.NODE_ENV === 'development';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Mind Palace state ──────────────────────────────────────────────────────
let mindPalaceStorage: SqliteStorage | null = null;
let mindPalaceIndex: VectorIndex | null = null;

console.log('[Electron] Starting Tana...');
console.log('[Electron] isDev:', isDev);
console.log('[Electron] __dirname:', __dirname);

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function parseLiteModeOverride(): { enabled: boolean; source: 'argv' | 'env' } | null {
  if (process.argv.includes('--lite')) {
    return { enabled: true, source: 'argv' };
  }
  if (process.argv.includes('--no-lite')) {
    return { enabled: false, source: 'argv' };
  }

  const envValue = process.env.TANA_LITE_MODE?.trim().toLowerCase();
  if (envValue === '1' || envValue === 'true' || envValue === 'yes' || envValue === 'on') {
    return { enabled: true, source: 'env' };
  }
  if (envValue === '0' || envValue === 'false' || envValue === 'no' || envValue === 'off') {
    return { enabled: false, source: 'env' };
  }

  return null;
}

function createWindow() {
  // ── Permission handler ────────────────────────────────────────────────────
  // Check handler: pre-approve media permissions so Electron never shows its own
  // dialog layer (separate from the macOS TCC dialog that getUserMedia triggers).
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'audioCapture', 'videoCapture', 'microphone', 'camera', 'display-capture', 'screen-capture'];
    return allowed.includes(permission);
  });

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = ['media', 'display-capture', 'audioCapture', 'videoCapture', 'screen-capture', 'microphone', 'camera'];
      callback(allowed.includes(permission));
    }
  );

  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = getOverlayWindowBounds(primaryDisplay);

  win = new BrowserWindow({
    width,
    height,
    x,
    y,

    // ── Transparent overlay ──────────────────────────────────────────────────
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',

    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev,
    },
  });

  // ── Default: click-through so the window doesn't block the desktop ──────────
  // The HUD's onMouseEnter/onMouseLeave toggles this as needed.
  win.setIgnoreMouseEvents(true, { forward: true });

  // ── Load the app ────────────────────────────────────────────────────────────
  if (isDev) {
    const devUrl = 'http://127.0.0.1:3000';
    console.log(`[Electron] Loading dev server: ${devUrl}`);

    win.loadURL(devUrl).catch((err) => {
      console.error(`[Electron] Failed to load ${devUrl}:`, err);
      setTimeout(() => {
        console.log('[Electron] Retrying...');
        win?.loadURL(devUrl).catch(e => console.error('[Electron] Final load failed:', e));
      }, 3000);
    });

    win.webContents.on('did-finish-load', () => {
      console.log('[Electron] Page loaded successfully');
    });

    // DevTools: only open if TANA_DEVTOOLS=1 is set
    if (process.env.TANA_DEVTOOLS === '1') {
      setTimeout(() => win?.webContents.openDevTools({ mode: 'detach' }), 1000);
    }
  } else {
    const distPath = path.join(__dirname, '../dist/index.html');
    win.loadFile(distPath).catch(err => console.error('[Electron] Failed to load dist:', err));
  }

  // ── Toggle helper ───────────────────────────────────────────────────────────
  const toggleOverlay = () => {
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
      if (process.platform === 'darwin') app.dock?.hide();
    } else {
      win.show();
      win.focus();
      if (process.platform === 'darwin') app.dock?.show();
    }
  };

  // ── Global hotkeys ──────────────────────────────────────────────────────────
  globalShortcut.register('CommandOrControl+Shift+Space', toggleOverlay);

  globalShortcut.register('Escape', () => {
    win?.webContents.send('global-escape');
  });

  // ── System tray (background app behavior) ──────────────────────────────────
  const trayIconPath = path.join(__dirname, isDev ? '../build/icon.png' : '../build/icon.png');
  let trayIcon: Electron.NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(trayIconPath).resize({ width: 18, height: 18 });
  } catch {
    // Fallback: create a simple 16x16 icon
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAiklEQVQ4T2NkoBAwUqifgWoGzPv/n+E/AwMDIyMjAzYXMOFSjMsFjP///2ckxgCcXqC6FzAxEAoDAlyAzQBiXYDVC/gCkZgwwOkCYsIAqwHEhgFWA4gNA4wBpIQBugHkhAG6AeSGAcIAcsMAwQByEhJWA8hJyFgNICchYzWA7ISM1QCyEzJWAwCDi1ARqOgGFAAAAABJRU5ErkJggg=='
    );
  }
  trayIcon.setTemplateImage(true); // macOS: adapts to dark/light menu bar
  tray = new Tray(trayIcon);
  tray.setToolTip('Tana');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show / Hide', click: toggleOverlay },
    { type: 'separator' },
    { label: 'Quit Tana', click: () => { app.quit(); } },
  ]));
  tray.on('click', toggleOverlay);

  // ── Window close → hide to tray instead of quitting ────────────────────────
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win?.hide();
      if (process.platform === 'darwin') app.dock?.hide();
    }
  });

  win.on('closed', () => {
    globalShortcut.unregisterAll();
    win = null;
  });
}

// ── Helper: capture screen ────────────────────────────────────────────────────
async function captureScreen() {
  const primary = screen.getPrimaryDisplay();
  const displaySize = getCaptureThumbnailSize(primary);
  const primaryId = String(primary.id);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: displaySize,
  });

  // Match source to primary display. Fall back to sources[0] when display_id
  // is empty (single-monitor) or the field is unavailable.
  const match = sources.find(s => s.display_id === primaryId) ?? sources[0];
  return match?.thumbnail ?? null;
}

// ── IPC: Take a full screenshot ───────────────────────────────────────────────
ipcMain.handle('capture-screenshot', async () => {
  try {
    const thumbnail = await captureScreen();
    return thumbnail ? thumbnail.toPNG().toString('base64') : null;
  } catch (err) {
    console.error('[Electron] Screenshot failed:', err);
    return null;
  }
});

// ── IPC: Take a JPEG screenshot (for periodic ambient capture) ────────────────
ipcMain.handle('capture-screenshot-jpeg', async (_event, quality?: number) => {
  try {
    const thumbnail = await captureScreen();
    const jpegQuality = Number.isFinite(quality)
      ? Math.max(30, Math.min(90, Math.round(quality as number)))
      : 75;
    return thumbnail ? thumbnail.toJPEG(jpegQuality).toString('base64') : null;
  } catch (err) {
    console.error('[Electron] JPEG screenshot failed:', err);
    return null;
  }
});

// ── IPC: Capture a specific region ────────────────────────────────────────────
ipcMain.handle(
  'capture-region',
  async (
    _event,
    x: number,
    y: number,
    w: number,
    h: number,
    viewportWidth?: number,
    viewportHeight?: number,
  ) => {
    try {
      const primary = screen.getPrimaryDisplay();
      const thumbnail = await captureScreen();
      if (!thumbnail) return null;
      const overlayContentBounds = win?.getContentBounds() ?? getOverlayWindowBounds(primary);
      const overlayViewportSize = {
        width: viewportWidth ?? overlayContentBounds.width,
        height: viewportHeight ?? overlayContentBounds.height,
      };

      const cropped = thumbnail.crop(
        mapOverlayRegionToCaptureRegion(
          primary,
          overlayContentBounds,
          overlayViewportSize,
          thumbnail.getSize(),
          { x, y, width: w, height: h },
        ),
      );
      return cropped.toPNG().toString('base64');
    } catch (err) {
      console.error('[Electron] Region capture failed:', err);
      return null;
    }
  });

// ── IPC: Get desktop sources (for checking permissions) ───────────────────────
ipcMain.handle('get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    });
    return sources.map(s => ({ id: s.id, name: s.name }));
  } catch (err) {
    console.error('[Electron] Failed to get desktop sources:', err);
    return [];
  }
});

ipcMain.handle('get-runtime-profile', async () => {
  const liteModeOverride = parseLiteModeOverride();
  return {
    platform: process.platform,
    totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
    liteModeOverride: liteModeOverride
      ? {
        enabled: liteModeOverride.enabled,
        source: liteModeOverride.source,
      }
      : null,
  };
});

// ── IPC: Request microphone permission via main process ───────────────────────
// Using systemPreferences.askForMediaAccess stores the TCC entry under the app
// bundle ID (com.tana.overlay) — not the renderer process hash — so it
// persists across builds and sessions without repeated dialogs.
ipcMain.handle('request-mic-permission', async () => {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  return systemPreferences.askForMediaAccess('microphone');
});

// ── IPC: Relaunch app (used after granting screen recording permission) ───────
ipcMain.handle('relaunch', () => {
  app.relaunch();
  app.exit(0);
});

// ── IPC: Window controls ──────────────────────────────────────────────────────
ipcMain.handle('set-always-on-top', (_event, value: boolean) => {
  win?.setAlwaysOnTop(value);
});

ipcMain.handle('move-window', (_event, x: number, y: number) => {
  win?.setPosition(x, y);
});

// ── IPC: Click-through toggle (for cursor passthrough mode) ──────────────────
ipcMain.handle('set-ignore-mouse-events', (_event, ignore: boolean, opts?: { forward?: boolean }) => {
  if (ignore) {
    win?.setIgnoreMouseEvents(true, { forward: opts?.forward ?? true });
  } else {
    win?.setIgnoreMouseEvents(false);
  }
});

// ── Mind Palace IPC handlers ──────────────────────────────────────────────────

ipcMain.handle('mind-palace:initialize', async () => {
  if (mindPalaceStorage) return; // already initialized

  const rootDir = path.join(app.getPath('userData'), 'mind-palace');
  mindPalaceStorage = new SqliteStorage(rootDir);
  await mindPalaceStorage.initialize();

  // Build in-memory vector index from existing data
  mindPalaceIndex = new VectorIndex();
  const allEmbeddings = await mindPalaceStorage.getAllEmbeddings();
  mindPalaceIndex.loadFromRecords(allEmbeddings);

  console.log(`[MindPalace] Initialized with ${mindPalaceIndex.size} vectors`);
});

ipcMain.handle('mind-palace:store-memory', async (_event, payload: StorePayload) => {
  if (!mindPalaceStorage || !mindPalaceIndex) {
    throw new Error('Mind Palace not initialized');
  }

  await mindPalaceStorage.storeMemory(payload);

  // Add to vector index
  const embedding = new Float32Array(payload.embedding);
  mindPalaceIndex.add(payload.id, embedding);
});

ipcMain.handle('mind-palace:search', async (_event, embeddingArray: number[], topK: number) => {
  if (!mindPalaceStorage || !mindPalaceIndex) {
    throw new Error('Mind Palace not initialized');
  }

  const queryVec = new Float32Array(embeddingArray);
  const results = mindPalaceIndex.search(queryVec, topK);

  // Enrich with metadata
  const enriched = await Promise.all(
    results.map(async (r) => {
      const memory = await mindPalaceStorage!.getMemory(r.id);
      if (!memory) return null;
      return {
        id: memory.id,
        timestamp: memory.timestamp,
        transcription: memory.transcription,
        screenshotPath: memory.screenshotPath,
        focusRegions: memory.focusRegions,
        embedText: memory.embedText,
        similarity: r.similarity,
      };
    })
  );

  return enriched.filter(Boolean);
});

ipcMain.handle('mind-palace:search-keyword', async (_event, query: string, limit: number) => {
  if (!mindPalaceStorage) throw new Error('Mind Palace not initialized');
  return mindPalaceStorage.searchByKeyword(query, limit);
});

ipcMain.handle('mind-palace:get-memory', async (_event, id: string) => {
  if (!mindPalaceStorage) throw new Error('Mind Palace not initialized');
  return mindPalaceStorage.getMemory(id);
});

ipcMain.handle('mind-palace:load-image', async (_event, relativePath: string) => {
  if (!mindPalaceStorage) throw new Error('Mind Palace not initialized');
  return mindPalaceStorage.loadImage(relativePath);
});

ipcMain.handle('mind-palace:get-stats', async () => {
  if (!mindPalaceStorage) throw new Error('Mind Palace not initialized');
  return mindPalaceStorage.getStats();
});

ipcMain.handle('mind-palace:get-recent', async (_event, limit: number) => {
  if (!mindPalaceStorage) throw new Error('Mind Palace not initialized');
  const records = await mindPalaceStorage.getRecent(limit);
  // Serialize Float32Arrays for IPC
  return records.map(r => ({
    id: r.id,
    timestamp: r.timestamp,
    embedding: Array.from(r.embedding),
  }));
});

ipcMain.handle('mind-palace:get-all-embeddings', async () => {
  if (!mindPalaceStorage) throw new Error('Mind Palace not initialized');
  const records = await mindPalaceStorage.getAllEmbeddings();
  // Serialize Float32Arrays for IPC
  return records.map(r => ({
    id: r.id,
    timestamp: r.timestamp,
    embedding: Array.from(r.embedding),
  }));
});

ipcMain.handle('mind-palace:get-all-metadata', async () => {
  if (!mindPalaceStorage) throw new Error('Mind Palace not initialized');
  return mindPalaceStorage.getAllMetadata();
});

// ── Agent IPC handlers ────────────────────────────────────────────────────────

// Cancellation token: the brain loop checks this before each step.
let agentCancelled = false;

ipcMain.handle('agent:cancel', () => {
  agentCancelled = true;
  // Reset after a brief moment so a new task can start cleanly.
  setTimeout(() => { agentCancelled = false; }, 500);
});

ipcMain.handle('agent:is-cancelled', () => agentCancelled);

ipcMain.handle('agent:reset-cancel', () => { agentCancelled = false; });

ipcMain.handle('agent:run-applescript', async (_event, script: string) => {
  return runAppleScript(script);
});

ipcMain.handle('agent:open-url', async (_event, url: string) => {
  return openUrl(url);
});

ipcMain.handle('agent:get-frontmost-app', async () => {
  return getFrontmostApp();
});

ipcMain.handle('agent:open-app', async (_event, appName: string) => {
  return openApp(appName);
});

ipcMain.handle('agent:type-text', async (_event, text: string) => {
  return typeText(text);
});

ipcMain.handle('agent:press-keys', async (_event, keys: string) => {
  return pressKeys(keys);
});

ipcMain.handle('agent:shell-exec', async (_event, command: string, timeoutMs?: number) => {
  return shellExec(command, timeoutMs);
});

ipcMain.handle('agent:web-search', async (_event, query: string) => {
  return webSearch(query);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
