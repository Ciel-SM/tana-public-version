// Agentic brain loop for Tana.
// Runs as a separate generateContent loop (NOT inside the Gemini Live session)
// so voice stays real-time while the agent executes multi-step tasks.

import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { AgentTask, AgentStatus, AgentStep } from '../types';
import type { WebSearchResult } from '../electron/agent-tools';

// ── Model ─────────────────────────────────────────────────────────────────────
// gemini-2.0-flash is fast, cheap, and supports function calling.
// Upgrade to 'gemini-2.5-flash-preview-04-17' for heavier reasoning tasks.
const BRAIN_MODEL = 'gemini-2.0-flash';

// ── System Prompt ─────────────────────────────────────────────────────────────

const BRAIN_SYSTEM_PROMPT = `You are Tana's agentic brain. The user has asked you to execute a task on their Mac.

Rules:
- Use tools to complete the task step by step. Do not just describe what to do — actually do it.
- For web searches: use web_search, read the results, and synthesize a helpful answer.
- For opening URLs or websites: use open_url to launch them in the browser.
- For opening apps: use open_app.
- To type text or press keys in the active app: use type_text or press_keys.
- To take a screenshot and see the current screen state: use take_screenshot.
- When the task is complete, provide a concise final answer summarizing what you did and any key information found.
- Do NOT take irreversible actions (deleting files, sending emails) without explicit confirmation in the user's request.
- If a tool returns an error, try an alternative approach once before giving up.
- Keep your reasoning brief. Act, don't narrate.`;

// ── Tool Declarations ─────────────────────────────────────────────────────────

