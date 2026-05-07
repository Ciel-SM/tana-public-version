import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionCall } from '@google/genai';
import { b64ToUint8Array, decodeAudioData, float32ToInt16, arrayBufferToBase64 } from '../utils/audio-utils';
import { ConnectionState, Message, AIOverlayType } from '../types';
import { getCredentialErrorMessage, normalizeApiKey } from '../lib/google-api-errors';
import { normalizeLiveVoiceName } from '../lib/live-voice-options';
import { liveTrace } from '../lib/debug/live-trace';

const MODEL_NAME = 'gemini-3.1-flash-live-preview';

const isClosedSocketError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('WebSocket is already in CLOSING or CLOSED state');
};

// ── Overlay validation helpers ──────────────────────────────────────────────

const VALID_OVERLAY_TYPES = new Set<string>([
  'highlight', 'pointer', 'pulse', 'callout', 'circle', 'arrow',
]);

function toFiniteNumber(val: unknown): number | null {
  if (typeof val !== 'number') return null;
  if (!Number.isFinite(val)) return null;
  return val;
}

function clampNum(val: number | null, min: number, max: number): number | null {
  if (val === null) return null;
  return Math.max(min, Math.min(max, val));
}

interface MappedOverlay {
  type: AIOverlayType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  label?: string;
  targetX?: number;
  targetY?: number;
}

function validateAndMapOverlay(
  raw: Record<string, unknown>,
  screenW: number,
  screenH: number,
): MappedOverlay | null {
  const type = raw.type;
  if (typeof type !== 'string' || !VALID_OVERLAY_TYPES.has(type)) return null;

  const x = clampNum(toFiniteNumber(raw.x), 0, 1000);
  const y = clampNum(toFiniteNumber(raw.y), 0, 1000);
  if (x === null || y === null) return null;

  const mapped: MappedOverlay = {
    type: type as AIOverlayType,
    x: (x / 1000) * screenW,
    y: (y / 1000) * screenH,
  };

  if (raw.width != null) {
    const w = clampNum(toFiniteNumber(raw.width), 1, 1000);
    if (w !== null) mapped.width = (w / 1000) * screenW;
  }
  if (raw.height != null) {
    const h = clampNum(toFiniteNumber(raw.height), 1, 1000);
    if (h !== null) mapped.height = (h / 1000) * screenH;
  }
  if (typeof raw.label === 'string') {
    mapped.label = raw.label.slice(0, 100);
  }

  if (type === 'arrow') {
    const tx = clampNum(toFiniteNumber(raw.target_x), 0, 1000);
    const ty = clampNum(toFiniteNumber(raw.target_y), 0, 1000);
    if (tx === null || ty === null) return null;
    mapped.targetX = (tx / 1000) * screenW;
    mapped.targetY = (ty / 1000) * screenH;
  }

  return mapped;
}

// ── Tool declarations for Gemini Live ───────────────────────────────────────

const OVERLAY_TOOL_DECLARATIONS = [
  {
    name: 'draw_overlays',
    description: 'Draw visual annotations (boxes, circles, arrows, pointers) on the user\'s screen to guide them.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        overlays: {
          type: 'ARRAY' as const,
          description: 'Array of overlays to draw on screen.',
          items: {
            type: 'OBJECT' as const,
            properties: {
              type: {
                type: 'STRING' as const,
                enum: ['highlight', 'circle', 'arrow', 'pointer', 'pulse', 'callout'],
                description: 'Overlay shape type.',
              },
              x: { type: 'NUMBER' as const, description: '0-1000 normalized X position (0=left edge, 1000=right edge).' },
              y: { type: 'NUMBER' as const, description: '0-1000 normalized Y position (0=top edge, 1000=bottom edge).' },
              width: { type: 'NUMBER' as const, description: '0-1000 normalized width (for highlight/circle).' },
              height: { type: 'NUMBER' as const, description: '0-1000 normalized height (for highlight/circle).' },
              label: { type: 'STRING' as const, description: 'Short text label for the annotation.' },
              target_x: { type: 'NUMBER' as const, description: 'Arrow tip X (0-1000). Required for arrow type.' },
              target_y: { type: 'NUMBER' as const, description: 'Arrow tip Y (0-1000). Required for arrow type.' },
            },
            required: ['type', 'x', 'y'],
          },
        },
        duration_ms: { type: 'NUMBER' as const, description: 'Display duration in milliseconds. Default 6000.' },
      },
      required: ['overlays'],
    },
  },
  {
    name: 'clear_overlays',
    description: 'Remove all visual annotations currently on the user\'s screen.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {},
    },
  },
];

