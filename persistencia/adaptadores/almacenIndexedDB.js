/**
 * Fase 7 — Almacén clave-valor sobre IndexedDB (navegador). Una sola base y
 * un solo object store; la partida activa, la API key y el registro de uso
 * viven bajo claves distintas (ver adaptadorLocal.js).
 *
 * `indexedDB` es inyectable: en Node no existe, así que los tests usan un
 * doble mínimo (ver almacenIndexedDB.test.js). La verificación en un navegador
 * real queda para Fase 8.
 */

function comoPromesa(peticion) {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error ?? new Error('IndexedDB: operación fallida.'));
  });
}

export function crearAlmacenIndexedDB({
  nombreBD = 'motor_narracion',
  nombreStore = 'kv',
  indexedDB = globalThis.indexedDB,
} = {}) {
  if (!indexedDB) throw new Error('crearAlmacenIndexedDB: no hay indexedDB disponible en este entorno.');

  let _abierta = null;
  function abrir() {
    if (!_abierta) {
      _abierta = new Promise((resolver, rechazar) => {
        const pedido = indexedDB.open(nombreBD, 1);
        pedido.onupgradeneeded = () => {
          const bd = pedido.result;
          if (!bd.objectStoreNames.contains(nombreStore)) bd.createObjectStore(nombreStore);
        };
        pedido.onsuccess = () => resolver(pedido.result);
        pedido.onerror = () => {
          _abierta = null; // permite reintentar
          rechazar(pedido.error ?? new Error('IndexedDB: no se pudo abrir la base.'));
        };
      });
    }
    return _abierta;
  }

  async function transaccion(modo, operacion) {
    const bd = await abrir();
    const tx = bd.transaction(nombreStore, modo);
    const resultado = await comoPromesa(operacion(tx.objectStore(nombreStore)));
    return resultado;
  }

  return {
    get: (clave) => transaccion('readonly', (s) => s.get(clave)),
    set: async (clave, valor) => {
      await transaccion('readwrite', (s) => s.put(valor, clave));
    },
    delete: async (clave) => {
      await transaccion('readwrite', (s) => s.delete(clave));
    },
  };
}