const BRAIN_TOOL_DECLARATIONS = [
  {
    name: 'web_search',
    description: 'Search the web using DuckDuckGo. Returns the top 5 results with titles, URLs, and snippets. Use this to look up information, news, or anything on the internet.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        query: {
          type: 'STRING' as const,
          description: 'The search query.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_url',
    description: 'Open a URL in the user\'s default browser. Use this to navigate to a website, open a link from search results, or pull up any web page.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        url: {
          type: 'STRING' as const,
          description: 'The full URL to open (must start with http:// or https://).',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'open_app',
    description: 'Launch a macOS application by name. Use this to open apps like "Safari", "Mail", "Calendar", "Notes", "Terminal", etc.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        app_name: {
          type: 'STRING' as const,
          description: 'The exact application name as it appears in /Applications, e.g. "Safari", "Mail", "Calendar".',
        },
      },
      required: ['app_name'],
    },
  },
  {
    name: 'get_frontmost_app',
    description: 'Get the name and bundle ID of the currently focused (frontmost) application.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {},
    },
  },
  {
    name: 'type_text',
    description: 'Type text into the currently focused application using keyboard input. The text appears wherever the cursor is.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        text: {
          type: 'STRING' as const,
          description: 'The text to type.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'press_keys',
    description: 'Press a keyboard shortcut in the active application. Supports modifiers: cmd, ctrl, shift, opt/alt. Examples: "return", "escape", "cmd+c", "cmd+shift+t", "cmd+n".',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        keys: {
          type: 'STRING' as const,
          description: 'Key combination string, e.g. "return", "cmd+c", "cmd+shift+t".',
        },
      },
      required: ['keys'],
    },
  },
  {
    name: 'take_screenshot',
    description: 'Capture a screenshot of the current screen to see the UI state. Use this to verify an action worked or to understand what\'s currently on screen.',
    parameters: {
      type: 'OBJECT' as const,
      properties: {},
    },
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

// Content types for the generateContent API
type ContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface ContentMessage {
  role: 'user' | 'model';
  parts: ContentPart[];
}

export interface UseAgentBrainOptions {
  apiKey: string;
  onComplete: (task: AgentTask) => void;
  onError: (error: string, task: AgentTask) => void;
  maxSteps?: number;
}

export interface UseAgentBrainResult {
  status: AgentStatus;
  currentTask: AgentTask | null;
  startTask: (request: string, voiceContext?: string) => Promise<void>;
  cancelTask: () => void;
  dismissTask: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAgentBrain({
  apiKey,
  onComplete,
  onError,
  maxSteps = 20,
}: UseAgentBrainOptions): UseAgentBrainResult {
  const [currentTask, setCurrentTask] = useState<AgentTask | null>(null);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const cancelledRef = useRef(false);

  const updateTask = useCallback((updater: (prev: AgentTask) => AgentTask) => {
    setCurrentTask(prev => prev ? updater(prev) : prev);
  }, []);

  const appendStep = useCallback((task: AgentTask, step: Omit<AgentStep, 'stepIndex' | 'timestamp'>): AgentTask => {
    const newStep: AgentStep = {
      ...step,
      stepIndex: task.steps.length,
      timestamp: Date.now(),
    };
    return { ...task, steps: [...task.steps, newStep] };
  }, []);

  // ── Tool dispatcher ───────────────────────────────────────────────────────
  const dispatchTool = useCallback(async (
    name: string,
    args: Record<string, unknown>,
    pendingScreenshotRef: React.MutableRefObject<string | null>,
  ): Promise<string> => {
    const tana = (window as any).tana;
    if (!tana?.agent) return JSON.stringify({ error: 'Agent tools not available (not in Electron)' });

    switch (name) {
      case 'web_search': {
        const results: WebSearchResult[] = await tana.agent.webSearch(String(args.query ?? ''));
        if (!results.length) return JSON.stringify({ results: [], message: 'No results found.' });
        const formatted = results.map((r: WebSearchResult, i: number) =>
          `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
        ).join('\n\n');
        return formatted;
      }

      case 'open_url': {
        const result = await tana.agent.openUrl(String(args.url ?? ''));
        return result.error
          ? `Error: ${result.error}`
          : `Opened ${args.url} in your browser.`;
      }

      case 'open_app': {
        const result = await tana.agent.openApp(String(args.app_name ?? ''));
        return result.error
          ? `Error: ${result.error}`
          : `Opened ${args.app_name}.`;
      }

      case 'get_frontmost_app': {
        const result = await tana.agent.getFrontmostApp();
        return `Frontmost app: ${result.appName} (${result.bundleId})`;
      }

      case 'type_text': {
        const result = await tana.agent.typeText(String(args.text ?? ''));
        return result.error
          ? `Error: ${result.error}`
          : `Typed: "${args.text}"`;
      }

      case 'press_keys': {
        const result = await tana.agent.pressKeys(String(args.keys ?? ''));
        return result.error
          ? `Error: ${result.error}`
          : `Pressed: ${args.keys}`;
      }

      case 'take_screenshot': {
        const b64: string | null = await tana.captureScreenshotJpeg?.(60) ?? null;
        if (!b64) return 'Screenshot failed.';
        pendingScreenshotRef.current = b64;
        return 'Screenshot captured. See the attached image in the next turn.';
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }, []);

  // ── Main brain loop ───────────────────────────────────────────────────────
  const startTask = useCallback(async (request: string, voiceContext?: string) => {
    if (status === 'running') return;

    cancelledRef.current = false;
    await (window as any).tana?.agent?.resetCancel?.();

    const task: AgentTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userRequest: request,
      startedAt: Date.now(),
      status: 'running',
      steps: [],
    };

    setCurrentTask(task);
    setStatus('running');

    let currentTaskState = task;

    // Build initial message
    const contextPrefix = voiceContext
      ? `[Recent conversation context: ${voiceContext}]\n\n`
      : '';

    const messages: ContentMessage[] = [
      {
        role: 'user',
        parts: [{ text: `${contextPrefix}Task: ${request}` }],
      },
    ];

    const ai = new GoogleGenAI({ apiKey });
    const pendingScreenshotRef = { current: null as string | null };

    try {
      for (let step = 0; step < maxSteps; step++) {
        // Check cancellation
        if (cancelledRef.current) {
          const cancelled = appendStep(currentTaskState, {
            type: 'answer',
            content: 'Task cancelled.',
          });
          cancelled.status = 'cancelled';
          setCurrentTask(cancelled);
          setStatus('cancelled');
          return;
        }

        // Attach pending screenshot as a user-turn inline image (if any)
        if (pendingScreenshotRef.current) {
          const screenshotData = pendingScreenshotRef.current;
          pendingScreenshotRef.current = null;
          // Attach to the last user message or create a new one
          const lastMsg = messages[messages.length - 1];
          if (lastMsg?.role === 'user') {
            lastMsg.parts.push({ inlineData: { mimeType: 'image/jpeg', data: screenshotData } });
          } else {
            messages.push({
              role: 'user',
              parts: [{ inlineData: { mimeType: 'image/jpeg', data: screenshotData } }],
            });
          }
        }

        // Sliding window: keep messages from getting too long
        // Always preserve the first user message (the task)
        if (messages.length > 22) {
          const firstMsg = messages[0];
          // Remove oldest pair (indices 1 and 2, i.e. first model + first user response)
          messages.splice(1, 2);
          messages[0] = firstMsg;
        }

        // Call the brain model
        let response: any;
        // Retry up to 3 times on 429 (RESOURCE_EXHAUSTED) with the server's
        // suggested retryDelay (or exponential backoff if not provided).
        const MAX_RETRIES = 3;
        let lastApiErr: any = null;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            response = await ai.models.generateContent({
              model: BRAIN_MODEL,
              contents: messages as any,
              config: {
                systemInstruction: BRAIN_SYSTEM_PROMPT,
                // Cast to any: TypeScript's union widening of the properties across
                // tool declarations makes the inferred type incompatible with Schema.
                tools: [{ functionDeclarations: BRAIN_TOOL_DECLARATIONS }] as any,
              },
            });
            lastApiErr = null;
            break; // success
          } catch (apiErr: any) {
            lastApiErr = apiErr;
            const msg = String(apiErr?.message ?? apiErr ?? '');
            const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
            if (!is429 || attempt === MAX_RETRIES) break; // not retryable or out of retries

            // Parse retryDelay from error message, e.g. "retryDelay: \"38s\""
            const delayMatch = msg.match(/retryDelay["\s:]+(\d+)s/i);
            const delayMs = delayMatch
              ? Math.min(parseInt(delayMatch[1], 10) * 1000, 60000) // cap at 60s
              : Math.min(5000 * Math.pow(2, attempt), 30000); // 5s, 10s, 20s

            currentTaskState = appendStep(currentTaskState, {
              type: 'answer',
              content: `Rate limit hit. Retrying in ${Math.round(delayMs / 1000)}s… (attempt ${attempt + 1}/${MAX_RETRIES})`,
            });
            setCurrentTask({ ...currentTaskState });
            await new Promise(resolve => setTimeout(resolve, delayMs));

            // Remove the optimistic "retrying" step before next attempt
            currentTaskState = { ...currentTaskState, steps: currentTaskState.steps.slice(0, -1) };
          }
        }
        if (lastApiErr !== null) {
          const errMsg = String(lastApiErr?.message ?? lastApiErr ?? 'API error');
          const userFacing = errMsg.includes('quota') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')
            ? 'Gemini API quota exceeded. Check your usage at aistudio.google.com or wait a few minutes and try again.'
            : `Error: ${errMsg}`;
          const errTask = appendStep(currentTaskState, {
            type: 'answer',
            content: userFacing,
          });
          errTask.status = 'error';
          setCurrentTask(errTask);
          setStatus('error');
          onError(userFacing, errTask);
          return;
        }

        // Extract parts from the response
        const parts: any[] = response?.candidates?.[0]?.content?.parts ?? [];
        const functionCallParts = parts.filter((p: any) => p.functionCall);
        const textParts = parts.filter((p: any) => p.text);

        // Append model turn to messages
        messages.push({ role: 'model', parts: parts as ContentPart[] });

        // ── Case 1: Only text — this is the final answer ──────────────────
        if (functionCallParts.length === 0) {
          const finalText = textParts.map((p: any) => p.text).join('').trim()
            || 'Task complete.';

          currentTaskState = appendStep(currentTaskState, {
            type: 'answer',
            content: finalText,
          });

          // Collect any search results from the last web_search step
          const lastSearch = [...currentTaskState.steps]
            .reverse()
            .find(s => s.type === 'tool_result' && s.toolName === 'web_search');

          currentTaskState = {
            ...currentTaskState,
            status: 'complete',
            finalAnswer: finalText,
          };

          // If last step was a search, parse and attach results
          if (lastSearch?.content) {
            try {
              const parsed = JSON.parse(lastSearch.content);
              if (Array.isArray(parsed?.results)) {
                currentTaskState.searchResults = parsed.results;
              }
            } catch { /* not JSON, that's fine */ }
          }

          setCurrentTask(currentTaskState);
          setStatus('complete');
          onComplete(currentTaskState);
          return;
        }

        // ── Case 2: Function calls — dispatch them in parallel ─────────────
        // Log tool calls as steps
        for (const fc of functionCallParts) {
          const callArgs = fc.functionCall.args ?? {};
          const argPreview = Object.values(callArgs).slice(0, 1).join(', ');
          currentTaskState = appendStep(currentTaskState, {
            type: 'tool_call',
            toolName: fc.functionCall.name,
            content: argPreview ? `${fc.functionCall.name}(${argPreview})` : fc.functionCall.name,
          });
        }
        setCurrentTask({ ...currentTaskState });

        // Dispatch all function calls in parallel
        const toolResults = await Promise.allSettled(
          functionCallParts.map((fc: any) =>
            dispatchTool(fc.functionCall.name, fc.functionCall.args ?? {}, pendingScreenshotRef)
          )
        );

        // Build function response parts and log results as steps
        const functionResponseParts: ContentPart[] = [];

        for (let i = 0; i < functionCallParts.length; i++) {
          const fc = functionCallParts[i];
          const settled = toolResults[i];
          const resultText = settled.status === 'fulfilled'
            ? settled.value
            : `Error: ${String((settled as PromiseRejectedResult).reason)}`;

          // Truncate long results to avoid blowing the context window
          const truncated = resultText.length > 4000
            ? resultText.slice(0, 4000) + '\n[...truncated]'
            : resultText;

          functionResponseParts.push({
            functionResponse: {
              name: fc.functionCall.name,
              response: { result: truncated },
            },
          });

          // Store raw results for web_search (for result card links)
          let resultContent = truncated;
          if (fc.functionCall.name === 'web_search') {
            // Try to also store structured results on the task
            try {
              const results = await (window as any).tana?.agent?.webSearch?.(
                String(fc.functionCall.args?.query ?? '')
              );
              if (Array.isArray(results)) {
                currentTaskState = { ...currentTaskState, searchResults: results };
              }
            } catch { /* non-critical */ }
            resultContent = truncated;
          }

          currentTaskState = appendStep(currentTaskState, {
            type: 'tool_result',
            toolName: fc.functionCall.name,
            content: resultContent,
          });
        }

        setCurrentTask({ ...currentTaskState });

        // Append tool results as a user turn
        messages.push({ role: 'user', parts: functionResponseParts });
      }

      // Hit max steps without a final answer
      const maxStepTask: AgentTask = {
        ...currentTaskState,
        status: 'error',
        finalAnswer: `Reached the step limit (${maxSteps}) without completing the task.`,
      };
      setCurrentTask(maxStepTask);
      setStatus('error');
      onError(`Step limit reached (${maxSteps})`, maxStepTask);

    } catch (err: any) {
      const errMsg = String(err?.message ?? err ?? 'Unknown error');
      const errTask: AgentTask = {
        ...currentTaskState,
        status: 'error',
        finalAnswer: `Error: ${errMsg}`,
      };
      setCurrentTask(errTask);
      setStatus('error');
      onError(errMsg, errTask);
    }
  }, [apiKey, status, maxSteps, appendStep, dispatchTool, onComplete, onError]);

  const cancelTask = useCallback(() => {
    cancelledRef.current = true;
    (window as any).tana?.agent?.cancel?.();
    setStatus('cancelled');
    updateTask(t => ({ ...t, status: 'cancelled' }));
  }, [updateTask]);

  const dismissTask = useCallback(() => {
    setCurrentTask(null);
    setStatus('idle');
    cancelledRef.current = false;
  }, []);

  return { status, currentTask, startTask, cancelTask, dismissTask };
}
