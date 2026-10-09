/**
 * Fase 1 — Registro de evaluadores de condición de expiración para Eventos.
 * Ver doc técnico Fase 1, sección 3.2. Diccionario nombreCondicion -> función.
 *
 * Estos son los tres ejemplos ficticios del documento, más
 * "jugador_huye_o_vence" (necesario para el caso "Emboscada activa" de
 * la tabla 3.3). Es un set de referencia, no una lista cerrada — el
 * lore real agrega los suyos vía motorEventos.registrarEvaluadorExpiracion(),
 * sin tocar este archivo ni el motor.
 *
 * Forma del `contexto` que recibe cada evaluador (armado por motorEventos.js):
 *   {
 *     evento,             // el Evento que se está evaluando
 *     estadoMundo,        // EstadoDelMundo actual
 *     escena,             // Escena de evento.escenaId, o undefined si no se encontró
 *     jugador,            // Jugador actual (si el motor se creó con uno)
 *     npc,                // NPC resuelto desde evento.metadata.npcId, si ese campo está seteado
 *     eventoActivadoEnDia,// azúcar: evento.metadata.diaDeActivacion
 *   }
 *
 * Ningún evaluador de este archivo asume lore real: todas las claves
 * que lee de metadata/flags son genéricas y quedan documentadas acá.
 */
export const evaluadoresExpiracionPorDefecto = {
  jugador_paga_multa: (contexto) => contexto.jugador?.flags?.multaPagada === true,

  npc_deja_de_estar_hostil: (contexto) => (contexto.npc?.relacion?.valor ?? -Infinity) > -20,

  transcurre_un_dia_completo: (contexto) =>
    contexto.eventoActivadoEnDia != null && contexto.estadoMundo.diaActual > contexto.eventoActivadoEnDia,

  jugador_huye_o_vence: (contexto) =>
    contexto.jugador?.flags?.escapoDeEmboscada === true || contexto.jugador?.flags?.vencioEmboscada === true,

  derrumbe_despejado: (contexto) => contexto.jugador?.flags?.derrumbeDespejado === true,

  un_npc_se_retira: (contexto) => contexto.jugador?.flags?.npcSeRetiroDeDisputa === true,

  // Usado por el evento ficticio evento_disputa_publica_001 del dataset de Fase 0.
  mediador_interviene: (contexto) => contexto.jugador?.flags?.mediadorInterviene === true,
};
