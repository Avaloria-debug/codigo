/**
 * Fase 4 — Motor de NPCs (estado emocional, relación, memoria hacia
 * el jugador). Ver doc técnico Fase 4 + fase_4_ADENDUM.md.
 *
 * Mismo patrón que crearMotorDeEventos / crearMotorDeSucesos: factory
 * con estado encapsulado en closures, no una clase.
 *
 * Estado interno NO expuesto en el esquema NPC de Fase 0 (doc
 * técnico, sección 2): nivelTemor y nivelDisposicion viven acá, en un
 * Map por npcId — no en el objeto NPC. Lo único que este motor
 * escribe de vuelta al NPC es `estadoEmocional` (el string ya
 * proyectado) y, cuando corresponde, `relacion.valor` /
 * `relacion.historialRelevante` (esos sí son parte del esquema de
 * Fase 0).
 *
 * `motorEventos` es una dependencia obligatoria, no un default vacío
 * razonable: hace falta tanto para `conocimientosRevelablesDe`
 * (existioAlgunaVez) como para la exclusión de "NPC fuente de la
 * amenaza" en `procesarEventosDeMundo` (metadata.npcId — ver
 * fase_4_ADENDUM.md, sección 3, para el detalle completo de esa
 * decisión).
 *
 * Sin backfill de nivelTemor/nivelDisposicion al estilo
 * `estadoMundoInicial` de Fase 1: todo NPC arranca en (0, 0), sin
 * importar qué `estadoEmocional` traiga ya escrito el fixture. El
 * motor tampoco recalcula/pisa `estadoEmocional` al construirse —
 * sólo lo hace cuando corre una transición real (acción o evento de
 * mundo). Con el dataset actual da igual (los 3 NPCs arrancan
 * "neutral"), pero evita que un NPC futuro precargado con un
 * `estadoEmocional` no-neutral (lore real, partida guardada) se
 * resetee de arranque sin que haya pasado nada en la sesión.
 */

import { registroCategoriasEventoPorDefecto } from '../comprensionMundo/registroCategoriasEvento.js';
import { registroTransicionesPorVerboPorDefecto } from './registroTransicionesPorVerbo.js';
import {
  proyectarEstadoEmocional,
  clampTemor,
  NIVEL_TEMOR_MIN,
  NIVEL_TEMOR_MAX,
  NIVEL_DISPOSICION_MIN,
  NIVEL_DISPOSICION_MAX,
} from './proyeccionEstadoEmocional.js';
import { clampRelacion, moderarDelta } from './categoriasRelacion.js';
import { conocimientosRevelables as _conocimientosRevelables } from './conocimientosRevelables.js';

/**
 * @param {object} config
 * @param {import('../modelos/npc.js').NPC[]} [config.npcs]
 * @param {import('../modelos/escena.js').Escena[]} [config.escenas]
 * @param {{ listarEventosActivos: Function, existioAlgunaVez: Function }} config.motorEventos - Obligatorio.
 * @param {Object<string, {categoriaEstado: string, intensidad: number}>} [config.registroCategoriasEvento]
 * @param {Object<string, Function>} [config.registroTransicionesPorVerbo]
 */
