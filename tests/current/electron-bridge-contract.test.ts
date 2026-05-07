/* @vitest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');

describe('current Electron bridge contract', () => {
  test('ships the preload bridge methods used by the renderer today', () => {
    const preloadPath = path.join(repoRoot, 'electron/preload.cjs');
    const preloadSource = fs.readFileSync(preloadPath, 'utf8');

    const expectedMethods = [
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

    for (const method of expectedMethods) {
      expect(preloadSource).toContain(`${method}:`);
    }
  });

  test('packages the compiled Electron entrypoints', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    ) as { build: { files: string[] } };

    expect(packageJson.build.files).toContain('electron/main.js');
    expect(packageJson.build.files).toContain('electron/display-geometry.js');
    expect(packageJson.build.files).toContain('electron/preload.cjs');
  });
});
