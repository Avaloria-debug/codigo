/**
 * Fase 3 — Punto de entrada único al sistema de opciones.
 * Uso: import { generarOpcionesNivel1, generarOpcionesNivel2 } from '../opciones/index.js';
 */

export { generarOpcionesNivel1, objetosUsablesDeInventario } from './generarOpcionesNivel1.js';
export { generarOpcionesNivel2 } from './generarOpcionesNivel2.js';
export { registroVerbosPorEstado } from './registroVerbosPorEstado.js';
export { registroPatrones } from './registroPatrones.js';
export { poolDesesperadoSalidas, poolDesesperadoCobertura } from './poolsDesesperados.js';
export { opcionesTono } from './opcionesTono.js';
export { construirObjetosPorId, construirNpcsPorId } from './resolutores.js';
