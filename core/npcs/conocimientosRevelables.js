/**
 * Fase 4 — Revelación de conocimientos (doc técnico, sección 5).
 * Función pura: no necesita el estado interno del motor (nivelTemor/
 * nivelDisposicion no participan acá), así que se expone standalone
 * además de como método de conveniencia en motorNPCs.js.
 *
 * Se asume que `npc` ya pasó validarEstructura (Fase 0) en algún
 * punto anterior — no se re-valida `nivelAcceso` acá, mismo criterio
 * que el resto del motor (Fase 1 tampoco re-valida lo que recibe).
 *
 * @param {import('../modelos/npc.js').NPC} npc
 * @param {object} jugador - Parámetro declarado en el doc técnico
 *   (sección 5) pero no usado en el cuerpo tal como está pseudo-
 *   codeado ahí. Se conserva a propósito (no se saca de la firma):
 *   el ejemplo de Jugador en Fase 0 (sección 3.1) ya usa
 *   `flags: { "conocioAlHerrero": true }` como dato de muestra —
 *   señal de que un futuro cuarto caso de `nivelAcceso` (algo tipo
 *   "requiereFlagJugador") va a necesitar leer `jugador.flags`.
 *   Sacar el parámetro ahora obligaría a volver a tocar esta firma
 *   después por algo que el propio esquema de Fase 0 ya insinuó.
 * @param {{ existioAlgunaVez: (eventoId: string) => boolean }} motorEventos
 * @returns {import('../modelos/npc.js').Conocimiento[]}
 */
export function conocimientosRevelables(npc, jugador, motorEventos) {
  const revelables = [];

  for (const conocimiento of npc.conocimientos) {
    switch (conocimiento.nivelAcceso) {
      case 'publico':
        revelables.push(conocimiento);
        break;

      case 'requiereRelacion':
        if (npc.relacion.valor >= conocimiento.umbralRelacion) {
          revelables.push(conocimiento);
        }
        break;

      case 'requiereEvento':
        // Interpretación explícita (doc técnico, sección 5): alcanza
        // con que el evento se haya activado alguna vez, esté activo
        // o ya resuelto — no hace falta que siga activo ahora mismo.
        // `existioAlgunaVez` (Fase 1, extensión aditiva) implementa
        // exactamente esa semántica.
        if (motorEventos.existioAlgunaVez(conocimiento.eventoDisparadorId)) {
          revelables.push(conocimiento);
        }
        break;
    }
  }

  return revelables;
}
