/**
 * Fase 6 — Puente entre el motor real (Fases 0-5) y `obtenerDialogoNPC`.
 * No estaba en el doc técnico original: se agregó para que la
 * integración de esta fase quede probada dentro de la fase y no recién
 * en el cascarón (ver fase_6_ADENDUM.md, punto 4).
 *
 * ORDEN OBLIGATORIO de la cadena (ver fase_6_ADENDUM.md, punto 5):
 *   1. resolverAccion(...)                      → AccionResuelta   (Fase 5, usa la relación de ANTES)
 *   2. motorNPCs.procesarAccionResuelta(accion) → { npc }          (Fase 4, actualiza relación/emoción)
 *   3. armarContextoDialogo({ ..., npc })       → contexto         (esta función, lee el estado de DESPUÉS)
 *   4. obtenerDialogoNPC(contexto, ...)         → string
 *
 * Esta función NO llama a `procesarAccionResuelta` por su cuenta (sería
 * un efecto de escritura escondido en algo que se llama "armar", con
 * riesgo de procesar dos veces si quien orquesta también lo llama). Lo
 * que sí hace es leer `npc.estadoEmocional` tal como quedó después del
 * paso 2: por eso el NPC que responde a quien lo acaba de atacar ya no
 * está "neutral".
 */

import { categoriaDeRelacion } from '../npcs/categoriasRelacion.js';

/**
 * @param {object} p
 * @param {object} p.accionResuelta - Salida de resolverAccion (Fase 5). `npcObjetivoId` tiene que ser el NPC que habla.
 * @param {object} p.npc - El NPC devuelto por `procesarAccionResuelta` (ya actualizado).
 * @param {object} p.escena - Con `estadoCalculado` ya asignado (ver `actualizarEstadoCalculado`, Fase 2).
 * @param {object} p.estadoMundo
 * @param {{ conocimientosRevelablesDe: Function }} p.motorNPCs
 * @param {object} [p.jugador]
 * @param {string} [p.textoLibreJugador]
 * @param {object|null} [p.opcionNivel2] - La hoja de Nivel 2 elegida, si hubo. Si su `comportamientoAlElegir` es
 *   `"abreTextoLibreConContexto"` (patrón tono), su etiqueta pasa a ser `tonoElegido`.
 */
export function armarContextoDialogo({
  accionResuelta,
  npc,
  escena,
  estadoMundo,
  motorNPCs,
  jugador = null,
  textoLibreJugador = '',
  opcionNivel2 = null,
}) {
  if (!accionResuelta || !npc || !motorNPCs) {
    throw new Error('armarContextoDialogo: accionResuelta, npc y motorNPCs son obligatorios.');
  }
  if (accionResuelta.npcObjetivoId !== npc.id) {
    throw new Error(
      `armarContextoDialogo: la acción apunta a '${accionResuelta.npcObjetivoId}' pero el NPC que habla es '${npc.id}'. ` +
        'Hay que pasar `npcObjetivo` a resolverAccion para que el AccionResuelta traiga el id del NPC.'
    );
  }

  const tonoElegido = opcionNivel2?.comportamientoAlElegir === 'abreTextoLibreConContexto' ? opcionNivel2.etiqueta : null;
  const texto = textoLibreJugador ?? '';

  return {
    npc,
    estadoEmocionalProyectado: npc.estadoEmocional, // ya proyectado por motorNPCs (Fase 4); no se recalcula
    categoriaRelacion: categoriaDeRelacion(npc.relacion.valor),
    escena,
    estadoMundo,
    // Cierra el "se completa aparte" de Fase 5: resolverAccion deja textoLibre en null.
    accionResuelta: texto !== '' ? { ...accionResuelta, textoLibre: texto } : accionResuelta,
    textoLibreJugador: texto,
    tonoElegido,
    conocimientosRevelables: motorNPCs.conocimientosRevelablesDe(npc.id, jugador),
  };
}
