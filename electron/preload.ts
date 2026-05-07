import { contextBridge, ipcRenderer } from 'electron';

type IgnoreMouseOptions = {
  forward?: boolean;
};

const bridge = {
  // ── Screen Capture (on-demand, hides overlay first) ─────────────────────────
  captureScreenshot: (): Promise<string | null> =>
    ipcRenderer.invoke('capture-screenshot'),
  captureScreenshotJpeg: (quality?: number): Promise<string | null> =>
    ipcRenderer.invoke('capture-screenshot-jpeg', quality),
  captureRegion: (
    x: number,
    y: number,
    w: number,
    h: number,
    viewportWidth?: number,
    viewportHeight?: number,
  ): Promise<string | null> =>
    ipcRenderer.invoke('capture-region', x, y, w, h, viewportWidth, viewportHeight),
  getDesktopSources: (): Promise<Array<{ id: string; name: string }>> =>
    ipcRenderer.invoke('get-desktop-sources'),
  getRuntimeProfile: (): Promise<{
    platform: NodeJS.Platform;
    totalMemoryMb: number;
    liteModeOverride: { enabled: boolean; source: 'argv' | 'env' } | null;
  }> =>
    ipcRenderer.invoke('get-runtime-profile'),

  // ── Global Escape Hotkey ────────────────────────────────────────────────────
  onGlobalEscape: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('global-escape', listener);
    return () => ipcRenderer.removeListener('global-escape', listener);
  },

  // ── Window Controls ─────────────────────────────────────────────────────────
  setAlwaysOnTop: (value: boolean): Promise<void> =>
    ipcRenderer.invoke('set-always-on-top', value),
  setIgnoreMouseEvents: (
    ignore: boolean,
    opts?: IgnoreMouseOptions
  ): Promise<void> => ipcRenderer.invoke('set-ignore-mouse-events', ignore, opts),

  // ── Platform Info ───────────────────────────────────────────────────────────
  platform: process.platform as NodeJS.Platform,

  // ── Microphone permission (main process, persists under bundle ID) ──────────
  requestMicPermission: (): Promise<boolean> =>
    ipcRenderer.invoke('request-mic-permission'),

  // ── App relaunch (used after granting permissions) ──────────────────────────
  relaunch: (): Promise<void> => ipcRenderer.invoke('relaunch'),

  // ── Runtime detection ───────────────────────────────────────────────────────
  isElectron: true,

  // ── Agent Tools ────────────────────────────────────────────────────────────
  agent: {
    runAppleScript: (script: string) =>
      ipcRenderer.invoke('agent:run-applescript', script),
    openUrl: (url: string) =>
      ipcRenderer.invoke('agent:open-url', url),
    getFrontmostApp: () =>
      ipcRenderer.invoke('agent:get-frontmost-app'),
    openApp: (appName: string) =>
      ipcRenderer.invoke('agent:open-app', appName),
    typeText: (text: string) =>
      ipcRenderer.invoke('agent:type-text', text),
    pressKeys: (keys: string) =>
      ipcRenderer.invoke('agent:press-keys', keys),
    shellExec: (command: string, timeoutMs?: number) =>
      ipcRenderer.invoke('agent:shell-exec', command, timeoutMs),
    webSearch: (query: string) =>
      ipcRenderer.invoke('agent:web-search', query),
    cancel: () =>
      ipcRenderer.invoke('agent:cancel'),
    isCancelled: () =>
      ipcRenderer.invoke('agent:is-cancelled'),
    resetCancel: () =>
      ipcRenderer.invoke('agent:reset-cancel'),
  },

  // ── Mind Palace ────────────────────────────────────────────────────────────
  mindPalace: {
    initialize: (): Promise<void> =>
      ipcRenderer.invoke('mind-palace:initialize'),
    storeMemory: (payload: any): Promise<void> =>
      ipcRenderer.invoke('mind-palace:store-memory', payload),
    search: (embedding: number[], topK: number): Promise<any[]> =>
      ipcRenderer.invoke('mind-palace:search', embedding, topK),
    searchKeyword: (query: string, limit: number): Promise<any[]> =>
      ipcRenderer.invoke('mind-palace:search-keyword', query, limit),
    getMemory: (id: string): Promise<any> =>
      ipcRenderer.invoke('mind-palace:get-memory', id),
    loadImage: (relativePath: string): Promise<string | null> =>
      ipcRenderer.invoke('mind-palace:load-image', relativePath),
    getStats: (): Promise<any> =>
      ipcRenderer.invoke('mind-palace:get-stats'),
    getRecent: (limit: number): Promise<any[]> =>
      ipcRenderer.invoke('mind-palace:get-recent', limit),
    getAllEmbeddings: (): Promise<any[]> =>
      ipcRenderer.invoke('mind-palace:get-all-embeddings'),
    getAllMetadata: (): Promise<any[]> =>
      ipcRenderer.invoke('mind-palace:get-all-metadata'),
  },
};

contextBridge.exposeInMainWorld('tana', bridge);
