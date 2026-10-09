/**
 * Fase 7 — Sincronización local ↔ nube (doc técnico Fase 7, sección 4.1, con
 * la decisión 4b del addendum).
 *
 * Regla de conflicto: gana el guardado con `ultimaModificacion` mayor, completo,
 * sin merge campo por campo. Límite conocido: los timestamps salen del reloj de
 * cada dispositivo; un reloj desfasado puede hacer ganar al equivocado.
 *
 * Nube inválida (4b): NO se sobrescribe. Se devuelve `nube_invalida` con el
 * motivo y los errores concretos, y quien llama bloquea la escritura a la nube
 * hasta una confirmación explícita.
 *
 * `estadoLocal` tiene que venir ya validado y ya preparado (es lo que se sube).
 *
 * Nunca lanza por un fallo del adaptador (red, cuota): devuelve
 * `nube_no_disponible` — el juego sigue con el guardado local.
 */

import { validarEstadoCompleto } from './validarEstadoCompleto.js';
import { MOTIVO_ESTRUCTURA } from './constantes.js';

function mensaje(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @returns {Promise<{
 *   decision: 'nube_creada'|'nube_actualizada'|'sin_cambios'|'usar_nube'|'nube_invalida'|'nube_no_disponible',
 *   estado: object,
 *   crudoNube?: object, motivo?: string, errores?: string[], error?: string
 * }>}
 */
export async function sincronizarPartida(estadoLocal, adaptadorNube, { objetos }) {
  let crudo;
  try {
    crudo = await adaptadorNube.cargarPartida(estadoLocal.codigoPartida);
  } catch (error) {
    return { decision: 'nube_no_disponible', estado: estadoLocal, error: mensaje(error) };
  }

  if (crudo === null || crudo === undefined) {
    try {
      await adaptadorNube.guardarPartida(estadoLocal);
    } catch (error) {
      return { decision: 'nube_no_disponible', estado: estadoLocal, error: mensaje(error) };
    }
    return { decision: 'nube_creada', estado: estadoLocal };
  }

  const validacion = validarEstadoCompleto(crudo, { objetos });
  if (!validacion.valido) {
    return { decision: 'nube_invalida', estado: estadoLocal, motivo: validacion.motivo, errores: validacion.errores };
  }
  if (crudo.codigoPartida !== estadoLocal.codigoPartida) {
    return {
      decision: 'nube_invalida',
      estado: estadoLocal,
      motivo: MOTIVO_ESTRUCTURA,
      errores: [`El documento de la nube declara codigoPartida '${crudo.codigoPartida}' pero se pidió '${estadoLocal.codigoPartida}'.`],
    };
  }

  if (estadoLocal.ultimaModificacion > crudo.ultimaModificacion) {
    try {
      await adaptadorNube.guardarPartida(estadoLocal);
    } catch (error) {
      return { decision: 'nube_no_disponible', estado: estadoLocal, error: mensaje(error) };
    }
    return { decision: 'nube_actualizada', estado: estadoLocal };
  }
  if (crudo.ultimaModificacion > estadoLocal.ultimaModificacion) {
    return { decision: 'usar_nube', estado: crudo };
  }
  return { decision: 'sin_cambios', estado: estadoLocal };
}
