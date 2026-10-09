import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimarTokens, estimarTokensMensajes } from './estimarTokens.js';

test('estimarTokens: chars/3.5 redondeado hacia arriba', () => {
  assert.equal(estimarTokens('x'.repeat(35)), 10);
  assert.equal(estimarTokens('x'.repeat(36)), 11);
});

test('estimarTokens: vacío/null → 0', () => {
  assert.equal(estimarTokens(''), 0);
  assert.equal(estimarTokens(null), 0);
  assert.equal(estimarTokens(undefined), 0);
});

test('estimarTokensMensajes: suma contenidos más overhead fijo por mensaje', () => {
  const total = estimarTokensMensajes([{ content: 'x'.repeat(35) }, { content: 'x'.repeat(70) }]);
  assert.equal(total, 10 + 4 + 20 + 4 + 3);
});
