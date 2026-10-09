/** Fase 8 — Arma una partida nueva desde el dataset de Fase 0 (versión de navegador; la de tests vive en persistencia/utilsPrueba.js). */
import { crearMotorDeEventos } from '../core/eventos/motorEventos.js';
import { crearMotorDeSucesos } from '../core/sucesos/motorSucesos.js';
import { crearMotorDeNPCs } from '../core/npcs/motorNPCs.js';

export function crearPartidaNueva(dataset, codigoPartida) {
  const d = structuredClone(dataset);
  const estadoMundo = d.estadoDelMundo;
  const motorEventos = crearMotorDeEventos({ eventos: d.eventos, escenas: d.escenas, jugador: d.jugador, npcs: d.npcs, estadoMundoInicial: estadoMundo });
  const motorSucesos = crearMotorDeSucesos({ sucesos: d.sucesos, escenas: d.escenas, jugador: d.jugador, npcs: d.npcs, estadoMundoInicial: estadoMundo });
  const motorNPCs = crearMotorDeNPCs({ npcs: d.npcs, escenas: d.escenas, motorEventos });
  return { codigoPartida, jugador: d.jugador, npcs: d.npcs, escenas: d.escenas, estadoMundo, motorEventos, motorSucesos, motorNPCs };
}
