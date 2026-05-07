import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import CanvasLayer, { CanvasLayerHandle } from './components/CanvasLayer';
import ControlHUD from './components/ControlHUD';
import SettingsModal from './components/SettingsModal';
import SettingsPanel from './components/SettingsPanel';
import AgentResultCard from './components/AgentResultCard';
import { useLiveApi } from './hooks/use-live-api';
import { useToolState } from './hooks/use-tool-state';
import { useSuggestions } from './hooks/use-suggestions';
import { useAIOverlays } from './hooks/use-ai-overlays';
import { useSessionMemory } from './hooks/use-session-memory';
import { useSettings } from './hooks/use-settings';
import { useVisualInputQueue } from './hooks/use-visual-input-queue';
import { useMindPalacePipeline } from './hooks/use-mind-palace-pipeline';
import { useMindPalaceSidebar } from './hooks/use-mind-palace-sidebar';
import { useAgentBrain } from './hooks/use-agent-brain';
import { BoundingBox, Message } from './types';

const MindPalace3DView = React.lazy(() => import('./components/MindPalace3DView'));
const MindPalaceSidebar = React.lazy(() => import('./components/MindPalaceSidebar'));

function App() {
  const canvasRef = useRef<CanvasLayerHandle>(null);
  const isHoveringHUDRef = useRef(false);
  const liveFocusIdsRef = useRef(new Set<string>());
  const previousConnectionStateRef = useRef<string>('disconnected');

  const [is3DViewOpen, setIs3DViewOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [settingsWarning, setSettingsWarning] = useState('');

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { activeTool, setActiveTool, tools } = useToolState();
  const { suggestions, visible: suggestionsVisible, generateSuggestions, dismiss: dismissSuggestions } = useSuggestions();

  // Ref bridge: useAIOverlays is created before useLiveApi, so we forward the
  // overlay-expired callback through a ref that gets assigned after useLiveApi init.
  const onOverlayExpiredRef = useRef<((id: string) => void) | undefined>(undefined);
  // Same pattern for appendSystemMessage — needed by agent callbacks before useLiveApi init.
  const appendSystemMessageRef = useRef<((text: string) => void) | undefined>(undefined);
  const { overlays: aiOverlays, addOverlay, removeOverlay, clearAll: clearOverlays, restoreSnapshot } = useAIOverlays(
    (id) => onOverlayExpiredRef.current?.(id),
  );
  const memory = useSessionMemory();
  const settings = useSettings();

  // Turn-complete callback: trigger suggestions + snapshot to session memory
  const handleTurnComplete = useCallback((msgs: Message[]) => {
    generateSuggestions(msgs);

    // Snapshot the completed turn into session memory
    const userMsgs = msgs.filter(m => m.role === 'user');
    const modelMsgs = msgs.filter(m => m.role === 'model');
    const lastUser = userMsgs[userMsgs.length - 1];
    const lastModel = modelMsgs[modelMsgs.length - 1];

    if (lastUser && lastModel) {
      const artifacts = canvasRef.current?.getArtifacts();
      memory.addTurn(
        lastUser.text,
        lastModel.text,
        [
          ...(artifacts?.boxes || []).map(b => ({ type: 'focus-box' as const, box: b })),
          ...(artifacts?.strokes || []).map(s => ({ type: 'draw-stroke' as const, stroke: s })),
        ]
      );
    }
  }, [generateSuggestions, memory]);

  // ── Agent Brain ───────────────────────────────────────────────────────────
  const agent = useAgentBrain({
    apiKey: settings.apiKey,
    onComplete: (task) => {
      appendSystemMessageRef.current?.(
        task.finalAnswer
          ? `Agent complete: ${task.finalAnswer.slice(0, 200)}${task.finalAnswer.length > 200 ? '…' : ''}`
          : 'Agent task complete.',
      );
    },
    onError: (error) => {
      appendSystemMessageRef.current?.(`Agent failed: ${error}`);
    },
  });

  // Holds recent transcript for the agent brain to use as context.
  const voiceContextRef = useRef('');

  const {
    connect, disconnect, connectionState, connectionErrorMessage, messages,
    startMic, stopMic, isMicOn, sendRealtimeImage, sendTextContext, appendSystemMessage,
    handleOverlayExpired,
  } = useLiveApi(settings.apiKey, handleTurnComplete, {
    voiceName: settings.voiceName,
  }, { addOverlay, removeOverlay, clearAll: clearOverlays, restoreSnapshot }, {
    startTask: (task) => agent.startTask(task, voiceContextRef.current),
    cancelTask: () => agent.cancelTask(),
  });

  // Wire the ref bridges now that useLiveApi is initialized
  onOverlayExpiredRef.current = handleOverlayExpired;
  appendSystemMessageRef.current = appendSystemMessage;

  // Keep voiceContextRef in sync with the live transcript
  useEffect(() => {
    voiceContextRef.current = messages.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
  }, [messages]);

  // ── Mind Palace ──────────────────────────────────────────────────────────
  const mindPalace = useMindPalacePipeline({ apiKey: settings.apiKey, messages });
  const mindPalaceSidebar = useMindPalaceSidebar({
    apiKey: settings.apiKey,
    initialize: mindPalace.initialize,
  });
  const visualInputOptions = settings.liteMode
    ? { captureIntervalMs: 2500, jpegQuality: 55, maxFocusRegions: 1 }
    : { captureIntervalMs: 1000, jpegQuality: 75, maxFocusRegions: 6 };

  const { upsertFocusRegion, removeFocusRegion, clear: clearVisualQueue } = useVisualInputQueue(
    connectionState,
    sendRealtimeImage,
    sendTextContext,
    mindPalace.onCaptureTick,
    visualInputOptions,
  );

  // ── Connect / Disconnect ──────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    const trimmedKey = settings.apiKey.trim();
    if (!trimmedKey) {
      setSettingsWarning('Enter your Gemini API key before starting Tana.');
      settings.openSettings();
      return;
    }
    if (trimmedKey.length < 20) {
      setSettingsWarning('That API key looks invalid. Check it and try again.');
      settings.openSettings();
      return;
    }
    if (connectionState !== 'disconnected') {
      return;
    }
    setSettingsWarning('');
    if (canvasRef.current) {
      const success = await canvasRef.current.startStreaming();
      if (success) await connect();
    }
  }, [connect, connectionState, settings]);

  const handleSaveApiKey = useCallback((key: string) => {
    setSettingsWarning('');
    settings.saveApiKey(key);
  }, [settings]);

  const handleDisconnect = useCallback(() => {
    clearVisualQueue();
    liveFocusIdsRef.current.clear();
    disconnect();
    canvasRef.current?.stopStreaming();
    clearOverlays();
    dismissSuggestions();
    memory.clear();
  }, [clearOverlays, clearVisualQueue, disconnect, dismissSuggestions, memory]);

  const handleToggleMic = () => { isMicOn ? stopMic() : startMic(); };

  // Auto-start mic once connected
  useEffect(() => {
    if (connectionState === 'connected' && !isMicOn) startMic();
  }, [connectionState, startMic]);

  // Auto-open settings on connection error so user can fix their API key
  useEffect(() => {
    if (connectionState === 'error') {
      if (connectionErrorMessage) {
        setSettingsWarning(connectionErrorMessage);
      }
      const timer = setTimeout(() => settings.openSettings(), 800);
      return () => clearTimeout(timer);
    }
  }, [connectionErrorMessage, connectionState, settings]);

  // ── Cursor passthrough: toggle Electron click-through ───────────────────────
  useEffect(() => {
    const tana = (window as any).tana;
    if (!tana?.setIgnoreMouseEvents) return;

    if (settings.showSettings || isSettingsPanelOpen || isHoveringHUDRef.current || mindPalaceSidebar.isOpen || is3DViewOpen || agent.currentTask !== null) {
      // Settings modal/panel, HUD, sidebar, or 3D view open — always capture
      tana.setIgnoreMouseEvents(false);
    } else if (connectionState === 'connected' && activeTool !== 'cursor') {
      // Drawing tools need to capture mouse events for canvas interaction
      tana.setIgnoreMouseEvents(false);
    } else {
      // Idle or cursor mode: pass through clicks so the desktop remains usable
      tana.setIgnoreMouseEvents(true, { forward: true });
    }
  }, [activeTool, connectionState, settings.showSettings, isSettingsPanelOpen, mindPalaceSidebar.isOpen, is3DViewOpen]);

  // ── Region Capture pipeline ───────────────────────────────────────────────
  const handleBoxCreated = useCallback(
    (box: BoundingBox, regionBase64: string | null) => {
      if (regionBase64) {
        const isNewFocus = !liveFocusIdsRef.current.has(box.id);
        upsertFocusRegion(box, regionBase64);
        if (isNewFocus) {
          liveFocusIdsRef.current.add(box.id);
          appendSystemMessage('Focus region added to live visual stream.');
        }
        dismissSuggestions(); // new user action clears stale suggestions
      }
    },
    [appendSystemMessage, dismissSuggestions, upsertFocusRegion]
  );

  const handleBoxCaptureFailed = useCallback(() => {
    appendSystemMessage('Focus region capture failed, so the box was removed and nothing was sent. Try drawing it again.');
    dismissSuggestions();
  }, [appendSystemMessage, dismissSuggestions]);

  const handleBoxDeleted = useCallback((box: BoundingBox) => {
    liveFocusIdsRef.current.delete(box.id);
    removeFocusRegion(box.id);
    appendSystemMessage('Focus box removed from live visual stream. Previously streamed focus images may still affect the conversation until newer visuals replace them.');
    dismissSuggestions();
  }, [appendSystemMessage, dismissSuggestions, removeFocusRegion]);

  // ── Suggestion chip click ─────────────────────────────────────────────────
  const handleSuggestionSelect = useCallback((_text: string) => {
    dismissSuggestions();
  }, [dismissSuggestions]);

  const handleOpen3DView = useCallback(() => {
    void mindPalace.initialize().then(() => {
      setIs3DViewOpen(true);
    }).catch((err: Error) => {
      console.error('[MindPalace] Failed to open 3D view:', err);
    });
  }, [mindPalace.initialize]);

  // ── Settings shortcut (Cmd+,) ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        settings.openSettings();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settings.openSettings]);

  useEffect(() => {
    const tana = (window as any).tana;
    if (!tana?.onGlobalEscape) return;

    return tana.onGlobalEscape(() => {
      handleDisconnect();
      setActiveTool('cursor');
    });
  }, [handleDisconnect, setActiveTool]);

  useEffect(() => {
    const previousConnectionState = previousConnectionStateRef.current;
    const wasConnected = previousConnectionState === 'connected';
    const isConnected = connectionState === 'connected';

    if (wasConnected && !isConnected) {
      clearVisualQueue();
      liveFocusIdsRef.current.clear();
      canvasRef.current?.stopStreaming();
      clearOverlays();
      dismissSuggestions();
      setActiveTool('cursor');
    } else if (connectionState === 'disconnected' || connectionState === 'error') {
      clearVisualQueue();
      liveFocusIdsRef.current.clear();
      canvasRef.current?.stopStreaming();
      clearOverlays();
      dismissSuggestions();
      setActiveTool('cursor');
    }

    previousConnectionStateRef.current = connectionState;
  }, [clearOverlays, clearVisualQueue, connectionState, dismissSuggestions, setActiveTool]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'transparent' }}>

      {/* Settings Modal (first-run or Cmd+,) */}
      <SettingsModal
        isOpen={settings.showSettings}
        currentKey={settings.apiKey}
        initialError={settingsWarning}
        onSave={handleSaveApiKey}
        onClose={settings.closeSettings}
        isFirstRun={!settings.hasApiKey}
      />

      {/* Transparent overlay canvas (full screen) */}
      <div className="absolute inset-0 z-0">
        <CanvasLayer
          ref={canvasRef}
          onFrameCapture={() => {}}
          onBoxCreated={handleBoxCreated}
          onBoxCaptureFailed={handleBoxCaptureFailed}
          onBoxDeleted={handleBoxDeleted}
          isStreaming={connectionState === 'connected'}
          activeTool={activeTool}
          aiOverlays={aiOverlays}
        />
      </div>

      {/* HUD (floats above) */}
      <ControlHUD
        connectionState={connectionState}
        isMicOn={isMicOn}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onToggleMic={handleToggleMic}
        messages={messages}
        activeTool={activeTool}
        tools={tools}
        onToolChange={setActiveTool}
        suggestions={suggestions}
        suggestionsVisible={suggestionsVisible}
        onSuggestionSelect={handleSuggestionSelect}
        onHoverChange={(isHovering) => { isHoveringHUDRef.current = isHovering; }}
        onMindPalaceToggle={mindPalaceSidebar.toggle}
        mindPalaceEnabled={mindPalace.enabled}
        onSettingsOpen={() => setIsSettingsPanelOpen(true)}
        isOverlayActive={isSettingsPanelOpen || settings.showSettings}
      />

      {/* Settings Panel (in-app settings) */}
      <SettingsPanel
        isOpen={isSettingsPanelOpen}
        currentKey={settings.apiKey}
        currentVoiceName={settings.voiceName}
        liteMode={settings.liteMode}
        isLiteModeRecommended={settings.isLiteModeRecommended}
        liteModeOverrideSource={settings.liteModeOverrideSource}
        onSaveApiKey={handleSaveApiKey}
        onSaveVoiceName={settings.saveVoiceName}
        onSaveLiteMode={settings.saveLiteMode}
        onClose={() => setIsSettingsPanelOpen(false)}
      />

      {/* Mind Palace Sidebar */}
      <Suspense fallback={null}>
        <MindPalaceSidebar
          isOpen={mindPalaceSidebar.isOpen}
          onClose={mindPalaceSidebar.close}
          enabled={mindPalace.enabled}
          onToggleEnabled={mindPalace.setEnabled}
          query={mindPalaceSidebar.query}
          onQueryChange={mindPalaceSidebar.setQuery}
          results={mindPalaceSidebar.results}
          isSearching={mindPalaceSidebar.isSearching}
          stats={mindPalace.stats}
          pendingEmbeds={mindPalace.pendingEmbeds}
          thumbnailCache={mindPalaceSidebar.thumbnailCache}
          onLoadThumbnail={mindPalaceSidebar.loadThumbnail}
          onOpen3DView={handleOpen3DView}
        />
      </Suspense>

      {/* Agent Result Card */}
      <AgentResultCard
        task={agent.currentTask}
        status={agent.status}
        onCancel={agent.cancelTask}
        onDismiss={agent.dismissTask}
      />

      {/* Mind Palace 3D Visualization */}
      <Suspense fallback={null}>
        <MindPalace3DView
          isOpen={is3DViewOpen}
          onClose={() => setIs3DViewOpen(false)}
          initializeMindPalace={mindPalace.initialize}
        />
      </Suspense>
    </div>
  );
}

export default App;
