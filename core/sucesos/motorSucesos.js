/**
 * Fase 1 — Motor de Sucesos (emergentes).
 * Ver doc técnico Fase 1, sección 4.
 *
 * Decisión de arquitectura (ver chat): misma que Motor de Eventos —
 * instancia con estado encapsulado, no funciones sueltas. Lo pide la
 * propia firma procesarTicks(estadoMundoActual, motorEventos): recibe
 * al motor de eventos POR REFERENCIA para poder crear el evento
 * resultante al resolver un Suceso.
 *
 * Resolución del hallazgo bloqueante (ver chat, confirmado antes de
 * construir): el doc técnico (sección 4.4) asumía que Suceso tenía un
 * campo `metadata` abierto donde guardar `eventoGeneradoSiResuelveAnticipado`
 * — eso es falso, ni el esquema de Fase 0 ni validarEstructura le dan
 * metadata a Suceso (sólo Evento lo tiene). Se resuelve tratando ese
 * dato exactamente igual que `ultimoTickProcesado`, que el propio doc
 * técnico YA describe como "campo interno del motor, no del esquema de
 * datos de Fase 0": ambos viven acá, en `_estadoInterno` (Map indexado
 * por sucesoId), y nunca se mezclan con el objeto Suceso que pasa por
 * validarEstructura. Cero cambios sobre el esquema ya entregado.
 *
 * Extensiones de firma sobre el doc técnico (mismo motivo que en
 * motorEventos.js): crearSuceso recibe `estadoMundo` para sellar
 * ultimoTickProcesado; resolverSuceso recibe `estadoMundoActual` además
 * de motorEventos, porque lo necesita para pasárselo a
 * motorEventos.crearEvento() al generar el evento resultante.
 *
 * Mismo backfill que en Motor de Eventos: un Suceso que llega ya activo
 * en el `sucesos` inicial (ej. suceso_escasez_001 del dataset de Fase 0,
 * con progreso:40 ya cargado) no tiene ultimoTickProcesado propio. Sin
 * sellarlo a "ahora" en la construcción, la primera llamada a
 * procesarTicks le aplicaría TODOS los ticks transcurridos desde el
 * tick 0 del mundo de una sola vez, no sólo los que pasan de ahí en
 * adelante — mismo bug que con tickDeActivacion en Motor de Eventos,
 * corregido acá desde el vamos.
 *
 * Cómo se resuelve el "eventoGeneradoAlResolver es un solo valor fijo"
 * (doc técnico, 4.4): además de `eventoGeneradoSiResuelveAnticipado`,
 * `_estadoInterno` también guarda `duracionEventoGenerado` y
 * `condicionExpiracionEventoGenerado` — Fase 0 exige que un Evento no
 * tenga ambos en null, y `eventoGeneradoAlResolver`/
 * `eventoGeneradoSiResuelveAnticipado` son sólo un TIPO de evento, no
 * una plantilla completa. Si el llamador no especifica ninguno de los
 * dos, se usa un default razonable (DURACION_POR_DEFECTO_EVENTO_GENERADO)
 * — supuesto propio de esta fase, documentado acá, no en ningún doc base.
 */

import { crearSuceso as construirSuceso } from '../modelos/suceso.js';
import { validarEstructura } from '../validacion/validarEstructura.js';
import { evaluadoresResolucionPorDefecto } from './evaluadoresResolucion.js';

const DURACION_POR_DEFECTO_EVENTO_GENERADO = 24; // 1 tick = 1 hora (ver avanzarTicks.js): ~1 día.

/**
 * @param {object} config
 * @param {import('../modelos/suceso.js').Suceso[]} [config.sucesos] - Estado inicial, no se re-valida.
 * @param {import('../modelos/escena.js').Escena[]} [config.escenas] - Para resolver "escenas relevantes" de un Suceso global.
 * @param {import('../modelos/jugador.js').Jugador} [config.jugador] - Para contexto de evaluadores de resolución.
 * @param {import('../modelos/npc.js').NPC[]} [config.npcs] - Para contexto de evaluadores de resolución.
 * @param {Object<string, function>} [config.evaluadoresResolucion] - Se mergea sobre los de referencia.
 * @param {import('../modelos/estadoDelMundo.js').EstadoDelMundo} [config.estadoMundoInicial] - Para sellar ultimoTickProcesado de sucesos precargados.
 */
