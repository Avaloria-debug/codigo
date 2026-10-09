import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avanzarTicks } from './avanzarTicks.js';

function estadoMundoFixture() {
  return JSON.parse(readFileSync(new URL('../data/fixtures/estadoDelMundo.json', import.meta.url)));
}

describe('avanzarTicks', () => {
  test('avanza ticksTranscurridos y horaActual en 1 con el default', () => {
    const estado = estadoMundoFixture(); // horaActual:14, diaActual:3, ticksTranscurridos:72
    avanzarTicks(estado);
    assert.equal(estado.ticksTranscurridos, 73);
    assert.equal(estado.horaActual, 15);
    assert.equal(estado.diaActual, 3);
  });

  test('cruza la medianoche: incrementa diaActual y resetea horaActual (wrap)', () => {
    const estado = estadoMundoFixture(); // hora 14
    avanzarTicks(estado, 10); // 14 + 10 = 24 -> hora 0, día +1
    assert.equal(estado.horaActual, 0);
    assert.equal(estado.diaActual, 4);
    assert.equal(estado.ticksTranscurridos, 82);
  });

  test('salto grande de una sola vez (ej. dormir 30 horas) da el resultado correcto sin iterar', () => {
    const estado = estadoMundoFixture(); // hora 14, día 3
    avanzarTicks(estado, 34); // 14 + 34 = 48 -> +2 días, hora 0
    assert.equal(estado.horaActual, 0);
    assert.equal(estado.diaActual, 5);
    assert.equal(estado.ticksTranscurridos, 106);
  });

  test('dos llamadas sucesivas de 1 equivalen a una sola llamada de 2 (no hay estado oculto)', () => {
    const a = estadoMundoFixture();
    avanzarTicks(a, 1);
    avanzarTicks(a, 1);

    const b = estadoMundoFixture();
    avanzarTicks(b, 2);

    assert.deepEqual(a, b);
  });

  test('devuelve el mismo objeto mutado (permite encadenar)', () => {
    const estado = estadoMundoFixture();
    const resultado = avanzarTicks(estado, 1);
    assert.equal(resultado, estado);
  });

  test('rechaza cantidadTicks 0, negativa o no entera', () => {
    for (const invalida of [0, -1, 1.5, NaN]) {
      assert.throws(() => avanzarTicks(estadoMundoFixture(), invalida));
    }
  });
});
