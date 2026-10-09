/**
 * Fase 8 — Versión de producción del scheduler del mundo (la de
 * persistencia/utilsPrueba.js es sólo para tests). Orden fijo y obligatorio:
 *   avanzarTicks -> procesarTicks -> revisarExpiraciones
 *   -> calcular estado por escena -> procesarEventosDeMundo
 * (un evento generado por un suceso tiene que estar activo ANTES de recalcular
 * el estado, y el estado actualizado ANTES de decidir el temor de los NPCs).
 * `avanzarTicks` es el ÚNICO lugar que toca el reloj (decisión del maestro).
 *
 * @returns {{ ticks:number, sucesosModificados:any[], eventosGenerados:any[],
 *   eventosExpirados:any[], reportes:{origen:string,mensaje:string}[] }}
 */
import { avanzarTicks } from '../avanzarTicks.js';
import { actualizarEstadoCalculado } from '../comprensionMundo/calcularEstadoEscena.js';
import { registroCategoriasEventoPorDefecto } from '../comprensionMundo/registroCategoriasEvento.js';

export function avanzarMundo(estadoJuego, ticks = 1, { registroCategoriasEvento = registroCategoriasEventoPorDefecto } = {}) {
  const { estadoMundo, motorSucesos, motorEventos, motorNPCs, escenas } = estadoJuego;
  const reportes = [];

  avanzarTicks(estadoMundo, ticks); // lanza si ticks no es entero positivo

  const rs = motorSucesos.procesarTicks(estadoMundo, motorEventos) ?? {};
  const eventosExpirados = motorEventos.revisarExpiraciones(estadoMundo) ?? [];

  for (const escena of escenas) {
    const r = actualizarEstadoCalculado(escena, motorEventos.listarEventosActivos(escena.id), estadoMundo, registroCategoriasEvento);
    for (const mensaje of r.reportes ?? []) reportes.push({ origen: 'calcularEstadoEscena', mensaje: `[${escena.id}] ${mensaje}` });
  }

  const rn = motorNPCs.procesarEventosDeMundo();
  for (const mensaje of rn?.reportes ?? []) reportes.push({ origen: 'procesarEventosDeMundo', mensaje });

  return {
    ticks,
    sucesosModificados: rs.sucesosModificados ?? [],
    eventosGenerados: rs.eventosGenerados ?? [],
    eventosExpirados,
    reportes,
  };
}
