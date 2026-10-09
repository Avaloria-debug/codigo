/**
 * Fase 7 — Almacén clave-valor en memoria. Misma interfaz async que
 * `almacenIndexedDB` (`get`/`set`/`delete`), para tests y para el modo sin
 * navegador. Guarda copias (structured clone vía JSON) para reproducir el
 * comportamiento de IndexedDB: lo leído nunca comparte referencias con lo escrito.
 */

export function crearAlmacenEnMemoria() {
  const datos = new Map();
  const copiar = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  return {
    async get(clave) {
      return datos.has(clave) ? copiar(datos.get(clave)) : undefined;
    },
    async set(clave, valor) {
      datos.set(clave, copiar(valor));
    },
    async delete(clave) {
      datos.delete(clave);
    },
    /** Sólo tests: claves presentes. */
    claves() {
      return [...datos.keys()];
    },
  };
}
