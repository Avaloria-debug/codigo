/**
 * Fase 3 — Nivel 1: verbos (documento técnico, sección 3.3).
 *
 * Contextuales puros (3.1): Hablar con [NPC], Examinar [objeto],
 * Usar [objeto del inventario]. No dependen de estadoCalculado.
 *
 * Ligados a estado (3.2): salen de registroVerbosPorEstado, indexado
 * por estadoCalculado (string plano — Fase 2 devuelve
 * { estado, reportes }, pero escena.estadoCalculado ya queda como
 * string tras actualizarEstadoCalculado; acá se espera ese string).
 *
 * objetosPorId / npcsPorId: ver sección 4.6 del documento técnico.
 * Ninguno de los dos es opcional.
 *
 * @param {object} escena
 * @param {string} estadoCalculado
 * @param {object} jugador
 * @param {Record<string, Array<{nombre: string, tipoResolucion: string}>>} registroVerbosPorEstado
 * @param {Map<string, object>} objetosPorId
 * @param {Map<string, object>} npcsPorId
 * @returns {Array<object>}
 */
export function generarOpcionesNivel1(
  escena,
  estadoCalculado,
  jugador,
  registroVerbosPorEstado,
  objetosPorId,
  npcsPorId
) {
  const opciones = [];

  // --- Contextuales puros (3.1) ---

  for (const npcId of escena.npcsPresentes ?? []) {
    const npc = npcsPorId.get(npcId);
    if (npc && npc.activo) {
      opciones.push({
        etiqueta: `Hablar con ${npc.nombre}`,
        tipoResolucion: 'textoLibre',
        npcObjetivo: npc.id,
      });
    }
  }

  for (const objetoId of escena.objetosPresentes ?? []) {
    const obj = objetosPorId.get(objetoId);
    opciones.push({
      etiqueta: `Examinar ${obj ? obj.nombre : objetoId}`,
      tipoResolucion: 'inmediata',
      objetoObjetivo: objetoId,
    });
  }

  const objetosUsables = objetosUsablesDeInventario(jugador, objetosPorId);
  if (objetosUsables.length === 1) {
    const [unico] = objetosUsables;
    opciones.push({
      etiqueta: `Usar ${unico.nombre}`,
      tipoResolucion: 'inmediata',
      objetoObjetivo: unico.id,
    });
  } else if (objetosUsables.length > 1) {
    opciones.push({ etiqueta: 'Usar', tipoResolucion: 'concrecion' });
  }

  // --- Ligados a estado (3.2) ---

  const verbosDeEstado = registroVerbosPorEstado[estadoCalculado] ?? [];
  for (const verbo of verbosDeEstado) {
    opciones.push({ etiqueta: verbo.nombre, tipoResolucion: verbo.tipoResolucion });
  }

  return opciones;
}

/**
 * Objetos del inventario con utilizableComo no vacío, sin filtrar
 * por verbo ni por estado (decisión "amplio", fase_3_ADENDUM.md
 * sección 2). Se exporta porque generarOpcionesNivel2 necesita la
 * misma lista para el patrón "usar".
 *
 * @param {object} jugador
 * @param {Map<string, object>} objetosPorId
 * @returns {object[]}
 */
export function objetosUsablesDeInventario(jugador, objetosPorId) {
  return (jugador.inventario ?? [])
    .map((item) => objetosPorId.get(item.objetoId))
    .filter((obj) => obj && Array.isArray(obj.utilizableComo) && obj.utilizableComo.length > 0);
}
