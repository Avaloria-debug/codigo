/**
 * Fase 8 — Junta lo que ya existe (motores + entidades) con lo que el
 * orquestador necesita (mapas por id, config de Groq, registro de uso).
 */
import { construirNpcsPorId, construirObjetosPorId } from '../opciones/resolutores.js';
import { crearConfiguracionGroq } from '../ia/configuracionGroq.js';
import { crearRegistroUso } from '../ia/registroUso.js';
import { actualizarEstadoCalculado } from '../comprensionMundo/calcularEstadoEscena.js';

export function crearEstadoJuego(partida, { objetos, configuracionGroq = crearConfiguracionGroq(), registroUso = crearRegistroUso({}),
  opcionesDialogo = {}, servicioPersistencia = null, adaptadorLocal = null, reloj, opcionesMundo } = {}) {
  if (!objetos) throw new Error('crearEstadoJuego: `objetos` (catálogo) es obligatorio.');
  // Los fixtures traen estadoCalculado: null (Fase 0) y nadie lo calcula hasta el primer avance de
  // tick: sin esto el primer turno no tendría verbos ligados a estado. Una partida restaurada ya lo trae.
  const reportesIniciales = [];
  for (const escena of partida.escenas) {
    if (escena.estadoCalculado == null) {
      const r = actualizarEstadoCalculado(escena, partida.motorEventos.listarEventosActivos(escena.id), partida.estadoMundo);
      for (const mensaje of r.reportes ?? []) reportesIniciales.push({ origen: 'calcularEstadoEscena', mensaje: `[${escena.id}] ${mensaje}` });
    }
  }
  return {
    reportesIniciales,
    ...partida, objetosPorId: construirObjetosPorId(objetos), npcsPorId: construirNpcsPorId(partida.npcs),
    configuracionGroq, registroUso, opcionesDialogo, servicioPersistencia, adaptadorLocal, reloj, opcionesMundo,
  };
}
