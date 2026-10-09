import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarReferencias } from './validarReferencias.js';

function datasetDeJuguete() {
  return {
    jugador: { id: 'j1', ubicacionActual: 'escena_a' },
    npcs: [{ id: 'npc_a', ubicacionActual: 'escena_a', conocimientos: [] }],
    escenas: [
      { id: 'escena_a', salidas: [{ etiqueta: 'ir a b', escenaDestinoId: 'escena_b' }], npcsPresentes: ['npc_a'], eventosActivos: ['evento_a'] },
      { id: 'escena_b', salidas: [], npcsPresentes: [], eventosActivos: [] },
    ],
    eventos: [{ id: 'evento_a', escenaId: 'escena_a' }],
    sucesos: [{ id: 'suceso_a', alcance: 'escena', escenaId: 'escena_a' }],
    estadoDelMundo: {},
  };
}

test('NPC con ubicacionActual válida pasa', () => {
  const dataset = datasetDeJuguete();
  const r = validarReferencias('NPC', dataset.npcs[0], dataset);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('NPC con ubicacionActual inexistente falla', () => {
  const dataset = datasetDeJuguete();
  const npc = { id: 'npc_x', ubicacionActual: 'escena_fantasma', conocimientos: [] };
  const r = validarReferencias('NPC', npc, dataset);
  assert.equal(r.valido, false);
});

test('NPC con conocimiento requiereEvento apuntando a evento inexistente falla', () => {
  const dataset = datasetDeJuguete();
  const npc = {
    id: 'npc_x',
    ubicacionActual: null,
    conocimientos: [{ id: 'c1', nivelAcceso: 'requiereEvento', eventoDisparadorId: 'evento_fantasma' }],
  };
  const r = validarReferencias('NPC', npc, dataset);
  assert.equal(r.valido, false);
});

test('Escena con salida a escena inexistente falla', () => {
  const dataset = datasetDeJuguete();
  const escena = { id: 'escena_x', salidas: [{ etiqueta: 'ir', escenaDestinoId: 'escena_fantasma' }], npcsPresentes: [], eventosActivos: [] };
  const r = validarReferencias('Escena', escena, dataset);
  assert.equal(r.valido, false);
});

// Inconsistencia armada a propósito, como pide el criterio de "hecho"
// (sección 7): un NPC listado en npcsPresentes de una escena que NO
// coincide con su propio ubicacionActual.
test('Escena con npcsPresentes inconsistente con ubicacionActual del NPC falla', () => {
  const dataset = datasetDeJuguete();
  // npc_a dice estar en escena_a, pero escena_b lo lista como presente.
  const escenaB = { id: 'escena_b', salidas: [], npcsPresentes: ['npc_a'], eventosActivos: [] };
  const r = validarReferencias('Escena', escenaB, dataset);
  assert.equal(r.valido, false);
  assert.ok(r.errores.some((e) => e.includes('inconsistente')));
});

test('Evento con escenaId inexistente falla', () => {
  const dataset = datasetDeJuguete();
  const evento = { id: 'evento_x', escenaId: 'escena_fantasma' };
  const r = validarReferencias('Evento', evento, dataset);
  assert.equal(r.valido, false);
});

test('Suceso global no valida escenaId aunque sea inexistente (fuera de alcance)', () => {
  const dataset = datasetDeJuguete();
  const suceso = { id: 'suceso_x', alcance: 'global', escenaId: null };
  const r = validarReferencias('Suceso', suceso, dataset);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('Suceso con eventoGeneradoAlResolver (tipo, no ID) no se valida contra dataset.eventos', () => {
  const dataset = datasetDeJuguete();
  const suceso = { id: 'suceso_a', alcance: 'escena', escenaId: 'escena_a', eventoGeneradoAlResolver: 'tipo_que_no_existe_como_id' };
  const r = validarReferencias('Suceso', suceso, dataset);
  assert.equal(r.valido, true, JSON.stringify(r.errores));
});

test('Jugador con ubicacionActual inexistente falla', () => {
  const dataset = datasetDeJuguete();
  const jugador = { id: 'j1', ubicacionActual: 'escena_fantasma' };
  const r = validarReferencias('Jugador', jugador, dataset);
  assert.equal(r.valido, false);
});
