import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { armarContextoDialogo } from './armarContextoDialogo.js';

function npc(overrides = {}) {
  return {
    id: 'npc_a',
    nombre: 'NPC A',
    personalidadBase: 'x',
    estadoEmocional: 'hostil',
    relacion: { valor: -45, historialRelevante: [] },
    conocimientos: [],
    ...overrides,
  };
}
const motorFalso = (lista = []) => ({
  llamadas: [],
  conocimientosRevelablesDe(id, jugador) {
    this.llamadas.push({ id, jugador });
    return lista;
  },
});
const base = (o = {}) => ({
  accionResuelta: { verboId: 'Presionar', npcObjetivoId: 'npc_a', resultado: 'fallo', textoLibre: null, tick: 4 },
  npc: npc(),
  escena: { nombre: 'Plaza', estadoCalculado: 'tenso' },
  estadoMundo: { horaActual: 10, climaActual: 'despejado' },
  motorNPCs: motorFalso(),
  ...o,
});

describe('armarContextoDialogo', () => {
  test('toma estadoEmocional ya proyectado del NPC (no lo recalcula) y categoría de relación de Fase 4', () => {
    const c = armarContextoDialogo(base());
    assert.equal(c.estadoEmocionalProyectado, 'hostil');
    assert.equal(c.categoriaRelacion, 'Desconfiado'); // -45
  });
  test('categoría en cada borde de Fase 4', () => {
    const cat = (v) => armarContextoDialogo(base({ npc: npc({ relacion: { valor: v, historialRelevante: [] } }) })).categoriaRelacion;
    assert.deepEqual([cat(-100), cat(-59), cat(0), cat(20), cat(60)], ['Hostil', 'Desconfiado', 'Neutral', 'Cordial', 'Aliado']);
  });
  test('conocimientosRevelables: los pide al motor de NPCs (con el jugador), no los decide acá', () => {
    const motor = motorFalso([{ contenido: 'secreto' }]);
    const jugador = { id: 'j' };
    const c = armarContextoDialogo(base({ motorNPCs: motor, jugador }));
    assert.deepEqual(c.conocimientosRevelables, [{ contenido: 'secreto' }]);
    assert.deepEqual(motor.llamadas, [{ id: 'npc_a', jugador }]);
  });
  test('opción de patrón tono ("abreTextoLibreConContexto"): su etiqueta pasa a ser tonoElegido', () => {
    const c = armarContextoDialogo(base({ opcionNivel2: { etiqueta: 'Amenazar veladamente', comportamientoAlElegir: 'abreTextoLibreConContexto' } }));
    assert.equal(c.tonoElegido, 'Amenazar veladamente');
  });
  test('opción que se resuelve sola, o sin opción (Hablar con...): tonoElegido null', () => {
    assert.equal(armarContextoDialogo(base({ opcionNivel2: { etiqueta: 'x', comportamientoAlElegir: 'seResuelveSola' } })).tonoElegido, null);
    assert.equal(armarContextoDialogo(base()).tonoElegido, null);
  });
  test('texto libre: se copia al contexto y completa accionResuelta.textoLibre sin mutar el original', () => {
    const original = base().accionResuelta;
    const c = armarContextoDialogo(base({ accionResuelta: original, textoLibreJugador: 'Bajá el arma' }));
    assert.equal(c.textoLibreJugador, 'Bajá el arma');
    assert.equal(c.accionResuelta.textoLibre, 'Bajá el arma');
    assert.equal(original.textoLibre, null);
  });
  test('sin texto libre: string vacío y accionResuelta intacta', () => {
    const c = armarContextoDialogo(base());
    assert.equal(c.textoLibreJugador, '');
    assert.equal(c.accionResuelta.textoLibre, null);
  });
  test('la acción apunta a otro NPC (o a ninguno): falla fuerte, no arma un contexto inconsistente', () => {
    assert.throws(() => armarContextoDialogo(base({ accionResuelta: { ...base().accionResuelta, npcObjetivoId: 'npc_b' } })), /npc_b.*npc_a/);
    assert.throws(() => armarContextoDialogo(base({ accionResuelta: { ...base().accionResuelta, npcObjetivoId: null } })), /Hay que pasar `npcObjetivo`/);
  });
  test('faltan datos obligatorios: falla fuerte', () => {
    assert.throws(() => armarContextoDialogo(base({ npc: null })), /obligatorios/);
    assert.throws(() => armarContextoDialogo(base({ motorNPCs: null })), /obligatorios/);
    assert.throws(() => armarContextoDialogo(base({ accionResuelta: null })), /obligatorios/);
  });
});
