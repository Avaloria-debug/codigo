/**
 * Fase 7 — Validación de un `EstadoCompleto` al CARGAR (y también antes de
 * persistir: es mejor rechazar un guardado inválido al escribirlo que
 * descubrirlo mañana).
 *
 * Devuelve siempre `{ valido, motivo, errores }`, nunca lanza por datos malos:
 *   - `version_futura`: `versionEsquema` mayor a la soportada. Se chequea
 *     PRIMERO: un documento de un cliente más nuevo puede tener otra forma, y
 *     no tiene sentido validarlo contra el esquema viejo. Nunca se sobrescribe.
 *   - `estructura`: forma incorrecta (campos, tipos, entidades, estado interno).
 *   - `referencias`: forma correcta pero inconsistente (ids que no existen,
 *     estado emocional incoherente con los ejes, etc.). Sólo se evalúa si la
 *     estructura está bien, porque los validadores referenciales asumen forma.
 *
 * Decisión 4 (addendum): rechazo total, sin carga parcial y sin reparación.
 */

import { validarEstructura } from '../core/validacion/validarEstructura.js';
import { validarReferencias } from '../core/validacion/validarReferencias.js';
import { proyectarEstadoEmocional, NIVEL_TEMOR_MIN, NIVEL_TEMOR_MAX, NIVEL_DISPOSICION_MIN, NIVEL_DISPOSICION_MAX } from '../core/npcs/proyeccionEstadoEmocional.js';
import {
  CAMPOS_ESTADO_COMPLETO,
  VERSION_ESQUEMA,
  MOTIVO_VERSION_FUTURA,
  MOTIVO_ESTRUCTURA,
  MOTIVO_REFERENCIAS,
} from './constantes.js';
import { esCodigoPartidaValido } from './codigoPartida.js';

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function resultado(motivo, errores) {
  return { valido: motivo === null, motivo, errores };
}

function validarColeccion(tipo, etiqueta, items, errores) {
  if (!Array.isArray(items)) {
    errores.push(`${etiqueta}: tiene que ser un array.`);
    return;
  }
  const vistos = new Set();
  items.forEach((item, i) => {
    const r = validarEstructura(tipo, item);
    for (const e of r.errores) errores.push(`${etiqueta}[${i}]: ${e}`);
    if (esObjeto(item) && typeof item.id === 'string') {
      if (vistos.has(item.id)) errores.push(`${etiqueta}: id duplicado '${item.id}'.`);
      vistos.add(item.id);
    }
  });
}

function validarEstadoInterno(estado, errores) {
  const npcIds = Array.isArray(estado.npcs) ? estado.npcs.filter(esObjeto).map((n) => n.id) : [];
  const sucesoIds = Array.isArray(estado.sucesos) ? estado.sucesos.filter(esObjeto).map((s) => s.id) : [];

  const ejes = estado.estadoInternoNPCs?.ejes;
  if (!esObjeto(estado.estadoInternoNPCs) || !esObjeto(ejes)) {
    errores.push('estadoInternoNPCs.ejes: tiene que ser un objeto indexado por id de NPC.');
  } else {
    for (const id of npcIds) {
      if (!(id in ejes)) errores.push(`estadoInternoNPCs.ejes: falta la entrada del NPC '${id}'.`);
    }
    for (const [id, datos] of Object.entries(ejes)) {
      if (!npcIds.includes(id)) {
        errores.push(`estadoInternoNPCs.ejes: '${id}' no es un NPC de la partida.`);
        continue;
      }
      const { nivelTemor, nivelDisposicion } = datos ?? {};
      if (!Number.isInteger(nivelTemor) || nivelTemor < NIVEL_TEMOR_MIN || nivelTemor > NIVEL_TEMOR_MAX) {
        errores.push(`estadoInternoNPCs.ejes['${id}'].nivelTemor: entero entre ${NIVEL_TEMOR_MIN} y ${NIVEL_TEMOR_MAX}.`);
      }
      if (!Number.isInteger(nivelDisposicion) || nivelDisposicion < NIVEL_DISPOSICION_MIN || nivelDisposicion > NIVEL_DISPOSICION_MAX) {
        errores.push(`estadoInternoNPCs.ejes['${id}'].nivelDisposicion: entero entre ${NIVEL_DISPOSICION_MIN} y ${NIVEL_DISPOSICION_MAX}.`);
      }
    }
  }

  const internos = estado.estadoInternoSucesos?.sucesos;
  if (!esObjeto(estado.estadoInternoSucesos) || !esObjeto(internos)) {
    errores.push('estadoInternoSucesos.sucesos: tiene que ser un objeto indexado por id de suceso.');
  } else {
    for (const id of sucesoIds) {
      if (!(id in internos)) errores.push(`estadoInternoSucesos.sucesos: falta la entrada del suceso '${id}'.`);
    }
    for (const [id, datos] of Object.entries(internos)) {
      if (!sucesoIds.includes(id)) {
        errores.push(`estadoInternoSucesos.sucesos: '${id}' no es un suceso de la partida.`);
        continue;
      }
      if (!Number.isFinite(datos?.ultimoTickProcesado)) {
        errores.push(`estadoInternoSucesos.sucesos['${id}'].ultimoTickProcesado: número finito.`);
      }
    }
  }
}

