/**
 * Fase 1 — Motor de Eventos.
 * Ver doc técnico Fase 1, sección 3.
 *
 * Diseño de estado (decidido en el chat de Fase 1, no está en los
 * documentos base): el motor es una INSTANCIA con estado encapsulado,
 * no un set de funciones sueltas. Esto lo pide la propia firma del doc
 * técnico para procesarTicks(estadoMundoActual, motorEventos) — pasar
 * "motorEventos" por referencia sólo tiene sentido si es un objeto con
 * métodos, no funciones puras sin estado.
 *
 * Responsabilidad heredada de Fase 0 (doc técnico Fase 0, sección 3.4,
 * campo Escena.eventosActivos: "Lo llena y mantiene la Fase 1"): cada
 * alta/baja de Evento sincroniza el array eventosActivos de la Escena
 * correspondiente. Por eso el motor necesita `escenas`, no sólo
 * `eventos`, en su estado inicial. listarEventosActivos NO lee de ahí
 * (filtra directo sobre los eventos, que es la fuente de verdad) — el
 * array de la Escena es una copia mantenida para quien quiera leerlo
 * sin pasar por este motor (ej. una vista rápida), no algo de lo que
 * este motor dependa para su propia lógica.
 *
 * Extensión de firma sobre el doc técnico: crearEvento y activarEvento
 * reciben un segundo parámetro opcional `estadoMundo`, necesario para
 * poder sellar `metadata.tickDeActivacion` (con qué comparar `duracion`
 * en revisarExpiraciones). El doc técnico no lo hacía explícito pero es
 * imprescindible para que la expiración por duración funcione.
 *
 * Mismo motivo detrás del parámetro `estadoMundoInicial` del factory:
 * un evento que llega YA activo en el `eventos` inicial (ej. cargado
 * desde el dataset ficticio de Fase 0, o el día de mañana desde una
 * partida guardada) nunca pasó por crearEvento en esta sesión, así que
 * no tiene tickDeActivacion propio. Sin este sello, revisarExpiraciones
 * lo compararía contra 0 y lo expiraría de inmediato la primera vez que
 * se llama (bug real, detectado corriendo los tests de este mismo
 * archivo — ver motorEventos.test.js). Se sella una sola vez, al
 * construir el motor, tratando "recién cargado" como "recién activado".
 */

import { crearEvento as construirEvento } from '../modelos/evento.js';
import { validarEstructura } from '../validacion/validarEstructura.js';
import { evaluadoresExpiracionPorDefecto } from './evaluadoresExpiracion.js';

/**
 * @param {object} config
 * @param {import('../modelos/evento.js').Evento[]} [config.eventos] - Estado inicial. No se re-valida
 *   (se asume ya validado por Fase 0, ej. viene de un fixture o de una partida guardada). Sirve
 *   también para simular en tests un evento inconsistente "que llegó por otra vía" (ver 3.2, punto 4).
 * @param {import('../modelos/escena.js').Escena[]} [config.escenas] - Para mantener eventosActivos sincronizado.
 * @param {import('../modelos/jugador.js').Jugador} [config.jugador] - Para contexto de evaluadores.
 * @param {import('../modelos/npc.js').NPC[]} [config.npcs] - Para contexto de evaluadores (resolución de evento.metadata.npcId).
 * @param {Object<string, function>} [config.evaluadoresExpiracion] - Se mergea sobre los de referencia (los sobreescribe por nombre).
 */
