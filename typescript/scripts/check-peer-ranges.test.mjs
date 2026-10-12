import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PATCHED_NEXT = {
  13: [13, 5, 9],
  14: [14, 2, 25],
  15: [15, 2, 3],
};

const manifest = JSON.parse(
  readFileSync(new URL('../packages/nextjs/package.json', import.meta.url), 'utf8'),
);

function parseCaret(alternative) {
  const match = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(alternative.trim());
  assert.ok(match, `peer range alternative must be a caret range with a full version: ${alternative}`);
  return match.slice(1).map(Number);
}

function isAtLeast(version, minimum) {
  for (let i = 0; i < minimum.length; i += 1) {
    if (version[i] !== minimum[i]) return version[i] > minimum[i];
  }
  return true;
}

test('nextjs peer range excludes versions affected by the middleware bypass', () => {
  const alternatives = manifest.peerDependencies.next.split('||');

  for (const alternative of alternatives) {
    const version = parseCaret(alternative);
    const minimum = PATCHED_NEXT[version[0]];
    assert.ok(minimum, `unexpected next major in peer range: ${alternative}`);
    assert.ok(
      isAtLeast(version, minimum),
      `peer range ${alternative.trim()} admits versions below ${minimum.join('.')}`,
    );
  }
});

test('nextjs dev dependency is a patched release', () => {
  const version = parseCaret(manifest.devDependencies.next);
  assert.ok(isAtLeast(version, PATCHED_NEXT[version[0]]));
});
