import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { categoriaDeRelacion, clampRelacion, moderarDelta } from './categoriasRelacion.js';

describe('categoriaDeRelacion — doc técnico Fase 4, sección 3', () => {
  test('bordes exactos de cada categoría', () => {
    assert.equal(categoriaDeRelacion(-100), 'Hostil');
    assert.equal(categoriaDeRelacion(-60), 'Hostil');
    assert.equal(categoriaDeRelacion(-59), 'Desconfiado');
    assert.equal(categoriaDeRelacion(-20), 'Desconfiado');
    assert.equal(categoriaDeRelacion(-19), 'Neutral');
    assert.equal(categoriaDeRelacion(19), 'Neutral');
    assert.equal(categoriaDeRelacion(20), 'Cordial');
    assert.equal(categoriaDeRelacion(59), 'Cordial');
    assert.equal(categoriaDeRelacion(60), 'Aliado');
    assert.equal(categoriaDeRelacion(100), 'Aliado');
  });

  test('0 (default de un NPC nuevo) es Neutral', () => {
    assert.equal(categoriaDeRelacion(0), 'Neutral');
  });

  test('valores fuera de rango saturan a la categoría del extremo más cercano', () => {
    assert.equal(categoriaDeRelacion(-150), 'Hostil');
    assert.equal(categoriaDeRelacion(150), 'Aliado');
  });
});

describe('clampRelacion', () => {
  test('satura a [-100, 100]', () => {
    assert.equal(clampRelacion(-135), -100);
    assert.equal(clampRelacion(-100), -100);
    assert.equal(clampRelacion(100), 100);
    assert.equal(clampRelacion(115), 100);
    assert.equal(clampRelacion(0), 0);
  });
});

describe('moderarDelta — doc técnico Fase 4, sección 4.1 (última nota)', () => {
  test('delta positivo se reduce a la mitad si el valor actual ya está en categoría Aliado', () => {
    assert.equal(moderarDelta(15, 70), 7.5);
  });

  test('delta negativo se reduce a la mitad si el valor actual ya está en categoría Hostil', () => {
    assert.equal(moderarDelta(-40, -70), -20);
  });

  test('delta positivo en categoría Hostil NO se modera (la moderación es direccional por categoría)', () => {
    assert.equal(moderarDelta(15, -70), 15);
  });

  test('delta negativo en categoría Aliado NO se modera', () => {
    assert.equal(moderarDelta(-10, 70), -10);
  });

  test('en categorías intermedias (Desconfiado, Neutral, Cordial) nunca se modera', () => {
    assert.equal(moderarDelta(15, 0), 15);
    assert.equal(moderarDelta(-15, 0), -15);
    assert.equal(moderarDelta(15, 40), 15);
    assert.equal(moderarDelta(-15, -40), -15);
  });

  test('exactamente en el borde de Aliado (60) ya modera', () => {
    assert.equal(moderarDelta(10, 60), 5);
  });

  test('justo debajo del borde de Aliado (59, Cordial) todavía no modera', () => {
    assert.equal(moderarDelta(10, 59), 10);
  });
});
