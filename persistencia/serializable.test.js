import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { verificarSerializable } from './serializable.js';

describe('verificarSerializable', () => {
  test('datos JSON normales, anidados, con null: sin errores', () => {
    assert.deepEqual(verificarSerializable({ a: 1, b: [1, 'x', null, { c: true }], d: null }), []);
  });

  test('propiedad undefined se ignora (el round-trip la descarta); undefined en array se reporta', () => {
    assert.deepEqual(verificarSerializable({ a: undefined, b: 1 }), []);
    const e = verificarSerializable({ arr: [1, undefined] });
    assert.equal(e.length, 1);
    assert.match(e[0], /\$\.arr\[1\]/);
  });

  test('NaN, Infinity, función, Map, Set, Date, clase propia: se reportan con su ruta', () => {
    class Foo {}
    const e = verificarSerializable({ a: NaN, b: { c: Infinity }, d: () => 1, e: new Map(), f: new Set(), g: new Date(), h: new Foo() });
    assert.equal(e.length, 7);
    assert.ok(e.some((x) => x.includes('$.a')));
    assert.ok(e.some((x) => x.includes('$.b.c')));
    assert.ok(e.some((x) => x.includes('Map')));
  });

  test('referencia circular: se reporta y no se cuelga', () => {
    const a = { nombre: 'a' };
    a.yo = a;
    const e = verificarSerializable(a);
    assert.equal(e.length, 1);
    assert.match(e[0], /circular/);
  });

  test('el mismo objeto referenciado dos veces (no circular) NO es un error', () => {
    const compartido = { x: 1 };
    assert.deepEqual(verificarSerializable({ a: compartido, b: compartido }), []);
  });
});
