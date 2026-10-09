/**
 * Fase 6 — Punto de entrada único del diálogo de NPC (doc técnico,
 * sección 6.3). Groq real y mock comparten interfaz: quien llama no
 * necesita saber cuál de los dos respondió.
 *
 * Cambios de contrato respecto al pseudocódigo original (ver
 * fase_6_ADENDUM.md): es async (hay red de por medio; el mock también
 * devuelve Promise para que la interfaz sea idéntica), y no recibe
 * `estadoMundo` aparte (ya viaja dentro de `contexto`).
 *
 * Nunca lanza por un fallo de Groq: "la conversación no se corta, se
 * degrada". Hasta un error inesperado de programación cae a mock (con
 * console.warn) en vez de romper el turno del jugador.
 */

import { armarMensajes } from './armarMensajes.js';
import { estimarTokensMensajes } from './estimarTokens.js';
import { encolarLlamadaGroq } from './encolarLlamadaGroq.js';
import { generarDialogoMock } from './dialogoMock.js';

/**
 * Variante con metadata de origen — para el panel de Fase 8, que
 * necesita mostrar POR QUÉ una respuesta salió del mock.
 *
 * @param {object} contexto - Ver armarContextoDialogo.js.
 * @param {ReturnType<import('./configuracionGroq.js').crearConfiguracionGroq>} configuracionGroq
 * @param {ReturnType<import('./registroUso.js').crearRegistroUso>} registroUso
 * @param {{ forzarMock?: boolean, fetch?: typeof fetch, dormir?: (ms:number)=>Promise<void> }} [opciones]
 * @returns {Promise<{ texto: string, origen: 'groq'|'mock', motivo: string|null, recortado?: boolean, tokensUsados?: number }>}
 */
export async function obtenerDialogoNPCConOrigen(contexto, configuracionGroq, registroUso, opciones = {}) {
  const { forzarMock = false, fetch, dormir } = opciones;

  const mock = (motivo) => ({
    texto: generarDialogoMock(
      contexto.npc,
      contexto.estadoEmocionalProyectado,
      contexto.accionResuelta,
      contexto.textoLibreJugador
    ),
    origen: 'mock',
    motivo,
  });

  if (forzarMock) return mock('forzado');
  if (!configuracionGroq?.apiKey) return mock('sin_api_key');

  try {
    const mensajes = armarMensajes(contexto);
    const tokensEstimados = estimarTokensMensajes(mensajes) + configuracionGroq.maxCompletionTokens;
    const r = await encolarLlamadaGroq(mensajes, tokensEstimados, configuracionGroq, registroUso, { fetch, dormir });

    if (r.agotado) return mock(r.motivo ?? 'agotado');
    if (r.error || !r.texto) return mock(r.motivo ?? 'error');
    return { texto: r.texto, origen: 'groq', motivo: null, recortado: r.recortado, tokensUsados: r.tokensUsados };
  } catch (e) {
    console.warn(`obtenerDialogoNPC: error inesperado, se degrada a mock — ${e?.message ?? e}`);
    return mock('error_inesperado');
  }
}

/** Contrato del doc: siempre devuelve un string (vía Groq o vía mock). */
export async function obtenerDialogoNPC(contexto, configuracionGroq, registroUso, opciones = {}) {
  return (await obtenerDialogoNPCConOrigen(contexto, configuracionGroq, registroUso, opciones)).texto;
}