// ── Agent task tool declarations ────────────────────────────────────────────

const AGENT_TOOL_DECLARATIONS = [
  {
    name: 'start_agent_task',
    description: 'Start an agentic task that will control the computer to fulfill the user\'s request. Use this when the user asks you to DO something on their computer — search the web, open an app or URL, look something up, automate a workflow, etc. Announce verbally what you\'re about to do, then call this tool.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        task: {
          type: 'STRING' as const,
          description: 'Clear, complete description of the task to execute.',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'cancel_agent_task',
    description: 'Cancel the currently running agentic task.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {},
    },
  },
];

// ── Agent callback types ────────────────────────────────────────────────────

export interface AgentCallbacks {
  startTask: (task: string, voiceContext?: string) => void;
  cancelTask: () => void;
}

// ── Overlay callback types ──────────────────────────────────────────────────

export interface OverlayCallbacks {
  addOverlay: (
    type: AIOverlayType,
    x: number,
    y: number,
    opts?: { width?: number; height?: number; label?: string; duration?: number; targetX?: number; targetY?: number },
  ) => string;
  removeOverlay: (id: string) => void;
  clearAll: (snapshotKey?: string) => void;
  restoreSnapshot: (key: string) => void;
}

export const useLiveApi = (
  apiKey: string,
  onTurnComplete?: (messages: Message[]) => void,
  voicePreferences?: { voiceName?: string },
  overlayCallbacks?: OverlayCallbacks,
  agentCallbacks?: AgentCallbacks,
) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMicOn, setIsMicOn] = useState(false);
  const [connectionErrorMessage, setConnectionErrorMessage] = useState('');
  const connectionStateRef = useRef<ConnectionState>('disconnected');

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // API Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectingRef = useRef(false);
  // We don't store the AI client instance in a ref anymore to ensure we always recreate it with latest key
  
  // Turn-complete callback ref (avoids stale closure in handleServerMessage)
  const onTurnCompleteRef = useRef(onTurnComplete);
  onTurnCompleteRef.current = onTurnComplete;

  // Overlay callback ref (avoids stale closure in handleServerMessage)
  const overlayCallbacksRef = useRef(overlayCallbacks);
  overlayCallbacksRef.current = overlayCallbacks;

  // Agent callback ref (avoids stale closure in handleServerMessage)
  const agentCallbacksRef = useRef(agentCallbacks);
  agentCallbacksRef.current = agentCallbacks;

  // Track which overlays were created by which tool call for cancellation support
  const toolCallOverlayMapRef = useRef(new Map<string, string[]>());
  // Snapshot of tracking map before clear_overlays, so cancellation can restore
  const clearSnapshotsRef = useRef(new Map<string, Map<string, string[]>>());

  // Media Stream References
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  // Soft-mute: keeps capture running locally while pausing outbound audio packets.
  const isMicMutedRef = useRef(false);
  // Guard: prevents concurrent getUserMedia calls which each spawn a system dialog
  const isMicStartingRef = useRef(false);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Cleanup logic if needed when component unmounts
      // We rely on the disconnect function usually
    };
  }, []);

  // Keep a ref to apiKey so the connect callback always uses the latest value
  const apiKeyRef = useRef(normalizeApiKey(apiKey) || '');
  apiKeyRef.current = normalizeApiKey(apiKey) || '';
  const voiceNameRef = useRef(normalizeLiveVoiceName(voicePreferences?.voiceName));
  voiceNameRef.current = normalizeLiveVoiceName(voicePreferences?.voiceName);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  // ── Shared audio/mic teardown ─────────────────────────────────────────────
  // Called by both disconnect() (user-initiated) and onclose (server-initiated)
  // so that stale refs never survive into a subsequent session.
  const clearPlaybackQueue = useCallback(() => {
    sourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch {
        // Source may already be ended/stopped.
      }
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const cleanupAudio = useCallback(() => {
    clearPlaybackQueue();
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    isMicMutedRef.current = false;
    isMicStartingRef.current = false;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    setIsMicOn(false);
  }, [clearPlaybackQueue]);

  const cleanupFailedConnection = useCallback(() => {
    cleanupAudio();
    isConnectingRef.current = false;
    sessionPromiseRef.current = null;
    toolCallOverlayMapRef.current.clear();
    clearSnapshotsRef.current.clear();
  }, [cleanupAudio]);

  const connect = useCallback(async () => {
    if (isConnectingRef.current || connectionStateRef.current === 'connected') {
      return;
    }

    const key = apiKeyRef.current;
    if (!key) {
      console.error("API Key is missing");
      setConnectionState('error');
      return;
    }

    isConnectingRef.current = true;
    setConnectionErrorMessage('');
    const ai = new GoogleGenAI({ apiKey: key });
    setConnectionState('connecting');

    // 15-second timeout — if onopen never fires, surface an error
    connectTimeoutRef.current = setTimeout(() => {
      setConnectionState(prev => {
        if (prev !== 'connecting') return prev;
        cleanupFailedConnection();
        return 'error';
      });
    }, 15000);

    try {
      // Setup Audio Contexts
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const config = {
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          // Gemini 3.1 uses coarse thinking levels rather than token budgets.
          // HIGH is the closest match to the previous max-budget 2.5 setting.
          thinkingConfig: {
            thinkingLevel: 'high',
          },
          // Keep silence out of turns while still allowing passively streamed
          // screenshots and focus crops to rotate through realtime input.
          realtimeInputConfig: {
            turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
          },
          // Enable both input and output transcription for the chat UI
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceNameRef.current } },
          },
          tools: [{ functionDeclarations: [...OVERLAY_TOOL_DECLARATIONS, ...AGENT_TOOL_DECLARATIONS] }],
          systemInstruction: `You are Tana, a highly intelligent, desktop-integrated AI assistant and Mac agent.
          The user is sharing their screen with you.
          The user may select regions of the screen using a focus box tool. You may receive alternating full-screen images and focus-region images over the realtime visual stream. Focus-region images emphasize a specific part of the current screen, but they do not replace the rest of the screen context.
          Treat image-only updates as preparation only: do not answer, speak, or summarize anything until the user asks a spoken or typed question.
          Be concise, direct, and helpful. Act like a "co-pilot" overlay.
          Do not describe the screen unless asked. Focus on answering the user's specific query about the visual data.
          If you have not received any image frames, or if a system message tells you screen capture is unavailable, say "I can't see your screen right now" — do not guess or fabricate screen contents.
          When describing what you see, always cite specific on-screen details (text, UI labels, colors, window titles) that prove you are reading the actual frame. Never give vague descriptions without concrete specifics.
          If you are uncertain about what is on screen, say so honestly rather than speculating.
          You have tools to draw visual annotations on the user's screen. Use draw_overlays when the user asks where something is, or when pointing at a specific UI element would be helpful. Coordinates use a 0-1000 range where (0,0) is top-left and (1000,1000) is bottom-right of the screen. Available overlay types: highlight (rectangle), circle (ellipse), arrow (line with arrowhead), pointer (pulsing dot), pulse (expanding rings), callout (labeled note). Use clear_overlays to remove annotations when they're no longer relevant. Do not overuse annotations — only draw when visual guidance adds clear value.
          You also have an agentic capability: use start_agent_task when the user asks you to DO something on their computer — search the web, open a website or app, look up information, type something, etc. When you call start_agent_task, briefly tell the user what you're about to do (e.g. "Sure, let me search for that"), then call the tool. The results will appear on screen when the task completes. Use cancel_agent_task if the user says "stop" or "cancel" while a task is running.`,
        },
      };

      sessionPromiseRef.current = ai.live.connect({
        ...config,
        callbacks: {
          onopen: () => {
            if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
            isConnectingRef.current = false;
            setConnectionErrorMessage('');
            setConnectionState('connected');
            setMessages([{
              id: Date.now().toString(),
              role: 'system',
              text: 'Tana is listening...',
              timestamp: new Date()
            }]);
          },
          onmessage: async (message: LiveServerMessage) => {
            handleServerMessage(message);
          },
          onclose: () => {
            if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
            cleanupFailedConnection();
            setConnectionState('disconnected');
          },
          onerror: (err) => {
            if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
            console.error("Live API Error:", err);
            setConnectionErrorMessage(getCredentialErrorMessage(err, 'Gemini Live access'));
            cleanupFailedConnection();
            setConnectionState('error');
          }
        }
      });

    } catch (error) {
      console.error("Connection failed", error);
      setConnectionErrorMessage(getCredentialErrorMessage(error, 'Gemini Live access'));
      cleanupFailedConnection();
      setConnectionState('error');
    }
  }, [cleanupFailedConnection]);

  const disconnect = useCallback(() => {
    if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
    isConnectingRef.current = false;
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
        if (session.close) session.close();
      }).catch(e => console.log("Error closing session", e));
      sessionPromiseRef.current = null;
    }
    cleanupAudio();
    toolCallOverlayMapRef.current.clear();
    clearSnapshotsRef.current.clear();
    setConnectionErrorMessage('');
    setConnectionState('disconnected');
  }, [cleanupAudio]);

  const sendRealtimePayload = useCallback((payload: Record<string, unknown>) => {
    const sessionPromise = sessionPromiseRef.current;
    if (!sessionPromise) return;

    sessionPromise.then(session => {
      if (sessionPromiseRef.current !== sessionPromise) return;

      try {
        session.sendRealtimeInput(payload);
      } catch (error) {
        if (isClosedSocketError(error)) return;
        console.error('Failed to send realtime input', error);
      }
    }).catch(error => {
      if (sessionPromiseRef.current !== sessionPromise) return;
      console.error('Failed to resolve live session', error);
    });
  }, []);

  const appendTranscriptMessage = useCallback((role: 'user' | 'model', text?: string | null) => {
    if (!text) return;

    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === role && !lastMsg.text.endsWith('\n')) {
        const updatedMsg = { ...lastMsg, text: lastMsg.text + text };
        return [...prev.slice(0, -1), updatedMsg];
      }

      return [...prev, {
        id: Date.now().toString(),
        role,
        text,
        timestamp: new Date(),
      }];
    });
  }, []);

  // ── Tool-call handler (draw_overlays / clear_overlays) ─────────────────────
  const handleToolCalls = (functionCalls: FunctionCall[]) => {
    const sessionPromise = sessionPromiseRef.current;
    if (!sessionPromise) return;

    for (const call of functionCalls) {
      const { id: callId, name, args } = call;
      liveTrace('tool_call_received', { toolCallId: callId, functionName: name });

      if (name === 'clear_overlays') {
        // Snapshot tracking map before clearing so cancellation can restore
        if (callId) {
          clearSnapshotsRef.current.set(callId, new Map(toolCallOverlayMapRef.current));
        }
        overlayCallbacksRef.current?.clearAll(callId);
        toolCallOverlayMapRef.current.clear();
        liveTrace('tool_response_sent', { toolCallId: callId, functionName: name });
        sessionPromise.then(session => {
          if (sessionPromiseRef.current !== sessionPromise) return;
          try {
            session.sendToolResponse({
              functionResponses: [{ id: callId, name, response: { output: 'success' } }],
            });
          } catch (err) { if (!isClosedSocketError(err)) console.error('sendToolResponse failed', err); }
        }).catch(() => {});
        continue;
      }

      if (name === 'start_agent_task') {
        const task = String((args as any)?.task ?? '');
        liveTrace('tool_call_received', { toolCallId: callId, functionName: name, detail: { task } });
        // Fire immediately — don't block the voice session
        agentCallbacksRef.current?.startTask(task);
        sessionPromise.then(session => {
          if (sessionPromiseRef.current !== sessionPromise) return;
          try {
            session.sendToolResponse({
              functionResponses: [{ id: callId, name, response: { output: 'Task started. Results will appear on screen when complete.' } }],
            });
          } catch (err) { if (!isClosedSocketError(err)) console.error('sendToolResponse failed', err); }
        }).catch(() => {});
        continue;
      }

      if (name === 'cancel_agent_task') {
        liveTrace('tool_call_received', { toolCallId: callId, functionName: name });
        agentCallbacksRef.current?.cancelTask();
        sessionPromise.then(session => {
          if (sessionPromiseRef.current !== sessionPromise) return;
          try {
            session.sendToolResponse({
              functionResponses: [{ id: callId, name, response: { output: 'Task cancelled.' } }],
            });
          } catch (err) { if (!isClosedSocketError(err)) console.error('sendToolResponse failed', err); }
        }).catch(() => {});
        continue;
      }

      if (name === 'draw_overlays') {
        const rawOverlays = (args as any)?.overlays;
        if (!Array.isArray(rawOverlays)) {
          liveTrace('tool_call_rejected', { toolCallId: callId, functionName: name });
          sessionPromise.then(session => {
            if (sessionPromiseRef.current !== sessionPromise) return;
            try {
              session.sendToolResponse({
                functionResponses: [{ id: callId, name, response: { error: 'overlays must be an array' } }],
              });
            } catch (err) { if (!isClosedSocketError(err)) console.error('sendToolResponse failed', err); }
          }).catch(() => {});
          continue;
        }

        const durationMs = toFiniteNumber((args as any)?.duration_ms) ?? 6000;
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const createdIds: string[] = [];

        for (const rawItem of rawOverlays) {
          if (typeof rawItem !== 'object' || rawItem === null) continue;
          const mapped = validateAndMapOverlay(rawItem as Record<string, unknown>, screenW, screenH);
          if (!mapped) continue;

          liveTrace('tool_call_validated', { toolCallId: callId, functionName: name, detail: { type: mapped.type, x: mapped.x, y: mapped.y } });

          const overlayId = overlayCallbacksRef.current?.addOverlay(
            mapped.type,
            mapped.x,
            mapped.y,
            {
              width: mapped.width,
              height: mapped.height,
              label: mapped.label,
              targetX: mapped.targetX,
              targetY: mapped.targetY,
              duration: durationMs,
            },
          );

          if (overlayId) {
            createdIds.push(overlayId);
            liveTrace('overlay_added', { toolCallId: callId, overlayIds: [overlayId] });
          }
        }

        if (callId) {
          toolCallOverlayMapRef.current.set(callId, createdIds);
        }

        liveTrace('tool_response_sent', { toolCallId: callId, functionName: name, overlayIds: createdIds });
        sessionPromise.then(session => {
          if (sessionPromiseRef.current !== sessionPromise) return;
          try {
            session.sendToolResponse({
              functionResponses: [{ id: callId, name, response: { output: 'success', count: createdIds.length } }],
            });
          } catch (err) { if (!isClosedSocketError(err)) console.error('sendToolResponse failed', err); }
        }).catch(() => {});
      }
    }
  };

  // ── Tool-call cancellation (undo visible side effects) ────────────────────
  const handleToolCallCancellation = (ids: string[]) => {
    for (const toolCallId of ids) {
      liveTrace('tool_call_cancelled', { toolCallId });

      // Check if this was a clear_overlays call — restore from snapshot
      const clearSnapshot = clearSnapshotsRef.current.get(toolCallId);
      if (clearSnapshot) {
        overlayCallbacksRef.current?.restoreSnapshot(toolCallId);
        // Restore tracking map from snapshot
        clearSnapshot.forEach((overlayIds, key) => {
          toolCallOverlayMapRef.current.set(key, overlayIds);
        });
        clearSnapshotsRef.current.delete(toolCallId);
        liveTrace('overlay_removed_by_cancellation', { toolCallId, detail: { type: 'clear_restored' } });
        continue;
      }

      // Normal draw_overlays cancellation — remove the overlays
      const overlayIds = toolCallOverlayMapRef.current.get(toolCallId);
      if (overlayIds) {
        overlayIds.forEach(id => {
          overlayCallbacksRef.current?.removeOverlay(id);
          liveTrace('overlay_removed_by_cancellation', { toolCallId, overlayIds: [id] });
        });
        toolCallOverlayMapRef.current.delete(toolCallId);
      }
    }
  };

  const handleServerMessage = async (message: LiveServerMessage) => {
    // ── Tool calls (top-level, not inside serverContent) ──
    if (message.toolCall?.functionCalls) {
      handleToolCalls(message.toolCall.functionCalls);
    }

    // ── Tool call cancellations ──
    if (message.toolCallCancellation?.ids) {
      handleToolCallCancellation(message.toolCallCancellation.ids);
    }

    // ── Existing serverContent handling ──
    const { serverContent } = message;
    if (!serverContent) return;

    if (serverContent.interrupted) {
      clearPlaybackQueue();
    }

    // A single event can contain multiple output parts; process all audio chunks.
    for (const part of serverContent.modelTurn?.parts ?? []) {
      const inlineData = part.inlineData;
      if (inlineData?.data && (!inlineData.mimeType || inlineData.mimeType.startsWith('audio/'))) {
        if (outputAudioContextRef.current) {
          void playAudio(inlineData.data);
        }
        continue;
      }

      if (part.text && !serverContent.outputTranscription?.text) {
        appendTranscriptMessage('model', part.text);
      }
    }

    appendTranscriptMessage('user', serverContent.inputTranscription?.text);
    appendTranscriptMessage('model', serverContent.outputTranscription?.text);

    if (serverContent.turnComplete) {
      // Fire callback with current messages so App can trigger suggestions + memory
      setMessages(prev => {
        onTurnCompleteRef.current?.(prev);
        return prev;
      });
    }
  };

  const playAudio = async (base64Audio: string) => {
    if (!outputAudioContextRef.current) return;
    
    const ctx = outputAudioContextRef.current;
    const audioBuffer = await decodeAudioData(
      b64ToUint8Array(base64Audio),
      ctx,
      24000,
      1
    );

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    
    const now = ctx.currentTime;
    // Ensure smooth playback by scheduling next chunk
    const startTime = Math.max(now, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    source.connect(ctx.destination);
    sourcesRef.current.add(source);
    
    source.onended = () => {
      sourcesRef.current.delete(source);
    };
  };

  const startMic = useCallback(async () => {
    if (!inputAudioContextRef.current || !sessionPromiseRef.current) return;

    // Unmute path: stream is already running, just clear the mute flag
    if (mediaStreamRef.current && processorRef.current) {
      isMicMutedRef.current = false;
      setIsMicOn(true);
      return;
    }

    // Prevent concurrent getUserMedia calls — each spawns a separate system dialog
    if (isMicStartingRef.current) return;
    isMicStartingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputAudioContext = inputAudioContextRef.current;
      const sessionPromise = sessionPromiseRef.current;
      if (!inputAudioContext || !sessionPromise) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      mediaStreamRef.current = stream;
      isMicMutedRef.current = false;

      const source = inputAudioContext.createMediaStreamSource(stream);
      const processor = inputAudioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (isMicMutedRef.current) {
          return;
        }

        const rawData = e.inputBuffer.getChannelData(0);
        // Downsample/Convert float32 to int16 PCM
        const pcm16 = float32ToInt16(rawData);
        const uint8 = new Uint8Array(pcm16.buffer);
        const base64 = arrayBufferToBase64(uint8.buffer);

        sendRealtimePayload({
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64
          }
        });
      };

      source.connect(processor);
      processor.connect(inputAudioContext.destination);
      processorRef.current = processor;

      setIsMicOn(true);
    } catch (err) {
      console.error("Error accessing microphone", err);
    } finally {
      isMicStartingRef.current = false;
    }
  }, []);

  const stopMic = useCallback(() => {
    if (isMicMutedRef.current) {
      setIsMicOn(false);
      return;
    }

    // Tell Live API the current audio stream has ended so any buffered
    // speech can flush cleanly; sending audio again later resumes the stream.
    isMicMutedRef.current = true;
    sendRealtimePayload({ audioStreamEnd: true });
    setIsMicOn(false);
  }, [sendRealtimePayload]);

  const sendRealtimeImage = useCallback(async (base64Image: string, mimeType: 'image/jpeg' | 'image/png') => {
    sendRealtimePayload({
      video: {
        mimeType,
        data: base64Image,
      },
    });
  }, [sendRealtimePayload]);

  const sendTextContext = useCallback(async (text: string) => {
    sendRealtimePayload({ text });
  }, [sendRealtimePayload]);

  const appendSystemMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'system',
      text,
      timestamp: new Date(),
    }]);
  }, []);

  // Prune expired overlay IDs from the tool-call tracking map
  const handleOverlayExpired = useCallback((overlayId: string) => {
    for (const [toolCallId, ids] of toolCallOverlayMapRef.current) {
      const idx = ids.indexOf(overlayId);
      if (idx !== -1) {
        ids.splice(idx, 1);
        if (ids.length === 0) {
          toolCallOverlayMapRef.current.delete(toolCallId);
        }
        break;
      }
    }
  }, []);

  return {
    connect,
    disconnect,
    connectionState,
    connectionErrorMessage,
    messages,
    startMic,
    stopMic,
    isMicOn,
    sendRealtimeImage,
    sendTextContext,
    appendSystemMessage,
    handleOverlayExpired,
  };
};
