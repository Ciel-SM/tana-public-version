// Agent tools for Tana's agentic brain loop.
// All functions run in the Electron main process and are exposed via IPC.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { net } from 'electron';

const execFileAsync = promisify(execFile);

// ── AppleScript Safety ─────────────────────────────────────────────────────
// Block patterns that could be used to escalate beyond intended scope.
// Note: the entitlements.mac.plist already grants com.apple.systemevents access.
const APPLESCRIPT_BLOCKLIST = [
  'do shell script',
];

// ── Shell Safety ───────────────────────────────────────────────────────────
const SHELL_BLOCKLIST = [
  'rm -rf /',
  'sudo rm',
  'mkfs',
  ':(){:|:&};:',   // fork bomb
];

// ─────────────────────────────────────────────────────────────────────────────
// AppleScript runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runAppleScript(
  script: string,
): Promise<{ output: string; error: string | null }> {
  for (const blocked of APPLESCRIPT_BLOCKLIST) {
    if (script.toLowerCase().includes(blocked.toLowerCase())) {
      return { output: '', error: `Blocked: script contains prohibited pattern "${blocked}"` };
    }
  }
  try {
    const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], {
      timeout: 10_000,
    });
    return { output: stdout.trim(), error: null };
  } catch (err: any) {
    return { output: '', error: String(err?.stderr ?? err?.message ?? 'AppleScript failed') };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Open a URL in the user's default browser
// ─────────────────────────────────────────────────────────────────────────────

export async function openUrl(
  url: string,
): Promise<{ success: boolean; error: string | null }> {
  // Validate protocol
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { success: false, error: 'Only http/https URLs are supported.' };
    }
  } catch {
    return { success: false, error: `Invalid URL: ${url}` };
  }

  const escaped = url.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const result = await runAppleScript(`open location "${escaped}"`);
  return { success: result.error === null, error: result.error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Get the frontmost (active) application
// ─────────────────────────────────────────────────────────────────────────────

export async function getFrontmostApp(): Promise<{ appName: string; bundleId: string }> {
  const script = `
    tell application "System Events"
      set frontApp to first application process whose frontmost is true
      set appName to name of frontApp
      set bId to bundle identifier of frontApp
      return appName & "|" & bId
    end tell
  `;
  const result = await runAppleScript(script);
  if (result.error || !result.output) return { appName: 'Unknown', bundleId: '' };
  const [appName = 'Unknown', bundleId = ''] = result.output.split('|');
  return { appName: appName.trim(), bundleId: bundleId.trim() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Launch an application by name
// ─────────────────────────────────────────────────────────────────────────────

export async function openApp(
  appName: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    await execFileAsync('open', ['-a', appName], { timeout: 10_000 });
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: String(err?.stderr ?? err?.message ?? `Failed to open ${appName}`) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type text into the focused application
// ─────────────────────────────────────────────────────────────────────────────

export async function typeText(
  text: string,
): Promise<{ success: boolean; error: string | null }> {
  // Escape special chars for AppleScript string literal
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `
    tell application "System Events"
      keystroke "${escaped}"
    end tell
  `;
  const result = await runAppleScript(script);
  return { success: result.error === null, error: result.error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Press a keyboard shortcut (e.g. "cmd+shift+t", "return", "escape")
// ─────────────────────────────────────────────────────────────────────────────

export async function pressKeys(
  keys: string,
): Promise<{ success: boolean; error: string | null }> {
  const parts = keys.toLowerCase().split('+').map(p => p.trim());
  const modifiers: string[] = [];
  let keyName = '';

  for (const part of parts) {
    if (['cmd', 'command'].includes(part)) { modifiers.push('command down'); continue; }
    if (['ctrl', 'control'].includes(part)) { modifiers.push('control down'); continue; }
    if (part === 'shift') { modifiers.push('shift down'); continue; }
    if (['opt', 'option', 'alt'].includes(part)) { modifiers.push('option down'); continue; }
    keyName = part;
  }

  if (!keyName) return { success: false, error: 'No key specified.' };

  const usingClause = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';
  const script = `
    tell application "System Events"
      keystroke "${keyName}"${usingClause}
    end tell
  `;
  const result = await runAppleScript(script);
  return { success: result.error === null, error: result.error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell execution (gated — only available when user enables "Shell Access")
// ─────────────────────────────────────────────────────────────────────────────

export async function shellExec(
  command: string,
  timeoutMs = 15_000,
): Promise<{ stdout: string; stderr: string; exitCode: number; error: string | null }> {
  for (const blocked of SHELL_BLOCKLIST) {
    if (command.includes(blocked)) {
      return { stdout: '', stderr: '', exitCode: 1, error: `Blocked: command contains prohibited pattern "${blocked}"` };
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', command], {
      timeout: timeoutMs,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0, error: null };
  } catch (err: any) {
    return {
      stdout: '',
      stderr: String(err?.stderr ?? ''),
      exitCode: typeof err?.code === 'number' ? err.code : 1,
      error: String(err?.message ?? 'Shell command failed'),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Web search via DuckDuckGo HTML endpoint
// ─────────────────────────────────────────────────────────────────────────────

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(query: string): Promise<WebSearchResult[]> {
  const encoded = encodeURIComponent(query);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;

  try {
    const response = await net.fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) return [];

    const html = await response.text();
    const results: WebSearchResult[] = [];

    // Parse DuckDuckGo HTML results.
    // Each result has: <a class="result__a" href="...">title</a>
    // and a nearby <a class="result__snippet">snippet</a>
    const blockPattern = /<div class="result[^"]*web-result[^"]*"([\s\S]*?)(?=<div class="result[^"]*web-result|<div id="links_wrapper")/g;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = blockPattern.exec(html)) !== null && results.length < 5) {
      const block = blockMatch[1];

      const titleMatch = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      const snippetMatch = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block);

      if (!titleMatch) continue;

      const rawUrl = titleMatch[1];
      const titleHtml = titleMatch[2];
      const snippetHtml = snippetMatch?.[1] ?? '';

      // Strip HTML tags and decode entities
      const stripHtml = (s: string) =>
        s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();

      const title = stripHtml(titleHtml);
      const snippet = stripHtml(snippetHtml);

      // DDG encodes the real URL in ?uddg= param
      let finalUrl = rawUrl;
      try {
        const u = new URL(rawUrl, 'https://duckduckgo.com');
        const uddg = u.searchParams.get('uddg');
        if (uddg) finalUrl = decodeURIComponent(uddg);
      } catch { /* use rawUrl as-is */ }

      if (title) {
        results.push({ title, url: finalUrl, snippet });
      }
    }

    return results;
  } catch (err) {
    console.error('[AgentTools] webSearch failed:', err);
    return [];
  }
}