export function crearMotorDeNPCs({
  npcs = [],
  escenas = [],
  motorEventos,
  registroCategoriasEvento = registroCategoriasEventoPorDefecto,
  registroTransicionesPorVerbo = registroTransicionesPorVerboPorDefecto,
  estadoInternoInicial = null,
} = {}) {
  if (!motorEventos) {
    throw new Error(
      'Motor de NPCs: motorEventos es obligatorio (existioAlgunaVez para conocimientos, ' +
        'metadata.npcId para la exclusión de NPC fuente de amenaza).'
    );
  }

  const _npcsPorId = new Map(npcs.map((n) => [n.id, n]));
  const _escenasPorId = new Map(escenas.map((e) => [e.id, e]));
  const _ejesPorNpcId = new Map(npcs.map((n) => [n.id, { nivelTemor: 0, nivelDisposicion: 0 }]));

  // Extensión aditiva de Fase 7 (fase_7_ADENDUM.md, sección 3): restaurar los
  // ejes exportados por `exportarEstadoInterno()`. Un NPC sin entrada queda en
  // (0, 0) como siempre (compatibilidad con todo lo anterior a Fase 7). Falla
  // fuerte ante ids desconocidos o ejes fuera de rango/no enteros; la
  // validación con reportes vive en persistencia/, esto es la segunda línea.
  if (estadoInternoInicial !== null && estadoInternoInicial !== undefined) {
    const guardados = estadoInternoInicial.ejes;
    if (guardados === null || typeof guardados !== 'object' || Array.isArray(guardados)) {
      throw new Error('Motor de NPCs: estadoInternoInicial.ejes tiene que ser un objeto indexado por id de NPC.');
    }
    for (const [id, datos] of Object.entries(guardados)) {
      if (!_ejesPorNpcId.has(id)) {
        throw new Error(`Motor de NPCs: estadoInternoInicial menciona '${id}', que no es un NPC conocido.`);
      }
      const { nivelTemor, nivelDisposicion } = datos ?? {};
      if (!Number.isInteger(nivelTemor) || nivelTemor < NIVEL_TEMOR_MIN || nivelTemor > NIVEL_TEMOR_MAX) {
        throw new Error(`Motor de NPCs: estadoInternoInicial['${id}'].nivelTemor tiene que ser un entero entre ${NIVEL_TEMOR_MIN} y ${NIVEL_TEMOR_MAX}.`);
      }
      if (!Number.isInteger(nivelDisposicion) || nivelDisposicion < NIVEL_DISPOSICION_MIN || nivelDisposicion > NIVEL_DISPOSICION_MAX) {
        throw new Error(`Motor de NPCs: estadoInternoInicial['${id}'].nivelDisposicion tiene que ser un entero entre ${NIVEL_DISPOSICION_MIN} y ${NIVEL_DISPOSICION_MAX}.`);
      }
      _ejesPorNpcId.set(id, { nivelTemor, nivelDisposicion });
    }
  }

  function _buscarNpc(npcId) {
    const npc = _npcsPorId.get(npcId);
    if (!npc) throw new Error(`Motor de NPCs: no existe un NPC con id '${npcId}'.`);
    return npc;
  }

  function _ejesDe(npcId) {
    let ejes = _ejesPorNpcId.get(npcId);
    if (!ejes) {
      ejes = { nivelTemor: 0, nivelDisposicion: 0 };
      _ejesPorNpcId.set(npcId, ejes);
    }
    return ejes;
  }

  function _sincronizarEstadoEmocional(npc, ejes) {
    npc.estadoEmocional = proyectarEstadoEmocional(ejes.nivelTemor, ejes.nivelDisposicion);
  }

  /**
   * ¿Hay un evento activo en `escena`, categorizado peligroso/combate
   * (registro de Fase 2), cuyo metadata.npcId sea este NPC? La
   * ausencia de metadata.npcId en un evento se trata como amenaza
   * externa (comportamiento por defecto, no hace falta que el evento
   * declare explícitamente que no es de ningún NPC) — ver doc técnico
   * Fase 4, sección 4.2.
   *
   * Simplificación documentada (fase_4_ADENDUM.md, sección 3): el
   * chequeo es a nivel de escena (¿existe AL MENOS UN evento
   * calificado con este npcId?), no resta la contribución puntual de
   * ese evento del puntaje agregado de Fase 2. Si hubiera otra
   * amenaza activa independiente en la misma escena, este chequeo
   * igual da "es fuente" y suprime el temor por completo para esa
   * evaluación. No pasa con el dataset actual (nunca hay dos amenazas
   * simultáneas en un mismo fixture); queda anotado para cuando entre
   * lore real con escenas más cargadas.
   */
  function _esFuenteDeAmenaza(npc, escena) {
    const eventosActivos = motorEventos.listarEventosActivos(escena.id);
    return eventosActivos.some((evento) => {
      const entrada = registroCategoriasEvento[evento.tipo];
      const esAmenaza = entrada && (entrada.categoriaEstado === 'peligroso' || entrada.categoriaEstado === 'combate');
      return esAmenaza && evento.metadata?.npcId === npc.id;
    });
  }

  /**
   * Doc técnico, sección 4.1: por acción del jugador. No-op
   * silencioso (no es un reporte, es un caso válido y esperado) si
   * `npcObjetivoId` es null — 4.1 sólo aplica "con npcObjetivoId no
   * nulo".
   *
   * @param {object} accionResuelta - Ver doc técnico, sección 0.1.
   * @returns {{ npc: object|null, deltaRelacionAplicado: number, reportes: string[] }}
   */
  function procesarAccionResuelta(accionResuelta) {
    if (accionResuelta.npcObjetivoId == null) {
      return { npc: null, deltaRelacionAplicado: 0, reportes: [] };
    }

    const npc = _buscarNpc(accionResuelta.npcObjetivoId);
    const transicion = registroTransicionesPorVerbo[accionResuelta.verboId];

    if (!transicion) {
      return {
        npc,
        deltaRelacionAplicado: 0,
        reportes: [`Motor de NPCs: verboId sin transición registrada: '${accionResuelta.verboId}'.`],
      };
    }

    const ejes = _ejesDe(npc.id);
    const resultado = transicion(accionResuelta.resultado, ejes, accionResuelta.opcionElegidaId);

    const deltaAplicado = resultado.deltaRelacion === 0 ? 0 : moderarDelta(resultado.deltaRelacion, npc.relacion.valor);

    npc.relacion.valor = clampRelacion(npc.relacion.valor + deltaAplicado);
    if (deltaAplicado !== 0) {
      // Formato documentado en fase_4_ADENDUM.md, punto 8 (nunca se
      // había escrito fuera del código hasta esa corrección). `eventoId`
      // no es un ID de Evento real (esto viene de una AccionResuelta,
      // no de Fase 1) — string sintético a propósito, mismo criterio
      // que documenta el punto 8 para dejar claro el origen sin agregar
      // un campo nuevo al esquema de Fase 0.
      npc.relacion.historialRelevante.push({
        eventoId: `accion:${accionResuelta.verboId}`,
        delta: deltaAplicado,
        momento: `tick:${accionResuelta.tick}`,
      });
    }

    ejes.nivelTemor = clampTemor(resultado.nivelTemor);
    ejes.nivelDisposicion = resultado.nivelDisposicion; // ya viene clampeado desde el registro de transiciones
    _sincronizarEstadoEmocional(npc, ejes);

    return { npc, deltaRelacionAplicado: deltaAplicado, reportes: [] };
  }

  /**
   * Doc técnico, sección 4.2: eventos del mundo, sin acción directa
   * del jugador. Sólo toca nivelTemor — nunca relacion.valor ni
   * nivelDisposicion (declarado explícito en el doc). Recorre todos
   * los NPCs con `ubicacionActual` no nulo.
   *
   * OJO, no idempotente a propósito: el doc dice "decae un nivel por
   * cada vez que se evalúa, no vuelve a 0 de golpe" — llamar esto dos
   * veces seguidas sin que cambie `estadoCalculado` decae el temor
   * dos veces. A diferencia de motorEventos/motorSucesos (que sí son
   * idempotentes contra ticksTranscurridos), acá cada llamada
   * representa una evaluación real — es la semántica documentada, no
   * un descuido.
   */
  function procesarEventosDeMundo() {
    for (const npc of _npcsPorId.values()) {
      if (npc.ubicacionActual == null) continue;
      const escena = _escenasPorId.get(npc.ubicacionActual);
      if (!escena) continue;

      const ejes = _ejesDe(npc.id);
      const estado = escena.estadoCalculado;
      const esAmenazaPropia = (estado === 'peligroso' || estado === 'combate') && _esFuenteDeAmenaza(npc, escena);

      if (estado === 'combate' && !esAmenazaPropia) {
        ejes.nivelTemor = 2;
      } else if (estado === 'peligroso' && !esAmenazaPropia) {
        ejes.nivelTemor = Math.max(ejes.nivelTemor, 1);
      } else if (!esAmenazaPropia && estado !== 'combate' && estado !== 'peligroso') {
        ejes.nivelTemor = clampTemor(ejes.nivelTemor - 1);
      }
      // Si esAmenazaPropia: no se toca nivelTemor en ninguna
      // dirección esta vuelta (ni sube ni decae) — mientras la escena
      // siga peligroso/combate por causa propia del NPC, su temor
      // queda en pausa; decae recién cuando deje de estarlo.

      _sincronizarEstadoEmocional(npc, ejes);
    }
  }

  /**
   * Método de conveniencia: resuelve el NPC por id y delega en la
   * función pura `conocimientosRevelables` (conocimientosRevelables.js).
   * @param {string} npcId
   * @param {object} [jugador]
   */
  function conocimientosRevelablesDe(npcId, jugador = null) {
    const npc = _buscarNpc(npcId);
    return _conocimientosRevelables(npc, jugador, motorEventos);
  }

  /**
   * Sólo para tests/debug: expone los ejes internos de un NPC sin
   * pasar por la proyección. No es parte del contrato "de
   * producción" del motor — nada fuera de tests debería necesitar
   * leer nivelTemor/nivelDisposicion directamente en vez de
   * `npc.estadoEmocional`.
   */
  function obtenerEjesInternos(npcId) {
    const ejes = _ejesPorNpcId.get(npcId);
    return ejes ? { ...ejes } : undefined;
  }

  /**
   * Extensión aditiva de Fase 7: los ejes internos de TODOS los NPCs como
   * JSON plano indexado por id — nunca el Map crudo. A diferencia de
   * `obtenerEjesInternos` (sólo tests/debug), ésta SÍ es contrato de
   * producción: sin ella, una partida cargada arranca con los ejes en (0, 0)
   * y `estadoEmocional` (el string proyectado) queda incoherente con ellos.
   * @returns {{ ejes: Object<string, {nivelTemor: number, nivelDisposicion: number}> }}
   */
  function exportarEstadoInterno() {
    const ejes = {};
    for (const [id, valores] of _ejesPorNpcId.entries()) {
      ejes[id] = { nivelTemor: valores.nivelTemor, nivelDisposicion: valores.nivelDisposicion };
    }
    return { ejes };
  }

  return {
    procesarAccionResuelta,
    procesarEventosDeMundo,
    conocimientosRevelablesDe,
    obtenerEjesInternos,
    exportarEstadoInterno,
  };
}
