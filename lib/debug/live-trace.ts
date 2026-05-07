/**
 * Dev-only trace utility for tool-call lifecycle events.
 * Records recent events in a circular buffer (last 50 entries).
 * Readable via console: `window.__liveTrace`
 *
 * No sensitive data — no screenshots, audio, or transcriptions.
 */

export type LiveTraceEvent =
  | 'tool_call_received'
  | 'tool_call_validated'
  | 'tool_call_rejected'
  | 'overlay_added'
  | 'tool_response_sent'
  | 'tool_call_cancelled'
  | 'overlay_removed_by_cancellation';

interface TraceEntry {
  timestamp: number;
  event: LiveTraceEvent;
  toolCallId?: string;
  functionName?: string;
  overlayIds?: string[];
  detail?: Record<string, unknown>;
}

const MAX_ENTRIES = 50;
const buffer: TraceEntry[] = [];

export function liveTrace(
  event: LiveTraceEvent,
  meta: {
    toolCallId?: string;
    functionName?: string;
    overlayIds?: string[];
    detail?: Record<string, unknown>;
  } = {}
) {
  const entry: TraceEntry = {
    timestamp: Date.now(),
    event,
    ...meta,
  };

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();

  if ((import.meta as any).env?.DEV) {
    console.debug(`[live-trace] ${event}`, meta);
  }
}

export function getTraceBuffer(): readonly TraceEntry[] {
  return buffer;
}

export function clearTraceBuffer() {
  buffer.length = 0;
}

// Expose to devtools for inspection
if (typeof window !== 'undefined') {
  (window as any).__liveTrace = { getBuffer: getTraceBuffer, clear: clearTraceBuffer };
}
