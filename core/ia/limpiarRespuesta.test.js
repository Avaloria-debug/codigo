import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarRespuesta } from './limpiarRespuesta.js';

describe('limpiarRespuesta', () => {
  test('vacía, espacios o no-string → null', () => {
    assert.equal(limpiarRespuesta('', 'stop'), null);
    assert.equal(limpiarRespuesta('   \n ', 'stop'), null);
    assert.equal(limpiarRespuesta(null, 'stop'), null);
    assert.equal(limpiarRespuesta(undefined), null);
  });
  test('respuesta normal: trim, sin recorte', () => {
    assert.deepEqual(limpiarRespuesta('  Andate de acá.  ', 'stop'), { texto: 'Andate de acá.', recortado: false });
  });
  test('finish_reason "length": recorta a la última oración completa', () => {
    assert.deepEqual(limpiarRespuesta('No confío en vos. Andate ya. Y si volv', 'length'), {
      texto: 'No confío en vos. Andate ya.',
      recortado: true,
    });
  });
  test('finish_reason "length" y la respuesta ya termina en oración: no marca recorte', () => {
    assert.deepEqual(limpiarRespuesta('Listo.', 'length'), { texto: 'Listo.', recortado: false });
  });
  test('finish_reason "length" sin ninguna marca de fin de oración: se conserva el texto', () => {
    assert.deepEqual(limpiarRespuesta('Bueno, mirá, yo creo que', 'length'), { texto: 'Bueno, mirá, yo creo que', recortado: false });
  });
  test('un "." en medio no recorta si finish_reason es "stop"', () => {
    assert.equal(limpiarRespuesta('Hola. Qué tal', 'stop').texto, 'Hola. Qué tal');
  });
});
