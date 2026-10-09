import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parsearDuracionGroq } from './duracionGroq.js';

describe('parsearDuracionGroq', () => {
  const casos = [
    ['2m59.56s', 179_560],
    ['7.66s', 7_660],
    ['250ms', 250],
    ['1h2m3s', 3_723_000],
    ['1m', 60_000],
    ['1m30ms', 60_030], // "m" (minutos) y "ms" (milisegundos) no se confunden
    ['5ms', 5],
    ['30', 30_000], // retry-after en segundos pelados
    ['0.5', 500],
  ];
  for (const [entrada, esperado] of casos) {
    test(`"${entrada}" → ${esperado} ms`, () => assert.equal(parsearDuracionGroq(entrada), esperado));
  }
  for (const basura of [null, undefined, '', '   ', 'pronto', '5x', 'ms']) {
    test(`${JSON.stringify(basura)} → null`, () => assert.equal(parsearDuracionGroq(basura), null));
  }
});
