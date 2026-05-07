import { contextBridge, ipcRenderer } from 'electron';
const bridge = {
    // ── Screen Capture (on-demand, hides overlay first) ─────────────────────────
    captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),
    captureScreenshotJpeg: (quality) => ipcRenderer.invoke('capture-screenshot-jpeg', quality),
    captureRegion: (x, y, w, h, viewportWidth, viewportHeight) => ipcRenderer.invoke('capture-region', x, y, w, h, viewportWidth, viewportHeight),
    getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
    getRuntimeProfile: () => ipcRenderer.invoke('get-runtime-profile'),
    // ── Global Escape Hotkey ────────────────────────────────────────────────────
    onGlobalEscape: (cb) => {
        const listener = () => cb();
        ipcRenderer.on('global-escape', listener);
        return () => ipcRenderer.removeListener('global-escape', listener);
    },
    // ── Window Controls ─────────────────────────────────────────────────────────
    setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
    setIgnoreMouseEvents: (ignore, opts) => ipcRenderer.invoke('set-ignore-mouse-events', ignore, opts),
    // ── Platform Info ───────────────────────────────────────────────────────────
    platform: process.platform,
    // ── Microphone permission (main process, persists under bundle ID) ──────────
    requestMicPermission: () => ipcRenderer.invoke('request-mic-permission'),
    // ── App relaunch (used after granting permissions) ──────────────────────────
    relaunch: () => ipcRenderer.invoke('relaunch'),
    // ── Runtime detection ───────────────────────────────────────────────────────
    isElectron: true,
    // ── Agent Tools ────────────────────────────────────────────────────────────
    agent: {
        runAppleScript: (script) => ipcRenderer.invoke('agent:run-applescript', script),
        openUrl: (url) => ipcRenderer.invoke('agent:open-url', url),
        getFrontmostApp: () => ipcRenderer.invoke('agent:get-frontmost-app'),
        openApp: (appName) => ipcRenderer.invoke('agent:open-app', appName),
        typeText: (text) => ipcRenderer.invoke('agent:type-text', text),
        pressKeys: (keys) => ipcRenderer.invoke('agent:press-keys', keys),
        shellExec: (command, timeoutMs) => ipcRenderer.invoke('agent:shell-exec', command, timeoutMs),
        webSearch: (query) => ipcRenderer.invoke('agent:web-search', query),
        cancel: () => ipcRenderer.invoke('agent:cancel'),
        isCancelled: () => ipcRenderer.invoke('agent:is-cancelled'),
        resetCancel: () => ipcRenderer.invoke('agent:reset-cancel'),
    },
    // ── Mind Palace ────────────────────────────────────────────────────────────
    mindPalace: {
        initialize: () => ipcRenderer.invoke('mind-palace:initialize'),
        storeMemory: (payload) => ipcRenderer.invoke('mind-palace:store-memory', payload),
        search: (embedding, topK) => ipcRenderer.invoke('mind-palace:search', embedding, topK),
        searchKeyword: (query, limit) => ipcRenderer.invoke('mind-palace:search-keyword', query, limit),
        getMemory: (id) => ipcRenderer.invoke('mind-palace:get-memory', id),
        loadImage: (relativePath) => ipcRenderer.invoke('mind-palace:load-image', relativePath),
        getStats: () => ipcRenderer.invoke('mind-palace:get-stats'),
        getRecent: (limit) => ipcRenderer.invoke('mind-palace:get-recent', limit),
        getAllEmbeddings: () => ipcRenderer.invoke('mind-palace:get-all-embeddings'),
        getAllMetadata: () => ipcRenderer.invoke('mind-palace:get-all-metadata'),
    },
};
contextBridge.exposeInMainWorld('tana', bridge);
