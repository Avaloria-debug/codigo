import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearLogInconsistencias, instalarCapturaWarn, registrarReportes, registrarValidacion, origenDeMensajeWarn } from './capturaInconsistencias.js';

const consolaFalsa = () => { const vistos = []; return { vistos, warn: (...a) => vistos.push(a.join(' ')) }; };

describe('wrapper de console.warn', () => {
  test('NO traga el warn original y lo registra con su origen', () => {
    const c = consolaFalsa(); const h = instalarCapturaWarn({ consola: c });
    c.warn('seleccionarVariante: plantilla no registrada: x');
    assert.deepEqual(c.vistos, ['seleccionarVariante: plantilla no registrada: x']);
    const [e] = h.log.listar();
    assert.equal(e.canal, 'console.warn'); assert.equal(e.origen, 'seleccionarVariante');
  });
  test('idempotente: instalar dos veces no apila wrappers ni duplica entradas', () => {
    const c = consolaFalsa(); const h1 = instalarCapturaWarn({ consola: c }); const envuelto = c.warn;
    const h2 = instalarCapturaWarn({ consola: c, log: crearLogInconsistencias() });
    assert.equal(h1, h2); assert.equal(c.warn, envuelto);
    c.warn('a: b'); assert.equal(h1.log.listar().length, 1); assert.equal(c.vistos.length, 1);
  });
  test('desinstalar restaura el original; reinstalar vuelve a capturar', () => {
    const c = consolaFalsa(); const original = c.warn; const h = instalarCapturaWarn({ consola: c });
    assert.deepEqual(h.desinstalar(), { restaurado: true }); assert.equal(c.warn, original);
    const h2 = instalarCapturaWarn({ consola: c }); c.warn('x: y'); assert.equal(h2.log.listar().length, 1);
  });
  test('si alguien envolvió encima, desinstalar no rompe la cadena: queda en modo paso y deja de loguear', () => {
    const c = consolaFalsa(); const h = instalarCapturaWarn({ consola: c });
    const nuestro = c.warn; const vistosExternos = []; c.warn = (...a) => { vistosExternos.push(a[0]); nuestro(...a); };
    assert.deepEqual(h.desinstalar(), { restaurado: false });
    c.warn('z: w'); assert.equal(h.log.listar().length, 0); assert.equal(c.vistos.length, 1); assert.equal(vistosExternos.length, 1);
  });
  test('un log roto no rompe el warn ni el turno', () => {
    const c = consolaFalsa(); const log = { agregar() { throw new Error('boom'); } };
    instalarCapturaWarn({ consola: c, log }); assert.doesNotThrow(() => c.warn('a: b')); assert.equal(c.vistos.length, 1);
  });
  test('mensaje sin prefijo reconocible -> origen desconocido (visible, no descartado)', () => {
    assert.equal(origenDeMensajeWarn('algo raro sin prefijo'), 'desconocido');
  });
});

describe('canal estructurado', () => {
  test('reportes {origen,mensaje}, strings con origen por defecto, y validación {valido,errores}', () => {
    const log = crearLogInconsistencias();
    registrarReportes(log, [{ origen: 'calcularEstadoEscena', mensaje: 'tipo sin categorizar' }]);
    registrarReportes(log, ['sin transición'], 'procesarAccionResuelta');
    registrarValidacion(log, 'validarEstructura', { valido: false, errores: ['falta id'] });
    registrarValidacion(log, 'validarEstructura', { valido: true, errores: [] });
    assert.deepEqual(log.listar().map((e) => [e.canal, e.origen]), [
      ['estructurado', 'calcularEstadoEscena'], ['estructurado', 'procesarAccionResuelta'], ['estructurado', 'validarEstructura'],
    ]);
  });
  test('tope de entradas y suscripción', () => {
    const log = crearLogInconsistencias({ max: 2 }); const vistos = []; const baja = log.suscribir((e) => vistos.push(e.mensaje));
    for (const m of ['1', '2', '3']) log.agregar({ canal: 'x', origen: 'o', mensaje: m });
    assert.deepEqual(log.listar().map((e) => e.mensaje), ['2', '3']); baja(); log.agregar({ canal: 'x', origen: 'o', mensaje: '4' });
    assert.deepEqual(vistos, ['1', '2', '3']);
  });
});