export function crearMotorDeSucesos({
  sucesos = [],
  escenas = [],
  jugador = null,
  npcs = [],
  evaluadoresResolucion = {},
  estadoMundoInicial = null,
  estadoInternoInicial = null,
} = {}) {
  const _sucesos = [...sucesos];
  const _escenasPorId = new Map(escenas.map((e) => [e.id, e]));
  const _jugador = jugador;
  const _npcs = npcs;
  const _evaluadores = { ...evaluadoresResolucionPorDefecto, ...evaluadoresResolucion };

  const _estadoInterno = new Map();
  for (const suceso of _sucesos) {
    _estadoInterno.set(suceso.id, {
      ultimoTickProcesado: estadoMundoInicial?.ticksTranscurridos ?? 0,
      eventoGeneradoSiResuelveAnticipado: null,
      duracionEventoGenerado: null,
      condicionExpiracionEventoGenerado: null,
    });
  }

  // Extensión aditiva de Fase 7 (fase_7_ADENDUM.md, sección 3): restaurar
  // el estado interno exportado por `exportarEstadoInterno()`. Un suceso
  // sin entrada conserva el sellado por `estadoMundoInicial` de arriba
  // (compatibilidad con todo lo anterior a Fase 7). Falla fuerte ante datos
  // que no puede interpretar: ids que no son de ningún suceso o campos mal
  // tipados — la validación con reportes vive en persistencia/, esto es la
  // segunda línea de defensa.
  if (estadoInternoInicial !== null && estadoInternoInicial !== undefined) {
    const guardados = estadoInternoInicial.sucesos;
    if (guardados === null || typeof guardados !== 'object' || Array.isArray(guardados)) {
      throw new Error("Motor de Sucesos: estadoInternoInicial.sucesos tiene que ser un objeto indexado por id de suceso.");
    }
    for (const [id, datos] of Object.entries(guardados)) {
      const interno = _estadoInterno.get(id);
      if (!interno) {
        throw new Error(`Motor de Sucesos: estadoInternoInicial menciona '${id}', que no es un suceso conocido.`);
      }
      if (!Number.isFinite(datos?.ultimoTickProcesado)) {
        throw new Error(`Motor de Sucesos: estadoInternoInicial['${id}'].ultimoTickProcesado tiene que ser un número finito.`);
      }
      interno.ultimoTickProcesado = datos.ultimoTickProcesado;
      interno.eventoGeneradoSiResuelveAnticipado = datos.eventoGeneradoSiResuelveAnticipado ?? null;
      interno.duracionEventoGenerado = datos.duracionEventoGenerado ?? null;
      interno.condicionExpiracionEventoGenerado = datos.condicionExpiracionEventoGenerado ?? null;
    }
  }

  function _construirContexto(suceso, estadoMundo) {
    return { suceso, estadoMundo, jugador: _jugador, npcs: _npcs };
  }

  function crearSuceso(datosSuceso, estadoMundo, opciones = {}) {
    const suceso = construirSuceso(datosSuceso);
    const { valido, errores } = validarEstructura('Suceso', suceso);
    if (!valido) return { suceso: null, errores };

    _sucesos.push(suceso);
    _estadoInterno.set(suceso.id, {
      ultimoTickProcesado: estadoMundo?.ticksTranscurridos ?? 0,
      eventoGeneradoSiResuelveAnticipado: opciones.eventoGeneradoSiResuelveAnticipado ?? null,
      duracionEventoGenerado: opciones.duracionEventoGenerado ?? null,
      condicionExpiracionEventoGenerado: opciones.condicionExpiracionEventoGenerado ?? null,
    });
    return { suceso, errores: [] };
  }

  /**
   * Permite fijar o actualizar, después de crearSuceso, qué evento genera
   * este Suceso si se resuelve anticipadamente (y opcionalmente con qué
   * duracion/condicionExpiracion). Sólo actualiza las claves presentes en
   * `config` — las omitidas quedan como estaban.
   */
  function registrarResolucionAnticipada(sucesoId, config = {}) {
    const interno = _estadoInterno.get(sucesoId);
    if (!interno) throw new Error(`Motor de Sucesos: no existe estado interno para '${sucesoId}'.`);
    if ('eventoGeneradoSiResuelveAnticipado' in config) interno.eventoGeneradoSiResuelveAnticipado = config.eventoGeneradoSiResuelveAnticipado;
    if ('duracionEventoGenerado' in config) interno.duracionEventoGenerado = config.duracionEventoGenerado;
    if ('condicionExpiracionEventoGenerado' in config) interno.condicionExpiracionEventoGenerado = config.condicionExpiracionEventoGenerado;
  }

  function registrarEvaluadorResolucion(nombre, fn) {
    _evaluadores[nombre] = fn;
  }

  function _resolver(suceso, motorEventos, estadoMundoActual, { anticipada }) {
    suceso.activo = false;
    const interno = _estadoInterno.get(suceso.id);

    const tipoEvento =
      anticipada && interno?.eventoGeneradoSiResuelveAnticipado
        ? interno.eventoGeneradoSiResuelveAnticipado
        : suceso.eventoGeneradoAlResolver;

    // Resolución "silenciosa": válida (ver "Migración de animales", tabla 4.4).
    if (!tipoEvento) return [];

    let duracion = interno?.duracionEventoGenerado ?? null;
    let condicionExpiracion = interno?.condicionExpiracionEventoGenerado ?? null;
    if (duracion === null && condicionExpiracion === null) {
      duracion = DURACION_POR_DEFECTO_EVENTO_GENERADO;
    }

    // "Escenas relevantes" para un Suceso global: mecanismo mínimo del
    // cascarón (doc técnico, 4.3) — se replica en todas las escenas
    // conocidas por este motor. Cuál subconjunto es "relevante" de
    // verdad es decisión de lore, fuera de alcance acá.
    const escenasDestino = suceso.alcance === 'escena' ? [suceso.escenaId] : [..._escenasPorId.keys()];

    const eventosGenerados = [];
    for (const escenaId of escenasDestino) {
      const { evento, errores } = motorEventos.crearEvento(
        {
          id: `evento_${tipoEvento}_${suceso.id}_${escenaId}`,
          tipo: tipoEvento,
          escenaId,
          duracion,
          condicionExpiracion,
          metadata: { sucesoOrigenId: suceso.id },
        },
        estadoMundoActual
      );
      if (!evento) {
        // No es un dato del jugador lo que falló acá — es el propio motor
        // generando algo mal formado a partir de un Suceso ya validado.
        // Eso es un bug interno, no un caso a tragarse en silencio.
        throw new Error(
          `Motor de Sucesos: el evento generado al resolver '${suceso.id}' no pasó validarEstructura: ${errores.join(' ')}`
        );
      }
      eventosGenerados.push(evento);
    }
    return eventosGenerados;
  }

  function procesarTicks(estadoMundoActual, motorEventos) {
    const sucesosModificados = [];
    const eventosGenerados = [];

    for (const suceso of _sucesos) {
      if (!suceso.activo) continue;

      const interno = _estadoInterno.get(suceso.id);
      const ticksNuevos = estadoMundoActual.ticksTranscurridos - interno.ultimoTickProcesado;
      if (ticksNuevos <= 0) continue; // ya procesado hasta este punto — idempotencia

      suceso.progreso += suceso.velocidadProgreso * ticksNuevos;
      interno.ultimoTickProcesado = estadoMundoActual.ticksTranscurridos;
      sucesosModificados.push(suceso);

      if (suceso.progreso >= 100) {
        eventosGenerados.push(..._resolver(suceso, motorEventos, estadoMundoActual, { anticipada: false }));
      } else {
        const evaluador = _evaluadores[suceso.condicionResolucion];
        if (evaluador && evaluador(_construirContexto(suceso, estadoMundoActual))) {
          eventosGenerados.push(..._resolver(suceso, motorEventos, estadoMundoActual, { anticipada: true }));
        }
      }
    }

    return { sucesosModificados, eventosGenerados };
  }

  function resolverSuceso(sucesoId, motorEventos, estadoMundoActual) {
    const suceso = _sucesos.find((s) => s.id === sucesoId);
    if (!suceso) throw new Error(`Motor de Sucesos: no existe un suceso con id '${sucesoId}'.`);
    if (!suceso.activo) return [];
    return _resolver(suceso, motorEventos, estadoMundoActual, { anticipada: true });
  }

  /** Extensión aditiva de Fase 7: todos los sucesos, activos e inactivos (mismas referencias). */
  function listarTodos() {
    return [..._sucesos];
  }

  /**
   * Extensión aditiva de Fase 7: estado operativo que no vive en el esquema
   * Suceso (Fase 1). JSON plano indexado por id de suceso — nunca el Map
   * crudo. Es lo que hace falta para restaurar sin romper la idempotencia
   * de `procesarTicks`.
   * @returns {{ sucesos: Object<string, {ultimoTickProcesado: number, eventoGeneradoSiResuelveAnticipado: string|null, duracionEventoGenerado: number|null, condicionExpiracionEventoGenerado: string|null}> }}
   */
  function exportarEstadoInterno() {
    const sucesosExport = {};
    for (const [id, interno] of _estadoInterno.entries()) {
      sucesosExport[id] = { ...interno };
    }
    return { sucesos: sucesosExport };
  }

  return {
    crearSuceso,
    listarTodos,
    exportarEstadoInterno,
    procesarTicks,
    resolverSuceso,
    registrarEvaluadorResolucion,
    registrarResolucionAnticipada,
  };
}
