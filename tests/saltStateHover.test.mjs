import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildStateDocUrl,
  compactDocstring,
  createSignature,
  findSaltStateIdentifier,
} = require('../lib/saltStateHover.js');

test('findSaltStateIdentifier matches a state function before the colon', () => {
  const match = findSaltStateIdentifier('  - watch: file.managed:', 18);

  assert.equal(match.symbol, 'file.managed');
  assert.equal(match.start, 11);
  assert.equal(match.end, 23);
});

test('findSaltStateIdentifier returns null when no state function is present', () => {
  assert.equal(findSaltStateIdentifier('  - source: salt://app/config', 12), null);
});

test('createSignature and buildStateDocUrl format hover metadata', () => {
  assert.equal(createSignature('file.managed', ['name', 'source']), 'file.managed(name, source)');
  assert.equal(
    buildStateDocUrl('file.managed', '3007'),
    'https://docs.saltproject.io/en/3007/ref/states/all/salt.states.file.html',
  );
});

test('compactDocstring normalizes line endings and blank lines', () => {
  assert.equal(compactDocstring('Line one.\r\n\r\n\r\nLine two.  '), 'Line one.\n\nLine two.');
});