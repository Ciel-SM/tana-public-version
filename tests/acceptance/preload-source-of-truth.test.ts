/* @vitest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');

describe('acceptance: preload bridge source of truth', () => {
  test('builds the shipped preload bridge from the TypeScript source', () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'tsconfig.electron.json'), 'utf8')
    ) as { include?: string[]; exclude?: string[] };
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };
    const preloadSource = fs.readFileSync(path.join(repoRoot, 'electron/preload.ts'), 'utf8');
    const compiledPreload = fs.readFileSync(path.join(repoRoot, 'electron/preload.cjs'), 'utf8');

    expect(tsconfig.include).toContain('electron/preload.ts');
    expect(tsconfig.exclude ?? []).not.toContain('electron/preload.ts');
    expect(packageJson.scripts?.['build:electron:preload']).toContain('electron/build-preload.mjs');
    expect(packageJson.scripts?.['build:electron']).toContain('build:electron:preload');
    expect(packageJson.scripts?.['dev:electron']).toContain('build:electron:preload');

    const requiredBridgeMethods = [
      'captureScreenshot',
      'captureScreenshotJpeg',
      'captureRegion',
      'getDesktopSources',
      'onGlobalEscape',
      'setAlwaysOnTop',
      'setIgnoreMouseEvents',
      'requestMicPermission',
      'relaunch',
      'isElectron',
    ];

    for (const method of requiredBridgeMethods) {
      expect(preloadSource).toContain(`${method}:`);
      expect(compiledPreload).toContain(`${method}:`);
    }

    expect(compiledPreload).toContain('Generated from electron/preload.ts');
  });
});
