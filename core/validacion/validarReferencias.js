/**
 * Fase 0 — Validación referencial.
 * Confirma que los IDs que una entidad menciona existen realmente en
 * el dataset completo (sección 2, principio 5). No repite chequeos
 * estructurales — asume que se corrió validarEstructura aparte.
 *
 * datasetCompleto tiene la forma:
 *   { jugador, npcs, escenas, eventos, sucesos, estadoDelMundo }
 * (npcs/escenas/eventos/sucesos son arrays; jugador/estadoDelMundo son
 * objetos singulares).
 *
 * Nota: Suceso.eventoGeneradoAlResolver es un TIPO de evento a
 * instanciar, no un ID de un Evento existente (ver documento técnico,
 * sección 3.6) — a propósito NO se valida contra dataset.eventos.
 *
 * Nota: NPC.inventario/Jugador.inventario referencian objetoId, pero
 * Fase 0 no define un esquema de Objeto todavía (queda fuera de
 * alcance), así que no hay contra qué chequear esas referencias por
 * ahora.
 */

function idsDe(coleccion) {
  return new Set((coleccion ?? []).map((item) => item?.id));
}

function npcsPorId(dataset) {
  return new Map((dataset.npcs ?? []).map((npc) => [npc.id, npc]));
}

function validarNPCReferencias(objeto, dataset) {
  const errores = [];
  const prefijo = `[NPC ${objeto.id ?? '(sin id)'}]`;
  const escenasIds = idsDe(dataset.escenas);
  const eventosIds = idsDe(dataset.eventos);

  if (objeto.ubicacionActual !== null && objeto.ubicacionActual !== undefined) {
    if (!escenasIds.has(objeto.ubicacionActual)) {
      errores.push(`${prefijo} 'ubicacionActual' referencia la escena '${objeto.ubicacionActual}', que no existe en el dataset.`);
    }
  }

  (objeto.conocimientos ?? []).forEach((c, i) => {
    if (c?.nivelAcceso === 'requiereEvento') {
      if (!c.eventoDisparadorId || !eventosIds.has(c.eventoDisparadorId)) {
        errores.push(`${prefijo} conocimientos[${i}] ('${c.id ?? '(sin id)'}') referencia el evento '${c.eventoDisparadorId}', que no existe en el dataset.`);
      }
    }
  });

  return errores;
}

function validarEscenaReferencias(objeto, dataset) {
  const errores = [];
  const prefijo = `[Escena ${objeto.id ?? '(sin id)'}]`;
  const escenasIds = idsDe(dataset.escenas);
  const npcsMapa = npcsPorId(dataset);
  const eventosIds = idsDe(dataset.eventos);

  (objeto.salidas ?? []).forEach((s, i) => {
    if (!escenasIds.has(s?.escenaDestinoId)) {
      errores.push(`${prefijo} salidas[${i}] apunta a la escena '${s?.escenaDestinoId}', que no existe en el dataset.`);
    }
  });

  (objeto.npcsPresentes ?? []).forEach((npcId) => {
    const npc = npcsMapa.get(npcId);
    if (!npc) {
      errores.push(`${prefijo} 'npcsPresentes' incluye '${npcId}', que no existe en el dataset.`);
    } else if (npc.ubicacionActual !== objeto.id) {
      errores.push(
        `${prefijo} 'npcsPresentes' incluye '${npcId}', pero ese NPC tiene ubicacionActual='${npc.ubicacionActual}' (inconsistente con esta escena).`
      );
    }
  });

  (objeto.eventosActivos ?? []).forEach((eventoId) => {
    if (!eventosIds.has(eventoId)) {
      errores.push(`${prefijo} 'eventosActivos' incluye '${eventoId}', que no existe en el dataset.`);
    }
  });

  return errores;
}

function validarEventoReferencias(objeto, dataset) {
  const errores = [];
  const prefijo = `[Evento ${objeto.id ?? '(sin id)'}]`;
  const escenasIds = idsDe(dataset.escenas);

  if (!escenasIds.has(objeto.escenaId)) {
    errores.push(`${prefijo} 'escenaId' referencia la escena '${objeto.escenaId}', que no existe en el dataset.`);
  }

  return errores;
}

function validarSucesoReferencias(objeto, dataset) {
  const errores = [];
  const prefijo = `[Suceso ${objeto.id ?? '(sin id)'}]`;

  if (objeto.alcance === 'escena') {
    const escenasIds = idsDe(dataset.escenas);
    if (!escenasIds.has(objeto.escenaId)) {
      errores.push(`${prefijo} 'escenaId' referencia la escena '${objeto.escenaId}', que no existe en el dataset.`);
    }
  }

  return errores;
}

function validarJugadorReferencias(objeto, dataset) {
  const errores = [];
  const prefijo = `[Jugador ${objeto.id ?? '(sin id)'}]`;
  const escenasIds = idsDe(dataset.escenas);

  if (!escenasIds.has(objeto.ubicacionActual)) {
    errores.push(`${prefijo} 'ubicacionActual' referencia la escena '${objeto.ubicacionActual}', que no existe en el dataset.`);
  }

  return errores;
}

const VALIDADORES_REFERENCIAS = {
  NPC: validarNPCReferencias,
  Escena: validarEscenaReferencias,
  Evento: validarEventoReferencias,
  Suceso: validarSucesoReferencias,
  Jugador: validarJugadorReferencias,
  EstadoDelMundo: () => [],
};

/**
 * @param {"Jugador"|"NPC"|"Escena"|"Evento"|"Suceso"|"EstadoDelMundo"} tipo
 * @param {object} objeto
 * @param {{jugador: object, npcs: object[], escenas: object[], eventos: object[], sucesos: object[], estadoDelMundo: object}} datasetCompleto
 * @returns {{ valido: boolean, errores: string[] }}
 */
export function validarReferencias(tipo, objeto, datasetCompleto) {
  const validador = VALIDADORES_REFERENCIAS[tipo];
  if (!validador) {
    return { valido: false, errores: [`Tipo desconocido para validarReferencias: '${tipo}'.`] };
  }
  const errores = validador(objeto, datasetCompleto ?? {});
  return { valido: errores.length === 0, errores };
}