export function crearMotorDeEventos({
  eventos = [],
  escenas = [],
  jugador = null,
  npcs = [],
  evaluadoresExpiracion = {},
  estadoMundoInicial = null,
} = {}) {
  const _eventos = [...eventos];

  // Backfill: un evento que llega ya activo sin tickDeActivacion propio
  // se trata como "recién activado ahora" (ver nota arriba).
  for (const evento of _eventos) {
    if (evento.activo && evento.metadata && evento.metadata.tickDeActivacion === undefined) {
      evento.metadata.tickDeActivacion = estadoMundoInicial?.ticksTranscurridos ?? 0;
      evento.metadata.diaDeActivacion = estadoMundoInicial?.diaActual ?? 0;
    }
  }

  const _escenasPorId = new Map(escenas.map((e) => [e.id, e]));
  const _npcsPorId = new Map(npcs.map((n) => [n.id, n]));
  const _jugador = jugador;
  const _evaluadores = { ...evaluadoresExpiracionPorDefecto, ...evaluadoresExpiracion };

  function _buscar(eventoId) {
    const evento = _eventos.find((e) => e.id === eventoId);
    if (!evento) {
      throw new Error(`Motor de Eventos: no existe un evento con id '${eventoId}'.`);
    }
    return evento;
  }

  function _sincronizarEscena(escenaId, eventoId, activo) {
    const escena = _escenasPorId.get(escenaId);
    if (!escena) return; // referencial — no es responsabilidad de este motor (ver doc técnico, sección 5)
    const idx = escena.eventosActivos.indexOf(eventoId);
    if (activo && idx === -1) escena.eventosActivos.push(eventoId);
    if (!activo && idx !== -1) escena.eventosActivos.splice(idx, 1);
  }

  /**
   * Forma del contexto que reciben los evaluadores de condición.
   * Ver core/eventos/evaluadoresExpiracion.js para el detalle de cada clave.
   */
  function _construirContexto(evento, estadoMundo) {
    const npcId = evento.metadata?.npcId;
    return {
      evento,
      estadoMundo,
      escena: _escenasPorId.get(evento.escenaId),
      jugador: _jugador,
      npc: npcId ? _npcsPorId.get(npcId) : undefined,
      eventoActivadoEnDia: evento.metadata?.diaDeActivacion,
    };
  }

  function crearEvento(datosEvento, estadoMundo) {
    const activo = datosEvento.activo ?? true;
    const metadataInicial = { ...(datosEvento.metadata ?? {}) };
    if (activo) {
      metadataInicial.tickDeActivacion = estadoMundo?.ticksTranscurridos ?? 0;
      metadataInicial.diaDeActivacion = estadoMundo?.diaActual ?? 0;
    }

    const evento = construirEvento({ ...datosEvento, metadata: metadataInicial });
    const { valido, errores } = validarEstructura('Evento', evento);
    if (!valido) return { evento: null, errores };

    _eventos.push(evento);
    if (evento.activo) _sincronizarEscena(evento.escenaId, evento.id, true);
    return { evento, errores: [] };
  }

  function activarEvento(eventoId, estadoMundo) {
    const evento = _buscar(eventoId);
    evento.activo = true;
    evento.metadata.tickDeActivacion = estadoMundo?.ticksTranscurridos ?? evento.metadata.tickDeActivacion ?? 0;
    evento.metadata.diaDeActivacion = estadoMundo?.diaActual ?? evento.metadata.diaDeActivacion ?? 0;
    _sincronizarEscena(evento.escenaId, evento.id, true);
    return evento;
  }

  function desactivarEvento(eventoId, motivo) {
    const evento = _buscar(eventoId);
    evento.activo = false;
    evento.metadata.motivoDesactivacion = motivo;
    _sincronizarEscena(evento.escenaId, evento.id, false);
    return evento;
  }

  function listarEventosActivos(escenaId) {
    return _eventos.filter((e) => e.escenaId === escenaId && e.activo);
  }

  function revisarExpiraciones(estadoMundo) {
    const desactivados = [];

    for (const evento of [..._eventos]) {
      if (!evento.activo) continue;

      // Salvaguarda (doc técnico Fase 1, 3.2 punto 4): esto no debería
      // pasar nunca vía crearEvento (validarEstructura ya lo rechaza),
      // pero si un evento llega acá así por otra vía, se reporta y se
      // desactiva de oficio en vez de dejarlo corriendo para siempre.
      if (evento.duracion === null && evento.condicionExpiracion === null) {
        evento.metadata.inconsistenciaDetectada = 'duracion_y_condicionExpiracion_ambos_null';
        desactivarEvento(evento.id, 'salvaguarda_sin_forma_de_expirar');
        desactivados.push(evento);
        continue;
      }

      let debeExpirar = false;
      let motivo = null;

      if (evento.duracion !== null) {
        const tickActivacion = evento.metadata.tickDeActivacion ?? 0;
        if (estadoMundo.ticksTranscurridos - tickActivacion >= evento.duracion) {
          debeExpirar = true;
          motivo = 'duracion_cumplida';
        }
      }

      if (!debeExpirar && evento.condicionExpiracion !== null) {
        const evaluador = _evaluadores[evento.condicionExpiracion];
        if (evaluador && evaluador(_construirContexto(evento, estadoMundo))) {
          debeExpirar = true;
          motivo = 'condicion_cumplida';
        }
      }

      if (debeExpirar) {
        desactivarEvento(evento.id, motivo);
        desactivados.push(evento);
      }
    }

    return desactivados;
  }

  function registrarEvaluadorExpiracion(nombre, fn) {
    _evaluadores[nombre] = fn;
  }

  /**
   * Extensión aditiva para Fase 4 (ver fase_4_ADENDUM.md, sección 1;
   * nota correspondiente en doc técnico Fase 1, sección 3.1).
   *
   * Semántica B, no A: "existió alguna vez" significa que el evento
   * estuvo ACTIVO al menos una vez (está activo ahora, o lo estuvo y
   * se desactivó después) — no simplemente que exista un registro para
   * ese id. Un evento creado con `activo:false` y nunca activado
   * (latente, nunca disparado) devuelve false acá, aunque exista en
   * `_eventos`.
   *
   * Implementación: `metadata.tickDeActivacion` sólo se sella cuando el
   * evento pasa por `crearEvento` con `activo:true` o por
   * `activarEvento` — es exactamente la marca de "esto se activó
   * alguna vez", ya la usa el resto del motor con ese sentido.
   *
   * Id inexistente → false (no revienta): quien llama esto suele ser
   * lógica de revelación de secretos (Fase 4), no una operación que
   * necesite un evento real para actuar — un id que no existe
   * simplemente "no pasó", no es un error del llamador.
   */
  function existioAlgunaVez(eventoId) {
    const evento = _eventos.find((e) => e.id === eventoId);
    return evento?.metadata?.tickDeActivacion !== undefined;
  }

  /**
   * Extensión aditiva de Fase 7 (ver fase_7_ADENDUM.md, sección 3): todos
   * los eventos que conoce el motor, activos e inactivos, en orden de
   * creación. Los inactivos importan para `existioAlgunaVez` (Fase 4), así
   * que una partida guardada tiene que poder llevárselos. Devuelve un
   * array nuevo pero con las MISMAS referencias a los objetos Evento (igual
   * que `listarEventosActivos`); quien persiste hace su propia copia
   * profunda.
   */
  function listarTodos() {
    return [..._eventos];
  }

  return {
    crearEvento,
    activarEvento,
    desactivarEvento,
    listarEventosActivos,
    listarTodos,
    revisarExpiraciones,
    registrarEvaluadorExpiracion,
    existioAlgunaVez,
  };
}
