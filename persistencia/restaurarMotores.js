/**
 * Fase 7 — Reconstruye los tres motores a partir de un `EstadoCompleto` YA
 * VALIDADO (`validarEstadoCompleto`). No valida: si recibe basura, los motores
 * fallan fuerte en su segunda línea de defensa.
 *
 * Los evaluadores de condición registrados en código (`registrarEvaluador*`,
 * o pasados por config) NO son datos y no se persisten: hay que volver a
 * pasarlos acá. Un evaluador que falta no rompe la restauración pero deja al
 * evento/suceso sin poder resolverse por esa condición (fase_7_ADENDUM.md,
 * sección 6).
 */

import { crearMotorDeEventos } from '../core/eventos/motorEventos.js';
import { crearMotorDeSucesos } from '../core/sucesos/motorSucesos.js';
import { crearMotorDeNPCs } from '../core/npcs/motorNPCs.js';

/**
 * @param {object} estadoCompleto
 * @param {object} [opciones]
 * @param {Object<string, Function>} [opciones.evaluadoresExpiracion]
 * @param {Object<string, Function>} [opciones.evaluadoresResolucion]
 * @param {object} [opciones.registroCategoriasEvento] - Se pasa a motorNPCs si se personalizó.
 * @param {object} [opciones.registroTransicionesPorVerbo] - Se pasa a motorNPCs si se personalizó.
 */
export function restaurarMotores(estadoCompleto, opciones = {}) {
  // Copia profunda: el estado restaurado no comparte referencias con lo que se leyó de disco/nube.
  const estado = JSON.parse(JSON.stringify(estadoCompleto));
  const { jugador, npcs, escenas, eventos, sucesos, estadoMundo } = estado;

  const motorEventos = crearMotorDeEventos({
    eventos,
    escenas,
    jugador,
    npcs,
    evaluadoresExpiracion: opciones.evaluadoresExpiracion ?? {},
    estadoMundoInicial: estadoMundo,
  });

  const motorSucesos = crearMotorDeSucesos({
    sucesos,
    escenas,
    jugador,
    npcs,
    evaluadoresResolucion: opciones.evaluadoresResolucion ?? {},
    estadoMundoInicial: estadoMundo,
    estadoInternoInicial: estado.estadoInternoSucesos,
  });

  const configNPCs = { npcs, escenas, motorEventos, estadoInternoInicial: estado.estadoInternoNPCs };
  if (opciones.registroCategoriasEvento) configNPCs.registroCategoriasEvento = opciones.registroCategoriasEvento;
  if (opciones.registroTransicionesPorVerbo) configNPCs.registroTransicionesPorVerbo = opciones.registroTransicionesPorVerbo;
  const motorNPCs = crearMotorDeNPCs(configNPCs);

  return {
    codigoPartida: estado.codigoPartida,
    ultimaModificacion: estado.ultimaModificacion,
    jugador,
    npcs,
    escenas,
    estadoMundo,
    motorEventos,
    motorSucesos,
    motorNPCs,
  };
}
