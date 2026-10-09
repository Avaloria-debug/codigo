import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generarDialogoMock } from './dialogoMock.js';

const npc = { nombre: 'Genérico el Hostil' };

describe('generarDialogoMock', () => {
  test('caso desglosado del doc (sección 7): hostil + fallo', () => {
    assert.equal(
      generarDialogoMock(npc, 'hostil', { resultado: 'fallo' }, 'Bajá el arma, no quiero pelear.'),
      '[MOCK] Genérico el Hostil (hostil, resultado: fallo): No tengo nada que decirte.'
    );
  });
  test('resultado distinto de fallo: agrega el eco de lo dicho por el jugador', () => {
    assert.equal(
      generarDialogoMock(npc, 'alegre', { resultado: 'exito' }, 'Buen día'),
      "[MOCK] Genérico el Hostil (alegre, resultado: exito): ¡Qué bueno verte! — respecto a 'Buen día'"
    );
  });
  test('siempre lleva el prefijo [MOCK], para los 6 estados', () => {
    for (const estado of ['hostil', 'molesto', 'neutral', 'alegre', 'temeroso', 'alarmado']) {
      assert.match(generarDialogoMock(npc, estado, { resultado: 'neutral' }, 'x'), /^\[MOCK\] /);
    }
  });
  test('cada estado tiene su frase propia', () => {
    const frases = new Set(['hostil', 'molesto', 'neutral', 'alegre', 'temeroso', 'alarmado'].map((e) => generarDialogoMock(npc, e, { resultado: 'fallo' }, '')));
    assert.equal(frases.size, 6);
  });
  test('estado desconocido/undefined: "..." y se ve en la cabecera (pista de bug aguas arriba)', () => {
    const s = generarDialogoMock(npc, undefined, { resultado: 'fallo' }, '');
    assert.match(s, /\(undefined, resultado: fallo\): \.\.\./);
  });
  test('el eco del texto del jugador va higienizado (sin saltos ni comillas dobles)', () => {
    assert.match(generarDialogoMock(npc, 'neutral', { resultado: 'exito' }, 'a\n"b"'), /respecto a 'a 'b''$/);
  });
});
