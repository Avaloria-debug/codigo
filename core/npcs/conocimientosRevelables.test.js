import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearNPC } from '../modelos/npc.js';
import { crearMotorDeEventos } from '../eventos/motorEventos.js';
import { conocimientosRevelables } from './conocimientosRevelables.js';

function npcConConocimientos(conocimientos, relacionValor = 0) {
  return crearNPC({
    id: 'npc_test_001',
    nombre: 'NPC de prueba',
    arquetipo: 'comerciante',
    personalidadBase: 'Test.',
    relacion: { valor: relacionValor, historialRelevante: [] },
    conocimientos,
  });
}

describe('conocimientosRevelables — casos de nivelAcceso (doc técnico, sección 5)', () => {
  test('publico siempre se revela, sin importar relación ni motorEventos', () => {
    const npc = npcConConocimientos([
      { id: 'c1', contenido: 'x', nivelAcceso: 'publico', umbralRelacion: null, eventoDisparadorId: null },
    ]);
    const motorEventosStub = { existioAlgunaVez: () => false };

    const revelables = conocimientosRevelables(npc, null, motorEventosStub);
    assert.equal(revelables.length, 1);
    assert.equal(revelables[0].id, 'c1');
  });

  test('requiereRelacion: se revela cuando relacion.valor >= umbralRelacion', () => {
    const npc = npcConConocimientos(
      [{ id: 'c1', contenido: 'x', nivelAcceso: 'requiereRelacion', umbralRelacion: 40, eventoDisparadorId: null }],
      40
    );
    const revelables = conocimientosRevelables(npc, null, { existioAlgunaVez: () => false });
    assert.equal(revelables.length, 1);
  });

  test('requiereRelacion: NO se revela un punto por debajo del umbral', () => {
    const npc = npcConConocimientos(
      [{ id: 'c1', contenido: 'x', nivelAcceso: 'requiereRelacion', umbralRelacion: 40, eventoDisparadorId: null }],
      39
    );
    const revelables = conocimientosRevelables(npc, null, { existioAlgunaVez: () => false });
    assert.equal(revelables.length, 0);
  });

  test('requiereEvento: delega en motorEventos.existioAlgunaVez con el eventoDisparadorId correcto', () => {
    const npc = npcConConocimientos([
      { id: 'c1', contenido: 'x', nivelAcceso: 'requiereEvento', umbralRelacion: null, eventoDisparadorId: 'evento_x' },
    ]);
    let idConsultado = null;
    const motorEventosStub = {
      existioAlgunaVez(id) {
        idConsultado = id;
        return true;
      },
    };

    const revelables = conocimientosRevelables(npc, null, motorEventosStub);
    assert.equal(revelables.length, 1);
    assert.equal(idConsultado, 'evento_x');
  });

  test('requiereEvento: no se revela si existioAlgunaVez devuelve false', () => {
    const npc = npcConConocimientos([
      { id: 'c1', contenido: 'x', nivelAcceso: 'requiereEvento', umbralRelacion: null, eventoDisparadorId: 'evento_x' },
    ]);
    const revelables = conocimientosRevelables(npc, null, { existioAlgunaVez: () => false });
    assert.equal(revelables.length, 0);
  });

  test('integración real con motorEventos (Fase 1): evento latente nunca activado no revela; una vez activado, sí', () => {
    const motorEventos = crearMotorDeEventos({ eventos: [], escenas: [] });
    motorEventos.crearEvento({
      id: 'evento_x', tipo: 'x', escenaId: 'escena_plaza', duracion: 1, condicionExpiracion: null, activo: false,
    });

    const npc = npcConConocimientos([
      { id: 'c1', contenido: 'x', nivelAcceso: 'requiereEvento', umbralRelacion: null, eventoDisparadorId: 'evento_x' },
    ]);

    assert.equal(conocimientosRevelables(npc, null, motorEventos).length, 0);

    motorEventos.activarEvento('evento_x');
    assert.equal(conocimientosRevelables(npc, null, motorEventos).length, 1);
  });

  test('NPC sin conocimientos devuelve array vacío', () => {
    const npc = npcConConocimientos([]);
    const revelables = conocimientosRevelables(npc, null, { existioAlgunaVez: () => true });
    assert.deepEqual(revelables, []);
  });

  test('mezcla de nivelAcceso: cada conocimiento se evalúa independientemente', () => {
    const npc = npcConConocimientos(
      [
        { id: 'publico', contenido: 'x', nivelAcceso: 'publico', umbralRelacion: null, eventoDisparadorId: null },
        { id: 'relacion_ok', contenido: 'x', nivelAcceso: 'requiereRelacion', umbralRelacion: 10, eventoDisparadorId: null },
        { id: 'relacion_no', contenido: 'x', nivelAcceso: 'requiereRelacion', umbralRelacion: 90, eventoDisparadorId: null },
        { id: 'evento_ok', contenido: 'x', nivelAcceso: 'requiereEvento', umbralRelacion: null, eventoDisparadorId: 'ev_a' },
        { id: 'evento_no', contenido: 'x', nivelAcceso: 'requiereEvento', umbralRelacion: null, eventoDisparadorId: 'ev_b' },
      ],
      50
    );
    const motorEventosStub = { existioAlgunaVez: (id) => id === 'ev_a' };

    const ids = conocimientosRevelables(npc, null, motorEventosStub).map((c) => c.id);
    assert.deepEqual(ids.sort(), ['evento_ok', 'publico', 'relacion_ok']);
  });

  test('el parámetro jugador no afecta el resultado (reservado para nivelAcceso futuro, no usado en el cascarón)', () => {
    const npc = npcConConocimientos([
      { id: 'c1', contenido: 'x', nivelAcceso: 'publico', umbralRelacion: null, eventoDisparadorId: null },
    ]);
    const motorEventosStub = { existioAlgunaVez: () => false };

    const conJugador = conocimientosRevelables(npc, { flags: { conocioAlHerrero: true } }, motorEventosStub);
    const sinJugador = conocimientosRevelables(npc, null, motorEventosStub);
    const jugadorUndefined = conocimientosRevelables(npc, undefined, motorEventosStub);

    assert.deepEqual(conJugador, sinJugador);
    assert.deepEqual(sinJugador, jugadorUndefined);
  });
});
