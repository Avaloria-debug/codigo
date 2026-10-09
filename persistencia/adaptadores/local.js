/**
 * Fase 7 — Adaptador local (cache). Guarda tres cosas bajo claves SEPARADAS:
 *   - 'partida_activa': el EstadoCompleto ya preparado (una partida por dispositivo).
 *   - 'api_key': la API key de Groq. Nunca viaja a la nube.
 *   - 'registro_uso': `registroUso.serializar()` de Fase 6 (decisión 2 del
 *     addendum: es estado de credencial, no de partida).
 *
 * Cambiar de API key descarta el registro de uso: es otro cupo en Groq.
 */

const CLAVE_PARTIDA = 'partida_activa';
const CLAVE_API_KEY = 'api_key';
const CLAVE_REGISTRO_USO = 'registro_uso';

/** @param {{ get: Function, set: Function, delete: Function }} almacen */
export function crearAdaptadorLocal({ almacen }) {
  if (!almacen) throw new Error('crearAdaptadorLocal: `almacen` es obligatorio.');

  return {
    async guardarLocal(estadoCompleto) {
      await almacen.set(CLAVE_PARTIDA, estadoCompleto);
    },
    /** @returns {Promise<object|null>} Lo guardado, SIN validar (valida quien llama). */
    async cargarLocal() {
      const v = await almacen.get(CLAVE_PARTIDA);
      return v === undefined ? null : v;
    },
    async borrarLocal() {
      await almacen.delete(CLAVE_PARTIDA);
    },

    async guardarApiKey(apiKey) {
      const anterior = await almacen.get(CLAVE_API_KEY);
      await almacen.set(CLAVE_API_KEY, apiKey);
      if (anterior !== undefined && anterior !== apiKey) await almacen.delete(CLAVE_REGISTRO_USO);
    },
    async cargarApiKey() {
      const v = await almacen.get(CLAVE_API_KEY);
      return v === undefined ? null : v;
    },

    async guardarRegistroUso(serializado) {
      await almacen.set(CLAVE_REGISTRO_USO, serializado);
    },
    /** @returns {Promise<{llamadas: object[]}|null>} Listo para `crearRegistroUso({ estadoInicial })`. */
    async cargarRegistroUso() {
      const v = await almacen.get(CLAVE_REGISTRO_USO);
      return v === undefined ? null : v;
    },
  };
}