/**
 * @param {unknown} estado - Lo leído de disco/nube, sin confiar en nada.
 * @param {{ objetos: object[] }} opciones - `objetos` es el catálogo estático (data/), necesario para
 *   validar referencias de inventario/escenas. No forma parte de EstadoCompleto.
 * @returns {{ valido: boolean, motivo: string|null, errores: string[] }}
 */
export function validarEstadoCompleto(estado, { objetos } = {}) {
  if (!Array.isArray(objetos)) {
    throw new Error('validarEstadoCompleto: `objetos` (catálogo estático) es obligatorio para validar referencias.');
  }
  if (!esObjeto(estado)) return resultado(MOTIVO_ESTRUCTURA, ['El estado guardado tiene que ser un objeto.']);

  // 1) Versión primero.
  if (Number.isFinite(estado.versionEsquema) && estado.versionEsquema > VERSION_ESQUEMA) {
    return resultado(MOTIVO_VERSION_FUTURA, [
      `versionEsquema ${estado.versionEsquema} es más nueva que la soportada (${VERSION_ESQUEMA}); actualizá el juego antes de abrir esta partida.`,
    ]);
  }

  // 2) Estructura.
  const errores = [];
  for (const clave of Object.keys(estado)) {
    if (!CAMPOS_ESTADO_COMPLETO.includes(clave)) errores.push(`Campo desconocido '${clave}'.`);
  }
  for (const campo of CAMPOS_ESTADO_COMPLETO) {
    if (!(campo in estado)) errores.push(`Falta el campo '${campo}'.`);
  }
  if (errores.length > 0) return resultado(MOTIVO_ESTRUCTURA, errores);

  if (!Number.isInteger(estado.versionEsquema) || estado.versionEsquema < 1) {
    errores.push('versionEsquema: entero mayor o igual a 1.');
  } else if (estado.versionEsquema < VERSION_ESQUEMA) {
    errores.push(`versionEsquema ${estado.versionEsquema} es anterior a la soportada (${VERSION_ESQUEMA}) y todavía no hay migración.`);
  }
  if (!esCodigoPartidaValido(estado.codigoPartida)) errores.push('codigoPartida: formato inválido.');
  if (!Number.isFinite(estado.ultimaModificacion)) errores.push('ultimaModificacion: número finito (epoch en ms).');

  const rJugador = validarEstructura('Jugador', estado.jugador);
  for (const e of rJugador.errores) errores.push(`jugador: ${e}`);
  const rMundo = validarEstructura('EstadoDelMundo', estado.estadoMundo);
  for (const e of rMundo.errores) errores.push(`estadoMundo: ${e}`);
  validarColeccion('NPC', 'npcs', estado.npcs, errores);
  validarColeccion('Escena', 'escenas', estado.escenas, errores);
  validarColeccion('Evento', 'eventos', estado.eventos, errores);
  validarColeccion('Suceso', 'sucesos', estado.sucesos, errores);
  validarEstadoInterno(estado, errores);

  if (errores.length > 0) return resultado(MOTIVO_ESTRUCTURA, errores);

  // 3) Referencias y coherencia entre colecciones.
  const dataset = {
    jugador: estado.jugador,
    npcs: estado.npcs,
    escenas: estado.escenas,
    eventos: estado.eventos,
    sucesos: estado.sucesos,
    estadoDelMundo: estado.estadoMundo,
    objetos,
  };
  const porTipo = [
    ['Jugador', 'jugador', [estado.jugador]],
    ['NPC', 'npcs', estado.npcs],
    ['Escena', 'escenas', estado.escenas],
    ['Evento', 'eventos', estado.eventos],
    ['Suceso', 'sucesos', estado.sucesos],
  ];
  for (const [tipo, etiqueta, items] of porTipo) {
    items.forEach((item, i) => {
      const r = validarReferencias(tipo, item, dataset);
      const sufijo = etiqueta === 'jugador' ? '' : `[${i}]`;
      for (const e of r.errores) errores.push(`${etiqueta}${sufijo}: ${e}`);
    });
  }

  // Objetos: validarReferencias (Fase 0) sigue sin chequear objetoId contra el catálogo — su
  // nota de cabecera quedó de antes de que Fase 3 canonizara `Objeto` (ver fase_7_ADENDUM.md,
  // sección 7). Se cubre acá, en la capa de Fase 7, sin tocar Fase 0.
  const idsObjetos = new Set(objetos.map((o) => o?.id));
  estado.jugador.inventario.forEach((item, i) => {
    if (!idsObjetos.has(item.objetoId)) errores.push(`jugador.inventario[${i}]: el objeto '${item.objetoId}' no está en el catálogo.`);
  });
  for (const escena of estado.escenas) {
    escena.objetosPresentes.forEach((objetoId, i) => {
      if (!idsObjetos.has(objetoId)) errores.push(`escenas['${escena.id}'].objetosPresentes[${i}]: el objeto '${objetoId}' no está en el catálogo.`);
    });
  }

  // escena.eventosActivos tiene que coincidir con los eventos realmente activos en ella.
  for (const escena of estado.escenas) {
    const esperados = estado.eventos.filter((e) => e.escenaId === escena.id && e.activo).map((e) => e.id).sort();
    const reales = [...escena.eventosActivos].sort();
    if (JSON.stringify(esperados) !== JSON.stringify(reales)) {
      errores.push(`escenas['${escena.id}'].eventosActivos [${reales.join(', ')}] no coincide con los eventos activos en ella [${esperados.join(', ')}].`);
    }
  }

  // estadoEmocional proyectado tiene que ser coherente con los ejes (el bug de carga que motivó la fase).
  for (const npc of estado.npcs) {
    const ejes = estado.estadoInternoNPCs.ejes[npc.id];
    const esperado = proyectarEstadoEmocional(ejes.nivelTemor, ejes.nivelDisposicion);
    if (npc.estadoEmocional !== esperado) {
      errores.push(`npcs['${npc.id}'].estadoEmocional '${npc.estadoEmocional}' no coincide con la proyección de sus ejes ('${esperado}').`);
    }
  }

  // Un suceso no puede haber procesado ticks que todavía no pasaron.
  for (const [id, datos] of Object.entries(estado.estadoInternoSucesos.sucesos)) {
    if (datos.ultimoTickProcesado > estado.estadoMundo.ticksTranscurridos) {
      errores.push(`estadoInternoSucesos.sucesos['${id}'].ultimoTickProcesado (${datos.ultimoTickProcesado}) es posterior a ticksTranscurridos (${estado.estadoMundo.ticksTranscurridos}).`);
    }
  }

  return errores.length > 0 ? resultado(MOTIVO_REFERENCIAS, errores) : resultado(null, []);
}
