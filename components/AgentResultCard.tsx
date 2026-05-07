// AgentResultCard — floating overlay card that shows agent task progress and results.
// Appears bottom-right above the HUD while a task is running, and persists
// after completion until the user dismisses it.

import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle, Search, Globe, AppWindow, Keyboard, Camera, StopCircle } from 'lucide-react';
import type { AgentTask, AgentStatus, AgentStep } from '../types';

interface AgentResultCardProps {
  task: AgentTask | null;
  status: AgentStatus;
  onCancel: () => void;
  onDismiss: () => void;
}

// Icon for each step type / tool name
function StepIcon({ step }: { step: AgentStep }) {
  if (step.type === 'answer') return <CheckCircle2 size={11} className="text-emerald-400 shrink-0 mt-0.5" />;
  const tool = step.toolName ?? '';
  if (tool === 'web_search') return <Search size={11} className="text-amber-400 shrink-0 mt-0.5" />;
  if (tool === 'open_url') return <Globe size={11} className="text-sky-400 shrink-0 mt-0.5" />;
  if (tool === 'open_app') return <AppWindow size={11} className="text-violet-400 shrink-0 mt-0.5" />;
  if (tool === 'take_screenshot') return <Camera size={11} className="text-pink-400 shrink-0 mt-0.5" />;
  if (tool === 'type_text' || tool === 'press_keys') return <Keyboard size={11} className="text-cyan-400 shrink-0 mt-0.5" />;
  if (step.type === 'tool_call') return <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1" />;
  return <div className="w-2 h-2 rounded-full bg-white/30 shrink-0 mt-1" />;
}

// Render markdown-ish text: bold, line breaks, URLs
function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </React.Fragment>
      ))}
    </>
  );
}

const AgentResultCard: React.FC<AgentResultCardProps> = ({ task, status, onCancel, onDismiss }) => {
  const stepsRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  // Auto-scroll steps list to bottom
  useEffect(() => {
    if (stepsRef.current) {
      stepsRef.current.scrollTop = stepsRef.current.scrollHeight;
    }
  }, [task?.steps.length]);

  // Auto-expand when complete
  useEffect(() => {
    if (status === 'complete' || status === 'error') {
      setExpanded(true);
    }
  }, [status]);

  if (!task || status === 'idle') return null;

  const isRunning = status === 'running';
  const isComplete = status === 'complete';
  const isError = status === 'error';
  const isCancelled = status === 'cancelled';
  const isDone = isComplete || isError || isCancelled;

  const stepCount = task.steps.length;
  const lastStep = task.steps[task.steps.length - 1];

  // Show only tool_call steps in the mini step list (not tool_result, to save space)
  const visibleSteps = task.steps.filter(s => s.type === 'tool_call' || s.type === 'answer');

  return (
    <div
      className="fixed bottom-24 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]"
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{
          background: 'rgba(12, 12, 18, 0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          {/* Status indicator */}
          {isRunning && (
            <Loader2 size={14} className="text-amber-400 shrink-0 animate-spin" />
          )}
          {isComplete && (
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          )}
          {isError && (
            <XCircle size={14} className="text-red-400 shrink-0" />
          )}
          {isCancelled && (
            <StopCircle size={14} className="text-white/40 shrink-0" />
          )}

          {/* Label */}
          <span className="text-xs font-semibold tracking-wide uppercase text-white/50 shrink-0">
            {isRunning ? 'Agent' : isComplete ? 'Done' : isError ? 'Error' : 'Stopped'}
          </span>

          {/* Step count */}
          {stepCount > 0 && (
            <span className="text-xs text-white/30 shrink-0">
              {stepCount} step{stepCount !== 1 ? 's' : ''}
            </span>
          )}

          <div className="flex-1" />

          {/* Expand/collapse toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-white/30 hover:text-white/60 transition-colors text-xs px-1"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▴' : '▾'}
          </button>

          {/* Dismiss / Cancel */}
          {isDone ? (
            <button
              onClick={onDismiss}
              className="text-white/30 hover:text-white/70 transition-colors ml-1"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="text-red-400/70 hover:text-red-400 transition-colors text-xs font-medium ml-1 px-1.5 py-0.5 rounded-md border border-red-400/20 hover:border-red-400/40"
              title="Cancel task"
            >
              Stop
            </button>
          )}
        </div>

        {/* ── Task request ─────────────────────────────────────────────────── */}
        <div className="px-3 pb-1">
          <p className="text-xs text-white/40 leading-snug line-clamp-2">
            {task.userRequest}
          </p>
        </div>

        {/* ── Running: show current step ────────────────────────────────────── */}
        {isRunning && lastStep && !expanded && (
          <div className="px-3 pb-2">
            <div className="flex items-start gap-1.5">
              <StepIcon step={lastStep} />
              <span className="text-xs text-white/60 leading-snug">
                {lastStep.type === 'tool_call'
                  ? lastStep.content
                  : lastStep.content.slice(0, 80)}
              </span>
            </div>
          </div>
        )}

        {/* ── Expanded step list ────────────────────────────────────────────── */}
        {expanded && visibleSteps.length > 0 && (
          <div
            ref={stepsRef}
            className="px-3 pb-1 max-h-40 overflow-y-auto space-y-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {visibleSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <StepIcon step={step} />
                <span
                  className={`text-xs leading-snug ${
                    step.type === 'answer' ? 'text-white/80' : 'text-white/50'
                  }`}
                >
                  {step.content.slice(0, 120)}
                  {step.content.length > 120 ? '…' : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Final answer ─────────────────────────────────────────────────── */}
        {isDone && task.finalAnswer && (
          <div className="mx-3 mb-3 mt-1 rounded-xl bg-white/5 border border-white/8 p-2.5">
            <p className="text-sm text-white/90 leading-relaxed">
              <RichText text={task.finalAnswer} />
            </p>
          </div>
        )}

        {/* ── Search result links ───────────────────────────────────────────── */}
        {isDone && task.searchResults && task.searchResults.length > 0 && (
          <div className="px-3 pb-3 space-y-1">
            <p className="text-xs text-white/30 uppercase tracking-wider mb-1.5">Sources</p>
            {task.searchResults.slice(0, 3).map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-sky-400/80 hover:text-sky-400 truncate transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  (window as any).tana?.agent?.openUrl?.(r.url);
                }}
              >
                <Globe size={9} className="inline mr-1 mb-0.5 opacity-60" />
                {r.title}
              </a>
            ))}
          </div>
        )}

        {/* ── Running pulse bar ─────────────────────────────────────────────── */}
        {isRunning && (
          <div className="h-0.5 w-full bg-white/5">
            <div
              className="h-full bg-amber-400/60 animate-pulse"
              style={{ width: `${Math.min(95, ((stepCount + 1) / 20) * 100)}%`, transition: 'width 0.4s ease' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentResultCard;
