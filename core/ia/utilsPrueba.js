/**
 * Fase 6 — Utilidades de test (no forma parte del motor). Reloj y
 * `dormir` falsos, y un `fetch` falso con respuestas guionadas, para
 * probar la cola y el cliente sin red ni esperas reales.
 */

export function crearRelojFalso(inicio = 1_700_000_000_000) {
  let ahora = inicio;
  const dormidos = [];
  return {
    reloj: () => ahora,
    avanzar: (ms) => {
      ahora += ms;
    },
    /** `dormir` inyectable: no espera de verdad, adelanta el reloj falso y anota cuánto se pidió. */
    dormir: async (ms) => {
      dormidos.push(ms);
      ahora += ms;
    },
    dormidos,
  };
}

/** Cuerpo estilo OpenAI/Groq para una respuesta exitosa. */
export function cuerpoGroq(texto, { finishReason = 'stop', usage = { prompt_tokens: 300, completion_tokens: 40, total_tokens: 340 } } = {}) {
  return { choices: [{ message: { role: 'assistant', content: texto }, finish_reason: finishReason }], usage };
}

/**
 * @param {Array<Function|Error|{status?: number, body?: any, headers?: object, texto?: string}>} guion
 *   Una entrada por llamada, en orden; si se agotan, se repite la última.
 *   Error → fetch lanza. Function → recibe (url, init) y devuelve alguna de las formas anteriores.
 */
export function crearFetchFalso(guion) {
  const llamadas = [];
  async function fetchFalso(url, init) {
    const cuerpo = init?.body ? JSON.parse(init.body) : null;
    llamadas.push({ url, init, cuerpo });
    let paso = guion[Math.min(llamadas.length - 1, guion.length - 1)];
    if (typeof paso === 'function') paso = paso(url, init);
    if (paso instanceof Error) throw paso;
    const { status = 200, body = null, headers = {}, texto = null } = paso;
    return new Response(texto ?? JSON.stringify(body), { status, headers });
  }
  fetchFalso.llamadas = llamadas;
  return fetchFalso;
}
