import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { restaurarMotores } from './restaurarMotores.js';
import { validarEstadoCompleto } from './validarEstadoCompleto.js';
import { armarPartida, cargarObjetos, GUION, avanzarMundo, accion } from './utilsPrueba.js';
import { capturarEstadoCompleto } from './estadoCompleto.js';

const RELOJ_FIJO = () => 5_000_000;
const objetos = cargarObjetos();

function capturarDe(p) {
  return capturarEstadoCompleto({
    codigoPartida: 'K7M2XP', jugador: p.jugador, npcs: p.npcs, escenas: p.escenas, estadoMundo: p.estadoMundo,
    motorEventos: p.motorEventos, motorSucesos: p.motorSucesos, motorNPCs: p.motorNPCs, reloj: RELOJ_FIJO,
  });
}

/** Guarda "a través del cable": JSON + validación, como haría el servicio. */
function viajePorDisco(estado) {
  const leido = JSON.parse(JSON.stringify(estado));
  const v = validarEstadoCompleto(leido, { objetos });
  assert.equal(v.valido, true, `el estado a mitad de partida tiene que validar: ${v.errores.join(' | ')}`);
  return leido;
}

describe('restaurarMotores — equivalencia con una partida continua', () => {
  test('cortar y restaurar en CADA paso del guion da exactamente el mismo estado final que no cortar', () => {
    const control = armarPartida();
    for (const paso of GUION) paso(control);
    const finalControl = capturarDe(control);

    for (let corte = 0; corte < GUION.length; corte += 1) {
      const original = armarPartida();
      for (let i = 0; i <= corte; i += 1) GUION[i](original);

      let restaurada = restaurarMotores(viajePorDisco(capturarDe(original)));
      for (let i = corte + 1; i < GUION.length; i += 1) GUION[i](restaurada);

      assert.deepEqual(capturarDe(restaurada), finalControl, `divergencia al cortar después del paso ${corte}`);
    }
  });

  test('el guion realmente ejercita lo difícil: NPC hostil, evento inactivo, suceso resuelto y evento generado', () => {
    const p = armarPartida();
    for (const paso of GUION) paso(p);
    const estado = capturarDe(p);

    assert.ok(estado.eventos.some((e) => !e.activo), 'hay eventos inactivos guardados');
    assert.ok(estado.sucesos.some((s) => !s.activo), 'hay un suceso resuelto');
    assert.ok(estado.eventos.some((e) => e.metadata.sucesoOrigenId), 'un evento nació de un suceso');
    assert.ok(estado.npcs.some((n) => n.relacion.historialRelevante.length > 0), 'hay historial de relación');
    assert.ok(Object.values(estado.estadoInternoNPCs.ejes).some((e) => e.nivelDisposicion !== 0 || e.nivelTemor !== 0), 'hay ejes distintos de (0,0)');
  });

  test('IDEMPOTENCIA tras restaurar: el mismo tick ya procesado antes de guardar no duplica progreso de suceso', () => {
    const original = armarPartida();
    avanzarMundo(original, 4);
    const progreso = original.motorSucesos.listarTodos()[0].progreso;

    const restaurada = restaurarMotores(viajePorDisco(capturarDe(original)));
    restaurada.motorSucesos.procesarTicks(restaurada.estadoMundo, restaurada.motorEventos); // mismo tick
    assert.equal(restaurada.motorSucesos.listarTodos()[0].progreso, progreso);
  });

  test('existioAlgunaVez sobrevive para un evento que ya se desactivó antes de guardar', () => {
    const original = armarPartida();
    avanzarMundo(original, 10); // el incendio (duración 5) ya expiró
    assert.equal(original.motorEventos.listarEventosActivos('escena_herreria').length, 0);

    const restaurada = restaurarMotores(viajePorDisco(capturarDe(original)));
    assert.equal(restaurada.motorEventos.existioAlgunaVez('evento_incendio_001'), true);
  });

  test('BUG DE CARGA: un NPC alarmado vuelve con ejes coherentes y el siguiente decaimiento parte de ahí', () => {
    const original = armarPartida();
    original.escenas.find((e) => e.id === 'escena_plaza').estadoCalculado = 'combate';
    original.motorNPCs.procesarEventosDeMundo();
    assert.equal(original.npcs.find((n) => n.id === 'npc_guardia_001').estadoEmocional, 'alarmado');

    const restaurada = restaurarMotores(viajePorDisco(capturarDe(original)));
    assert.deepEqual(restaurada.motorNPCs.obtenerEjesInternos('npc_guardia_001'), { nivelTemor: 2, nivelDisposicion: 0 });

    restaurada.escenas.find((e) => e.id === 'escena_plaza').estadoCalculado = 'tranquilo';
    restaurada.motorNPCs.procesarEventosDeMundo();
    assert.equal(restaurada.npcs.find((n) => n.id === 'npc_guardia_001').estadoEmocional, 'temeroso', 'decae un nivel, no vuelve a neutral de golpe');
  });

  test('la partida restaurada no comparte referencias con el estado leído', () => {
    const original = armarPartida();
    const leido = viajePorDisco(capturarDe(original));
    const restaurada = restaurarMotores(leido);
    restaurada.npcs[0].relacion.valor = 99;
    assert.notEqual(leido.npcs[0].relacion.valor, 99);
  });

  test('devuelve codigoPartida y ultimaModificacion, y los motores funcionan', () => {
    const restaurada = restaurarMotores(viajePorDisco(capturarDe(armarPartida())));
    assert.equal(restaurada.codigoPartida, 'K7M2XP');
    assert.equal(restaurada.ultimaModificacion, 5_000_000);
    const r = restaurada.motorNPCs.procesarAccionResuelta(accion({ verboId: 'Hablar con...', npcObjetivoId: 'npc_herrero_001', resultado: 'exito' }));
    assert.equal(r.npc.id, 'npc_herrero_001');
  });

  test('si faltan evaluadores registrados en código, los pasados por opciones se aplican', () => {
    const original = armarPartida();
    const restaurada = restaurarMotores(viajePorDisco(capturarDe(original)), {
      evaluadoresResolucion: { llega_caravana_comercio: () => true },
    });
    restaurada.escenas.forEach(() => {});
    avanzarMundo(restaurada, 1);
    assert.equal(restaurada.motorSucesos.listarTodos()[0].activo, false, 'el evaluador inyectado resolvió el suceso');
  });
});
