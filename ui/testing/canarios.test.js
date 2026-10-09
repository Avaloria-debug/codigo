/**
 * CANARIOS: uno por cada módulo de core que hoy reporta por console.warn.
 * Si un módulo cambia cómo reporta (otro canal, otro texto sin prefijo, otro
 * nombre), el panel quedaría mudo sin que nadie se entere: estos tests fallan en su lugar.
 * Disparan el camino de warn REAL de cada módulo, con `console` real.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { instalarCapturaWarn } from './capturaInconsistencias.js';
import { seleccionarVariante } from '../../core/narrador/seleccionarVariante.js';
import { probabilidadBase } from '../../core/narrador/probabilidades.js';
import { resolverAccion } from '../../core/narrador/resolverAccion.js';
import { sustituirPlaceholders } from '../../core/narrador/narrar.js';
import { obtenerDialogoNPCConOrigen } from '../../core/ia/obtenerDialogoNPC.js';
import { generarOpcionesNivel2 } from '../../core/opciones/generarOpcionesNivel2.js';

describe('canarios de console.warn (6 módulos)', () => {
  let h; let warnOriginal; const silencio = [];
  before(() => { warnOriginal = console.warn; console.warn = (...a) => silencio.push(a); h = instalarCapturaWarn({}); });
  after(() => { h.desinstalar(); console.warn = warnOriginal; });
  const disparar = async (fn) => { h.log.limpiar(); await fn(); return h.log.listar().filter((e) => e.canal === 'console.warn'); };
  const exigir = (entradas, origen) => {
    assert.ok(entradas.some((e) => e.origen === origen), `el panel quedó mudo para '${origen}'. Capturado: ${JSON.stringify(entradas.map((e) => [e.origen, e.mensaje]))}`);
  };

  test('seleccionarVariante', async () => exigir(await disparar(() => seleccionarVariante('plantilla_que_no_existe', {})), 'seleccionarVariante'));
  test('probabilidadBase (probabilidades.js)', async () =>
    exigir(await disparar(() => probabilidadBase({ nombre: 'VerboFantasma', tipoResolucion: 'concrecion' }, null)), 'probabilidadBase'));
  test('resolverAccion', async () => exigir(await disparar(() => resolverAccion(
    { nombre: 'Usar', tipoResolucion: 'inmediata', objetoObjetivo: 'objeto_fantasma' }, null, {}, {}, null,
    { ticksTranscurridos: 1 }, new Map(), () => 0.5)), 'resolverAccion'));
  test('sustituirPlaceholders (narrar.js)', async () => exigir(await disparar(() => sustituirPlaceholders('hola {nadie}', {})), 'sustituirPlaceholders'));
  test('obtenerDialogoNPC', async () => exigir(await disparar(() => obtenerDialogoNPCConOrigen(
    { npc: { nombre: 'N' }, estadoEmocionalProyectado: 'neutral', accionResuelta: { resultado: 'exito' }, textoLibreJugador: '' },
    { apiKey: 'k', maxCompletionTokens: 10 }, {} /* registroUso roto a propósito: error de programación */, {})), 'obtenerDialogoNPC'));
  test('generarOpcionesNivel2', async () => exigir(await disparar(() =>
    generarOpcionesNivel2({ nombre: 'VerboFantasma' }, {}, {}, {}, new Map())), 'generarOpcionesNivel2'));
});
