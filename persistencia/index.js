/**
 * Fase 7 — Punto de entrada de persistencia.
 * Adaptadores concretos: importar por separado desde ./adaptadores/ (el de
 * Firebase y el de IndexedDB sólo se instancian en el navegador).
 */

export { VERSION_ESQUEMA, CAMPOS_ESTADO_COMPLETO, MAX_HISTORIAL_RELEVANTE, COLECCION_PARTIDAS, VERSION_SDK_FIREBASE } from './constantes.js';
export { generarCodigoPartida, normalizarCodigoPartida, esCodigoPartidaValido } from './codigoPartida.js';
export { verificarSerializable } from './serializable.js';
export { capturarEstadoCompleto, prepararParaGuardado } from './estadoCompleto.js';
export { validarEstadoCompleto } from './validarEstadoCompleto.js';
export { restaurarMotores } from './restaurarMotores.js';
export { sincronizarPartida } from './sincronizarPartida.js';
export { crearServicioPersistencia } from './servicioPersistencia.js';
export { crearAdaptadorLocal } from './adaptadores/local.js';
export { crearAlmacenEnMemoria } from './adaptadores/almacenEnMemoria.js';
export { crearAlmacenIndexedDB } from './adaptadores/almacenIndexedDB.js';
export { crearAdaptadorNubeEnMemoria } from './adaptadores/nubeEnMemoria.js';
export { crearAdaptadorFirebase, verificarCompatibleFirestore } from './adaptadores/firebase.js';
export { crearClienteFirestoreWeb } from './adaptadores/clienteFirestoreWeb.js';
