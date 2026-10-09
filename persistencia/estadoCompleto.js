/**
 * Fase 7 — Armado y preparación de `EstadoCompleto`.
 *
 * `capturarEstadoCompleto`: junta lo que ya definieron las fases 0-6 + el
 * estado interno de los motores (extensiones aditivas de Fase 7), con COPIA
 * PROFUNDA (los motores mutan los objetos en sitio; sin copia el "guardado"
 * quedaría atado a los objetos vivos).
 *
 * `prepararParaGuardado`: construye el payload por whitelist, trunca
 * `historialRelevante` sólo en la copia (el motor en ejecución nunca pierde
 * información) y verifica serializabilidad.
 */

import { CAMPOS_ESTADO_COMPLETO, MAX_HISTORIAL_RELEVANTE, VERSION_ESQUEMA } from './constantes.js';
import { verificarSerializable } from './serializable.js';
import { relojReal } from '../core/ia/tiempo.js';

function copiaProfunda(valor) {
  return JSON.parse(JSON.stringify(valor));
}

/**
 * @param {object} p
 * @param {string} p.codigoPartida
 * @param {object} p.jugador
 * @param {object[]} p.npcs
 * @param {object[]} p.escenas
 * @param {object} p.estadoMundo
 * @param {{listarTodos: Function}} p.motorEventos
 * @param {{listarTodos: Function, exportarEstadoInterno: Function}} p.motorSucesos
 * @param {{exportarEstadoInterno: Function}} p.motorNPCs
 * @param {() => number} [p.reloj] - ms epoch; inyectable. Estampa `ultimaModificacion`.
 * @returns {object} EstadoCompleto (copia profunda; sin validar).
 */
export function capturarEstadoCompleto({
  codigoPartida,
  jugador,
  npcs,
  escenas,
  estadoMundo,
  motorEventos,
  motorSucesos,
  motorNPCs,
  reloj = relojReal,
}) {
  const crudo = {
    versionEsquema: VERSION_ESQUEMA,
    codigoPartida,
    ultimaModificacion: reloj(),
    jugador,
    npcs,
    escenas,
    eventos: motorEventos.listarTodos(),
    sucesos: motorSucesos.listarTodos(),
    estadoMundo,
    estadoInternoNPCs: motorNPCs.exportarEstadoInterno(),
    estadoInternoSucesos: motorSucesos.exportarEstadoInterno(),
  };
  const errores = verificarSerializable(crudo);
  if (errores.length > 0) {
    // Un motor produjo algo que no sobrevive a JSON: es un bug interno, no un caso a tragarse.
    throw new Error(`capturarEstadoCompleto: el estado no es serializable sin pérdida. ${errores.join(' ')}`);
  }
  return copiaProfunda(crudo);
}

/**
 * @param {object} estado - EstadoCompleto (o algo con la pinta).
 * @returns {{ payload: object|null, reportes: string[], errores: string[] }}
 *   `payload` es null si hay `errores` (no serializable). `reportes` son informativos
 *   (campos fuera de la whitelist que se descartaron).
 */
export function prepararParaGuardado(estado) {
  const reportes = [];
  if (estado === null || typeof estado !== 'object' || Array.isArray(estado)) {
    return { payload: null, reportes, errores: ['prepararParaGuardado: el estado tiene que ser un objeto.'] };
  }

  for (const clave of Object.keys(estado)) {
    if (!CAMPOS_ESTADO_COMPLETO.includes(clave)) {
      reportes.push(`Campo '${clave}' fuera de la whitelist de EstadoCompleto: no se persiste.`);
    }
  }

  const armado = {};
  for (const campo of CAMPOS_ESTADO_COMPLETO) {
    if (campo in estado) armado[campo] = estado[campo];
  }

  const errores = verificarSerializable(armado);
  if (errores.length > 0) return { payload: null, reportes, errores };

  const payload = copiaProfunda(armado);
  if (Array.isArray(payload.npcs)) {
    for (const npc of payload.npcs) {
      if (Array.isArray(npc?.relacion?.historialRelevante)) {
        npc.relacion.historialRelevante = npc.relacion.historialRelevante.slice(-MAX_HISTORIAL_RELEVANTE);
      }
    }
  }
  return { payload, reportes, errores: [] };
}
