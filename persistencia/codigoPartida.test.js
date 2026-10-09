import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generarCodigoPartida, esCodigoPartidaValido, normalizarCodigoPartida } from './codigoPartida.js';
import { ALFABETO_CODIGO_PARTIDA } from './constantes.js';

describe('codigoPartida', () => {
  test('el alfabeto no tiene símbolos ambiguos (0, O, 1, I, L) ni repetidos', () => {
    for (const c of '0O1IL') assert.ok(!ALFABETO_CODIGO_PARTIDA.includes(c), `no debe incluir ${c}`);
    assert.equal(new Set(ALFABETO_CODIGO_PARTIDA).size, ALFABETO_CODIGO_PARTIDA.length);
    assert.equal(ALFABETO_CODIGO_PARTIDA.length, 31);
  });

  test('genera 6 caracteres válidos, y es determinista con generador inyectado', () => {
    assert.equal(generarCodigoPartida(() => 0), '222222');
    assert.equal(generarCodigoPartida(() => 0.999999), 'ZZZZZZ');
    for (let i = 0; i < 200; i += 1) assert.ok(esCodigoPartidaValido(generarCodigoPartida()));
  });

  test('el generador por defecto no repite en 500 códigos (uso de crypto)', () => {
    const codigos = new Set(Array.from({ length: 500 }, () => generarCodigoPartida()));
    assert.equal(codigos.size, 500);
  });

  test('esCodigoPartidaValido rechaza largo, alfabeto, minúsculas, tipos y caracteres de path', () => {
    for (const malo of ['', 'ABC', 'ABCDEFG', 'K7M2X0', 'K7M2XL', 'k7m2xp', 'K7M2X/', '../abc', null, undefined, 123456]) {
      assert.equal(esCodigoPartidaValido(malo), false, String(malo));
    }
    assert.equal(esCodigoPartidaValido('K7M2XP'), true);
  });

  test('normalizarCodigoPartida recorta y pasa a mayúsculas; no-strings dan vacío', () => {
    assert.equal(normalizarCodigoPartida('  k7m2xp '), 'K7M2XP');
    assert.equal(normalizarCodigoPartida(null), '');
  });
});
