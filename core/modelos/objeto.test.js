import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearObjeto } from './objeto.js';
import { validarEstructura } from '../validacion/validarEstructura.js';

function cargarFixture(nombre) {
  return JSON.parse(readFileSync(new URL(`../../data/fixtures/${nombre}.json`, import.meta.url)));
}

describe('crearObjeto (Fase 3, esquema definido en 0.1, integrado a Fase 0)', () => {
  test('aplica default de utilizableComo vacío', () => {
    const obj = crearObjeto({ id: 'objeto_x', nombre: 'X', tipo: 'herramienta' });
    assert.deepEqual(obj.utilizableComo, []);
  });

  test('no inventa id/nombre/tipo si se omiten (quedan undefined para validarEstructura)', () => {
    const obj = crearObjeto({});
    assert.equal(obj.id, undefined);
    assert.equal(obj.nombre, undefined);
    assert.equal(obj.tipo, undefined);
  });

  test('aplica default de confiabilidad "estandar" (Fase 5, mismo criterio que utilizableComo)', () => {
    const obj = crearObjeto({ id: 'objeto_x', nombre: 'X', tipo: 'herramienta' });
    assert.equal(obj.confiabilidad, 'estandar');
  });

  test('respeta confiabilidad explícita si se especifica', () => {
    const obj = crearObjeto({ id: 'objeto_x', nombre: 'X', tipo: 'arma', confiabilidad: 'resistente' });
    assert.equal(obj.confiabilidad, 'resistente');
  });
});

describe('confiabilidad — validación estructural (Fase 5, aditivo, Fase 0 sección 3.8)', () => {
  test('objeto sin confiabilidad (construido a mano, no vía crearObjeto) sigue siendo válido — retrocompatibilidad', () => {
    const obj = { id: 'objeto_x', nombre: 'X', tipo: 'arma', utilizableComo: [] };
    assert.equal(validarEstructura('Objeto', obj).valido, true);
  });

  for (const valor of ['fragil', 'estandar', 'resistente']) {
    test(`confiabilidad: "${valor}" es válida`, () => {
      const obj = crearObjeto({ id: 'objeto_x', nombre: 'X', tipo: 'arma', confiabilidad: valor });
      assert.equal(validarEstructura('Objeto', obj).valido, true);
    });
  }

  test('confiabilidad fuera del enum cerrado es error estructural', () => {
    const obj = { id: 'objeto_x', nombre: 'X', tipo: 'arma', utilizableComo: [], confiabilidad: 'indestructible' };
    const resultado = validarEstructura('Objeto', obj);
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((e) => e.includes('confiabilidad')));
  });
});

describe('validarEstructura("Objeto", ...) — dispatch aditivo sumado en Fase 3', () => {
  test('Objeto completo y válido pasa sin errores', () => {
    const obj = crearObjeto({ id: 'objeto_daga', nombre: 'Daga', tipo: 'arma', utilizableComo: ['atacar'] });
    const resultado = validarEstructura('Objeto', obj);
    assert.deepEqual(resultado, { valido: true, errores: [] });
  });

  test('utilizableComo vacío es válido (objeto puramente narrativo)', () => {
    const obj = crearObjeto({ id: 'objeto_fuente', nombre: 'Fuente', tipo: 'objeto_narrativo' });
    assert.equal(validarEstructura('Objeto', obj).valido, true);
  });

  test('falta de id es error estructural', () => {
    const obj = crearObjeto({ nombre: 'X', tipo: 'arma' });
    const resultado = validarEstructura('Objeto', obj);
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((e) => e.includes("'id'")));
  });

  test('utilizableComo con elemento no-string es error estructural', () => {
    const obj = { id: 'objeto_x', nombre: 'X', tipo: 'arma', utilizableComo: ['atacar', 123] };
    assert.equal(validarEstructura('Objeto', obj).valido, false);
  });

  test('utilizableComo faltante es error estructural (no es opcional, sólo puede ser vacío)', () => {
    const obj = { id: 'objeto_x', nombre: 'X', tipo: 'arma' };
    assert.equal(validarEstructura('Objeto', obj).valido, false);
  });

  test('campo desconocido es error — mismo criterio estricto que los otros 6 tipos', () => {
    const obj = { id: 'objeto_x', nombre: 'X', tipo: 'arma', utilizableComo: [], campoInventado: true };
    const resultado = validarEstructura('Objeto', obj);
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some((e) => e.includes('campoInventado')));
  });

  test('"Objeto" ya no cae en el catch-all de tipo desconocido de validarEstructura', () => {
    const resultado = validarEstructura('Objeto', crearObjeto({ id: 'x', nombre: 'x', tipo: 'x' }));
    assert.ok(!resultado.errores.some((e) => e.includes('Tipo desconocido')));
  });
});

describe('data/fixtures/objetos.json — completa los 3 IDs colgantes del fixture compartido', () => {
  const objetos = cargarFixture('objetos');

  test('tiene exactamente 3 objetos', () => {
    assert.equal(objetos.length, 3);
  });

  test('cubre los 3 IDs que estaban colgantes (herrería, inventario del jugador, plaza)', () => {
    const ids = objetos.map((o) => o.id);
    assert.ok(ids.includes('objeto_espada_rota'));
    assert.ok(ids.includes('objeto_antorcha'));
    assert.ok(ids.includes('objeto_fuente_publica'));
  });

  test('los 3 pasan validarEstructura', () => {
    objetos.forEach((o) => {
      const resultado = validarEstructura('Objeto', o);
      assert.equal(resultado.valido, true, `${o.id}: ${resultado.errores.join('; ')}`);
    });
  });

  test('la espada rota no es utilizable (coherente con estar rota)', () => {
    const espada = objetos.find((o) => o.id === 'objeto_espada_rota');
    assert.deepEqual(espada.utilizableComo, []);
  });
});
