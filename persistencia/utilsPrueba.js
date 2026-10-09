/**
 * Fase 7 — Utilidades para tests (y para el panel de Fase 8). Arma una partida
 * completa desde los fixtures de Fase 0, con los tres motores reales.
 * No se importa desde código de producción.
 */

import { readFileSync } from 'node:fs';
import { crearMotorDeEventos } from '../core/eventos/motorEventos.js';
import { crearMotorDeSucesos } from '../core/sucesos/motorSucesos.js';
import { crearMotorDeNPCs } from '../core/npcs/motorNPCs.js';
import { capturarEstadoCompleto } from './estadoCompleto.js';

export function leerFixture(nombre) {
  return JSON.parse(readFileSync(new URL(`../data/fixtures/${nombre}.json`, import.meta.url)));
}

export function cargarObjetos() {
  return leerFixture('objetos');
}

/** Partida nueva con motores reales sobre copias frescas de los fixtures. */
export function armarPartida({ codigoPartida = 'K7M2XP', reloj = () => 1_000_000 } = {}) {
  const jugador = leerFixture('jugador');
  const npcs = leerFixture('npcs');
  const escenas = leerFixture('escenas');
  const estadoMundo = leerFixture('estadoDelMundo');

  const motorEventos = crearMotorDeEventos({ eventos: leerFixture('eventos'), escenas, jugador, npcs, estadoMundoInicial: estadoMundo });
  const motorSucesos = crearMotorDeSucesos({ sucesos: leerFixture('sucesos'), escenas, jugador, npcs, estadoMundoInicial: estadoMundo });
  const motorNPCs = crearMotorDeNPCs({ npcs, escenas, motorEventos });

  const capturar = (relojLocal = reloj) =>
    capturarEstadoCompleto({ codigoPartida, jugador, npcs, escenas, estadoMundo, motorEventos, motorSucesos, motorNPCs, reloj: relojLocal });

  return { codigoPartida, jugador, npcs, escenas, estadoMundo, motorEventos, motorSucesos, motorNPCs, capturar };
}

/** AccionResuelta mínima (contrato de Fase 4, sección 0.1). */
export function accion(overrides = {}) {
  return { verboId: null, opcionElegidaId: null, npcObjetivoId: null, textoLibre: null, resultado: 'exito', tick: 1, ...overrides };
}

// ---------------------------------------------------------------------------
// Simulación determinista de "jugar": avanza el mundo y aplica acciones con los
// motores reales. Sin azar: sirve para comparar una partida continua contra la
// misma partida guardada y restaurada a mitad de camino.
// ---------------------------------------------------------------------------

import { avanzarTicks } from '../core/avanzarTicks.js';
import { actualizarEstadoCalculado } from '../core/comprensionMundo/calcularEstadoEscena.js';

/** Un paso del scheduler del mundo (orden fijo, el mismo que va a usar la Fase 8). */
export function avanzarMundo(p, ticks = 1) {
  avanzarTicks(p.estadoMundo, ticks);
  p.motorSucesos.procesarTicks(p.estadoMundo, p.motorEventos);
  p.motorEventos.revisarExpiraciones(p.estadoMundo);
  for (const escena of p.escenas) {
    actualizarEstadoCalculado(escena, p.motorEventos.listarEventosActivos(escena.id), p.estadoMundo);
  }
  p.motorNPCs.procesarEventosDeMundo();
}

/** Guion de pasos; cada uno recibe la partida (original o restaurada). */
export const GUION = [
  (p) => avanzarMundo(p, 2),
  (p) => p.motorNPCs.procesarAccionResuelta(accion({ verboId: 'Hablar con...', npcObjetivoId: 'npc_guardia_001', resultado: 'exito', tick: p.estadoMundo.ticksTranscurridos })),
  (p) => p.motorNPCs.procesarAccionResuelta(accion({ verboId: 'Atacar', npcObjetivoId: 'npc_guardia_001', resultado: 'exito', tick: p.estadoMundo.ticksTranscurridos })),
  (p) => avanzarMundo(p, 3),
  (p) => {
    p.motorEventos.crearEvento(
      { id: 'evento_amenaza_test', tipo: 'amenaza_npc_hostil', escenaId: 'escena_plaza', duracion: 6, condicionExpiracion: null, metadata: { npcId: 'npc_viajero_001' } },
      p.estadoMundo
    );
    for (const e of p.escenas) actualizarEstadoCalculado(e, p.motorEventos.listarEventosActivos(e.id), p.estadoMundo);
    p.motorNPCs.procesarEventosDeMundo();
  },
  (p) => avanzarMundo(p, 1),
  (p) => avanzarMundo(p, 1),
  (p) => p.motorNPCs.procesarAccionResuelta(accion({ verboId: 'Calmar la situación', npcObjetivoId: 'npc_guardia_001', resultado: 'exito', tick: p.estadoMundo.ticksTranscurridos })),
  (p) => avanzarMundo(p, 5),
  (p) => avanzarMundo(p, 8),
  (p) => avanzarMundo(p, 24),
];
