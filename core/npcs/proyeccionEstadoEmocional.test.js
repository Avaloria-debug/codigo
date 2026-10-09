import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { proyectarEstadoEmocional, clampTemor, clampDisposicion } from './proyeccionEstadoEmocional.js';

describe('proyectarEstadoEmocional — tabla de prioridad (doc técnico Fase 4, sección 2)', () => {
  test('nivelTemor 2 → alarmado, sin importar la disposición', () => {
    assert.equal(proyectarEstadoEmocional(2, -2), 'alarmado');
    assert.equal(proyectarEstadoEmocional(2, 0), 'alarmado');
    assert.equal(proyectarEstadoEmocional(2, 1), 'alarmado');
  });

  test('nivelDisposicion -2 → hostil (con temor en 0)', () => {
    assert.equal(proyectarEstadoEmocional(0, -2), 'hostil');
  });

  test('hostil (prioridad 2) le gana a temeroso (prioridad 3) si ambas condiciones se cumplen', () => {
    // temor=1 normalmente sería "temeroso", pero si disposicion=-2 a la
    // vez, hostil tiene mayor prioridad y gana primero.
    assert.equal(proyectarEstadoEmocional(1, -2), 'hostil');
  });

  test('nivelTemor 1 (sin hostilidad) → temeroso', () => {
    assert.equal(proyectarEstadoEmocional(1, 0), 'temeroso');
    assert.equal(proyectarEstadoEmocional(1, 1), 'temeroso');
  });

  test('nivelDisposicion -1 (sin temor) → molesto', () => {
    assert.equal(proyectarEstadoEmocional(0, -1), 'molesto');
  });

  test('nivelDisposicion 1 (sin temor) → alegre', () => {
    assert.equal(proyectarEstadoEmocional(0, 1), 'alegre');
  });

  test('ambos ejes en su punto neutro → neutral', () => {
    assert.equal(proyectarEstadoEmocional(0, 0), 'neutral');
  });

  test('caso destacado del criterio de "hecho": temor=2 + disposicion=1 → alarmado, y al bajar temor a 0 vuelve a alegre sin perder la disposición', () => {
    assert.equal(proyectarEstadoEmocional(2, 1), 'alarmado');
    // Baja el temor en un paso posterior (misma disposición, nunca se tocó).
    assert.equal(proyectarEstadoEmocional(0, 1), 'alegre');
  });
});

describe('clampTemor / clampDisposicion', () => {
  test('clampTemor satura a [0, 2]', () => {
    assert.equal(clampTemor(-3), 0);
    assert.equal(clampTemor(0), 0);
    assert.equal(clampTemor(2), 2);
    assert.equal(clampTemor(5), 2);
  });

  test('clampDisposicion satura a [-2, 1]', () => {
    assert.equal(clampDisposicion(-9), -2);
    assert.equal(clampDisposicion(-2), -2);
    assert.equal(clampDisposicion(1), 1);
    assert.equal(clampDisposicion(9), 1);
  });
});
