import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { seleccionarVariante } from './seleccionarVariante.js';

const REGISTRO = {
  con_tres: ['uno', 'dos', 'tres'],
  con_una: ['única'],
};

describe('seleccionarVariante — memoria anti-repetición (doc técnico 3.3)', () => {
  test('nunca repite la misma variante dos veces seguidas, con 10 selecciones consecutivas', () => {
    const memoria = {};
    let anterior = null;
    for (let i = 0; i < 10; i++) {
      const variante = seleccionarVariante('con_tres', REGISTRO, memoria);
      if (i > 0) assert.notEqual(variante, anterior);
      anterior = variante;
    }
  });

  test('con generadorAleatorio determinista, la secuencia de elegidos es exacta y reproducible', () => {
    // candidatos se achica en cada llamada (3 -> 2 -> 1) a medida que la
    // memoria descarta índices recientes; estos valores de generador,
    // escalados contra ese tamaño decreciente, tienen que dar
    // exactamente 'uno' -> 'tres' -> 'dos'.
    const secuencia = [0, 0.9, 0.1];
    let i = 0;
    const gen = () => secuencia[i++];

    const memoria = {};
    assert.equal(seleccionarVariante('con_tres', REGISTRO, memoria, 2, gen), 'uno');
    assert.equal(seleccionarVariante('con_tres', REGISTRO, memoria, 2, gen), 'tres');
    assert.equal(seleccionarVariante('con_tres', REGISTRO, memoria, 2, gen), 'dos');

    // Repetido desde cero con la misma secuencia: mismo resultado exacto.
    i = 0;
    const memoriaReplay = {};
    assert.equal(seleccionarVariante('con_tres', REGISTRO, memoriaReplay, 2, gen), 'uno');
    assert.equal(seleccionarVariante('con_tres', REGISTRO, memoriaReplay, 2, gen), 'tres');
    assert.equal(seleccionarVariante('con_tres', REGISTRO, memoriaReplay, 2, gen), 'dos');
  });

  test('con K=2 y 3 variantes, la tercera selección puede repetir la primera pero no la segunda', () => {
    const memoria = {};
    const primera = seleccionarVariante('con_tres', REGISTRO, memoria, 2, () => 0);
    const segunda = seleccionarVariante('con_tres', REGISTRO, memoria, 2, () => 0);
    assert.notEqual(primera, segunda);
    // Tercera: candidatos = las 3 menos [idx(primera), idx(segunda)] = sólo la tercera variante.
    const tercera = seleccionarVariante('con_tres', REGISTRO, memoria, 2, () => 0);
    assert.notEqual(tercera, primera);
    assert.notEqual(tercera, segunda);
  });

  test('plantilla con exactamente 1 variante: se repite siempre, sin romper (caso límite, sección 5)', () => {
    const memoria = {};
    const a = seleccionarVariante('con_una', REGISTRO, memoria);
    const b = seleccionarVariante('con_una', REGISTRO, memoria);
    const c = seleccionarVariante('con_una', REGISTRO, memoria);
    assert.equal(a, 'única');
    assert.equal(b, 'única');
    assert.equal(c, 'única');
  });

  test('plantilla no registrada: reporta y devuelve el fallback genérico, no rompe', () => {
    const original = console.warn;
    let avisado = false;
    console.warn = () => {
      avisado = true;
    };
    try {
      const resultado = seleccionarVariante('no_existe', REGISTRO, {});
      assert.equal(resultado, 'Algo sucede.');
      assert.equal(avisado, true);
    } finally {
      console.warn = original;
    }
  });

  test('memorias distintas no interfieren entre sí (aislamiento por partida/test)', () => {
    const memoriaX = {};
    const memoriaY = {};
    seleccionarVariante('con_tres', REGISTRO, memoriaX, 2, () => 0);
    // memoriaY sigue vacía — la siguiente selección en Y puede repetir
    // el mismo índice que ya se usó en X sin ningún problema.
    assert.deepEqual(memoriaY, {});
  });
});
