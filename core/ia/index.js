/**
 * Fase 6 — Punto de entrada único a la integración con Groq.
 * Uso: import { obtenerDialogoNPC, armarContextoDialogo, crearRegistroUso, crearConfiguracionGroq } from '../ia/index.js';
 */

export { obtenerDialogoNPC, obtenerDialogoNPCConOrigen } from './obtenerDialogoNPC.js';
export { armarContextoDialogo } from './armarContextoDialogo.js';
export { armarMensajes, limpiarTextoJugador, MAX_CONOCIMIENTOS_EN_PROMPT, MAX_CARACTERES_TEXTO_JUGADOR } from './armarMensajes.js';
export { generarDialogoMock } from './dialogoMock.js';
export { llamarGroq, esperaSugeridaPor429 } from './llamarGroq.js';
export { encolarLlamadaGroq } from './encolarLlamadaGroq.js';
export { crearRegistroUso, VENTANA_MINUTO_MS, VENTANA_DIA_MS } from './registroUso.js';
export { configuracionGroqPorDefecto, crearConfiguracionGroq } from './configuracionGroq.js';
export { estimarTokens, estimarTokensMensajes } from './estimarTokens.js';
export { limpiarRespuesta } from './limpiarRespuesta.js';
export { parsearDuracionGroq } from './duracionGroq.js';
export { ErrorGroq, ErrorRateLimit } from './errores.js';
