/**
 * Fase 6 — Modo mock (doc técnico, sección 6). Decisión ya tomada:
 * combina campos del contexto (no plantilla fija), así el panel de
 * Fase 8 puede verificar que el contexto se armó bien sin gastar una
 * llamada. El prefijo `[MOCK]` es intencional y no se saca.
 */

import { limpiarTextoJugador } from './armarMensajes.js';

const FRASES_POR_ESTADO = {
  hostil: 'No tengo nada que decirte.',
  molesto: '¿Qué querés ahora?',
  neutral: 'Te escucho.',
  alegre: '¡Qué bueno verte!',
  temeroso: 'No sé si es buen momento para hablar...',
  alarmado: '¡No es momento para esto!',
};

/**
 * @param {{nombre: string}} npc
 * @param {string} estadoEmocionalProyectado
 * @param {{resultado: string}} accionResuelta
 * @param {string} textoLibreJugador
 * @returns {string}
 */
export function generarDialogoMock(npc, estadoEmocionalProyectado, accionResuelta, textoLibreJugador) {
  const base = FRASES_POR_ESTADO[estadoEmocionalProyectado] ?? '...';
  const cabecera = `[MOCK] ${npc.nombre} (${estadoEmocionalProyectado}, resultado: ${accionResuelta.resultado}): ${base}`;
  if (accionResuelta.resultado === 'fallo') return cabecera;
  return `${cabecera} — respecto a '${limpiarTextoJugador(textoLibreJugador)}'`;
}
