/**
 * Fase 7 — Servicio de persistencia (orquestación local + nube, doc técnico
 * Fase 7 sección 9, con las decisiones 1-4b del addendum).
 *
 * Factory con closure, como el resto del proyecto. No conoce Firebase ni
 * IndexedDB: recibe adaptadores con el contrato documentado.
 *
 * Reglas que hacen cumplir el código (no la UI):
 *  - Un estado inválido NO se persiste (mejor fallar al escribir que descubrirlo mañana).
 *  - Un lado inválido (local o nube) NUNCA se sobrescribe sin una confirmación explícita
 *    (`resolverConflictoDeCarga`), y un documento `version_futura` NO se sobrescribe jamás.
 *  - La nube es best-effort: si falla, el guardado local ya ocurrió y queda `pendienteDeSync`.
 *  - La API key y el registro de uso no pasan por acá: viven en el adaptador local, aparte.
 */

import { prepararParaGuardado } from './estadoCompleto.js';
import { validarEstadoCompleto } from './validarEstadoCompleto.js';
import { sincronizarPartida } from './sincronizarPartida.js';
import { esCodigoPartidaValido, normalizarCodigoPartida } from './codigoPartida.js';
import { MOTIVO_VERSION_FUTURA } from './constantes.js';

function mensaje(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {object} config
 * @param {ReturnType<import('./adaptadores/local.js').crearAdaptadorLocal>} config.adaptadorLocal
 * @param {{guardarPartida: Function, cargarPartida: Function}|null} [config.adaptadorNube]
 * @param {object[]} config.objetos - Catálogo estático (data/), para validar referencias.
 */
export function crearServicioPersistencia({ adaptadorLocal, adaptadorNube = null, objetos }) {
  if (!adaptadorLocal) throw new Error('crearServicioPersistencia: adaptadorLocal es obligatorio.');
  if (!Array.isArray(objetos)) throw new Error('crearServicioPersistencia: `objetos` (catálogo estático) es obligatorio.');

  let _nubeBloqueada = null; // { motivo, errores }
  let _localBloqueado = null; // { motivo, errores }
  let _pendienteDeSync = false;
  let _conflicto = null; // { ladoRoto: 'nube'|'local', motivo, errores, candidato: estado válido del otro lado }

  function _validar(crudo) {
    return validarEstadoCompleto(crudo, { objetos });
  }

  async function _sincronizarConNube(estadoLocal) {
    const r = await sincronizarPartida(estadoLocal, adaptadorNube, { objetos });
    const salida = { estado: estadoLocal, decision: r.decision, reportes: [], conflicto: null };

    if (r.decision === 'nube_invalida') {
      _nubeBloqueada = { motivo: r.motivo, errores: r.errores };
      _conflicto = { ladoRoto: 'nube', motivo: r.motivo, errores: r.errores, candidato: estadoLocal };
      salida.conflicto = _describirConflicto();
      salida.reportes.push(`La partida de la nube es inválida (${r.motivo}); no se escribe en la nube hasta que lo resuelvas.`);
    } else if (r.decision === 'usar_nube') {
      await adaptadorLocal.guardarLocal(r.estado);
      salida.estado = r.estado;
      _pendienteDeSync = false;
    } else if (r.decision === 'nube_no_disponible') {
      _pendienteDeSync = true;
      salida.reportes.push(`La nube no está disponible (${r.error}); se sigue con el guardado local.`);
    } else {
      _pendienteDeSync = false;
    }
    return salida;
  }

  function _describirConflicto() {
    if (!_conflicto) return null;
    const { ladoRoto, motivo, errores } = _conflicto;
    return { ladoRoto, motivo, errores: [...errores], sobrescrituraPermitida: motivo !== MOTIVO_VERSION_FUTURA };
  }

  return {
    /**
     * Arranque de sesión. Nunca lanza por datos malos.
     * @returns {Promise<{estado: object|null, decision: string, reportes: string[], conflicto: object|null}>}
     */
    async iniciar() {
      _nubeBloqueada = null;
      _localBloqueado = null;
      _conflicto = null;

      const crudo = await adaptadorLocal.cargarLocal();
      if (crudo === null) {
        return { estado: null, decision: 'sin_partida_local', reportes: [], conflicto: null };
      }

      const v = _validar(crudo);
      if (!v.valido) {
        _localBloqueado = { motivo: v.motivo, errores: v.errores };
        const reportes = [`La partida guardada en este dispositivo es inválida (${v.motivo}); no se toca.`];

        // ¿Hay una copia válida en la nube para ofrecer?
        const codigo = crudo?.codigoPartida;
        if (adaptadorNube && esCodigoPartidaValido(codigo)) {
          try {
            const enNube = await adaptadorNube.cargarPartida(codigo);
            if (enNube && _validar(enNube).valido && enNube.codigoPartida === codigo) {
              _conflicto = { ladoRoto: 'local', motivo: v.motivo, errores: v.errores, candidato: enNube };
            }
          } catch (error) {
            reportes.push(`No se pudo consultar la nube (${mensaje(error)}).`);
          }
        }
        return { estado: null, decision: 'local_invalido', reportes, conflicto: _describirConflicto() ?? { ladoRoto: 'local', motivo: v.motivo, errores: v.errores, sobrescrituraPermitida: v.motivo !== MOTIVO_VERSION_FUTURA, sinAlternativa: true } };
      }

      if (!adaptadorNube) return { estado: crudo, decision: 'solo_local', reportes: [], conflicto: null };
      return _sincronizarConNube(crudo);
    },

    /**
     * Guarda SIEMPRE en local (si el estado es válido) y, best-effort, en la nube.
     * @param {object} estadoCompleto - Salida de `capturarEstadoCompleto`.
     */
    async guardar(estadoCompleto) {
      if (_localBloqueado) {
        return { guardado: false, motivo: 'local_bloqueado', reportes: ['Hay una partida inválida en este dispositivo sin resolver; no se sobrescribe.'], nube: 'no_intentada' };
      }
      const prep = prepararParaGuardado(estadoCompleto);
      if (prep.errores.length > 0) {
        return { guardado: false, motivo: 'no_serializable', reportes: [...prep.reportes, ...prep.errores], nube: 'no_intentada' };
      }
      const v = _validar(prep.payload);
      if (!v.valido) {
        return { guardado: false, motivo: 'estado_invalido', reportes: [...prep.reportes, ...v.errores], nube: 'no_intentada' };
      }

      try {
        await adaptadorLocal.guardarLocal(prep.payload);
      } catch (error) {
        return { guardado: false, motivo: 'fallo_local', reportes: [...prep.reportes, `No se pudo guardar en el dispositivo: ${mensaje(error)}`], nube: 'no_intentada' };
      }

      const reportes = [...prep.reportes];
      let nube;
      if (!adaptadorNube) {
        nube = 'sin_nube';
      } else if (_nubeBloqueada) {
        nube = 'bloqueada';
        reportes.push('La nube está bloqueada por una partida inválida; este guardado quedó sólo en el dispositivo.');
      } else {
        try {
          await adaptadorNube.guardarPartida(prep.payload);
          nube = 'ok';
          _pendienteDeSync = false;
        } catch (error) {
          nube = 'fallo';
          _pendienteDeSync = true;
          reportes.push(`No se pudo guardar en la nube (${mensaje(error)}); queda pendiente de sincronizar.`);
        }
      }
      return { guardado: true, motivo: null, reportes, nube };
    },

    /** Reintenta la sincronización con lo que hay guardado en local. */
    async sincronizar() {
      if (!adaptadorNube) return { estado: null, decision: 'sin_nube', reportes: [], conflicto: null };
      if (_nubeBloqueada) return { estado: null, decision: 'nube_bloqueada', reportes: ['La nube está bloqueada por una partida inválida.'], conflicto: _describirConflicto() };
      const crudo = await adaptadorLocal.cargarLocal();
      if (crudo === null || !_validar(crudo).valido) return { estado: null, decision: 'sin_partida_local_valida', reportes: [], conflicto: null };
      return _sincronizarConNube(crudo);
    },

    /**
     * Continuar en este dispositivo una partida que vive en la nube.
     * Con el slot local ocupado hace falta `reemplazarLocal: true` explícito
     * (una partida por dispositivo).
     */
    async cargarPorCodigo(codigoIngresado, { reemplazarLocal = false } = {}) {
      if (!adaptadorNube) throw new Error('cargarPorCodigo: no hay adaptador de nube configurado.');
      const codigo = normalizarCodigoPartida(codigoIngresado);
      if (!esCodigoPartidaValido(codigo)) return { estado: null, decision: 'codigo_invalido', reportes: ['El código no tiene el formato correcto.'] };

      if (!reemplazarLocal && (await adaptadorLocal.cargarLocal()) !== null) {
        throw new Error('cargarPorCodigo: ya hay una partida en este dispositivo; pasá { reemplazarLocal: true } para confirmarlo.');
      }

      let crudo;
      try {
        crudo = await adaptadorNube.cargarPartida(codigo);
      } catch (error) {
        return { estado: null, decision: 'nube_no_disponible', reportes: [`No se pudo consultar la nube (${mensaje(error)}).`] };
      }
      if (crudo === null || crudo === undefined) return { estado: null, decision: 'codigo_inexistente', reportes: [] };

      const v = _validar(crudo);
      if (!v.valido || crudo.codigoPartida !== codigo) {
        return { estado: null, decision: 'nube_invalida', motivo: v.valido ? 'estructura' : v.motivo, reportes: v.valido ? [`El documento declara otro código de partida (${crudo.codigoPartida}).`] : v.errores };
      }
      await adaptadorLocal.guardarLocal(crudo);
      _localBloqueado = null;
      return { estado: crudo, decision: 'cargada_de_nube', reportes: [] };
    },

    /**
     * Confirmación explícita de un conflicto de carga. `direccion` dice QUÉ LADO se usa:
     *  - 'usarLocal' → se pisa la nube (rota) con el local. Sólo válido si el roto es la nube.
     *  - 'usarNube'  → se pisa el local (roto) con la nube. Sólo válido si el roto es el local.
     * Una dirección que destruiría el lado sano lanza. Con motivo `version_futura` NO se
     * sobrescribe nada, en ningún sentido: la barrera vive acá, no en la UI.
     */
    async resolverConflictoDeCarga(direccion) {
      if (direccion !== 'usarNube' && direccion !== 'usarLocal') {
        throw new Error("resolverConflictoDeCarga: la dirección tiene que ser 'usarNube' o 'usarLocal'.");
      }
      if (!_conflicto) throw new Error('resolverConflictoDeCarga: no hay ningún conflicto de carga pendiente.');
      const { ladoRoto, motivo, candidato } = _conflicto;

      if (motivo === MOTIVO_VERSION_FUTURA) {
        throw new Error(`resolverConflictoDeCarga: el ${ladoRoto} es de una versión más nueva del juego; no se sobrescribe. Actualizá el juego.`);
      }
      if (ladoRoto === 'nube' && direccion === 'usarNube') {
        throw new Error("resolverConflictoDeCarga: la nube es la inválida; no se puede 'usarNube'.");
      }
      if (ladoRoto === 'local' && direccion === 'usarLocal') {
        throw new Error("resolverConflictoDeCarga: el local es el inválido; no se puede 'usarLocal'.");
      }

      if (ladoRoto === 'nube') {
        await adaptadorNube.guardarPartida(candidato); // si falla, lanza y el conflicto sigue pendiente
        _nubeBloqueada = null;
        _conflicto = null;
        _pendienteDeSync = false;
        return { estado: candidato };
      }
      await adaptadorLocal.guardarLocal(candidato);
      _localBloqueado = null;
      _conflicto = null;
      return { estado: candidato };
    },

    /**
     * Borra la partida inválida de este dispositivo cuando NO hay copia válida que ofrecer
     * (o el jugador prefiere empezar de cero). Nunca para `version_futura`.
     */
    async descartarLocalInvalido() {
      if (!_localBloqueado) throw new Error('descartarLocalInvalido: no hay una partida local inválida pendiente.');
      if (_localBloqueado.motivo === MOTIVO_VERSION_FUTURA) {
        throw new Error('descartarLocalInvalido: la partida local es de una versión más nueva del juego; no se borra. Actualizá el juego.');
      }
      await adaptadorLocal.borrarLocal();
      _localBloqueado = null;
      if (_conflicto?.ladoRoto === 'local') _conflicto = null;
    },

    /** Estado observable, para el panel de Fase 8. */
    estado() {
      return {
        pendienteDeSync: _pendienteDeSync,
        nubeBloqueada: _nubeBloqueada ? { ..._nubeBloqueada } : null,
        localBloqueado: _localBloqueado ? { ..._localBloqueado } : null,
        conflicto: _describirConflicto(),
      };
    },
  };
}
