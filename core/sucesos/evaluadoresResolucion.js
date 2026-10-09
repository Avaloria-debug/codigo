/**
 * Fase 1 — Registro de evaluadores de condición de resolución anticipada
 * para Sucesos. Ver doc técnico Fase 1, sección 4.2/4.4.
 *
 * Se evalúan sólo cuando progreso < 100 (si progreso llega a 100 antes,
 * resuelve por progreso completo sin consultar esto — ver motorSucesos.js).
 *
 * Forma del `contexto` que recibe cada evaluador (armado por motorSucesos.js):
 *   {
 *     suceso,       // el Suceso que se está evaluando
 *     estadoMundo,  // EstadoDelMundo actual
 *     jugador,      // Jugador actual (si el motor se creó con uno)
 *     npcs,         // array de NPCs (si el motor se creó con ellos)
 *   }
 *
 * "llega_caravana_comercio" es la condicionResolucion del suceso ficticio
 * suceso_escasez_001 del dataset de Fase 0. "mediador_interviene" es el
 * ejemplo de la tabla 4.4 para el caso "Tensión creciente". Set de
 * referencia, no lista cerrada — el lore real agrega los suyos vía
 * motorSucesos.registrarEvaluadorResolucion(), sin tocar este archivo.
 */
export const evaluadoresResolucionPorDefecto = {
  llega_caravana_comercio: (contexto) => contexto.jugador?.flags?.caravanaLlego === true,

  mediador_interviene: (contexto) => contexto.jugador?.flags?.mediadorInterviene === true,
};
