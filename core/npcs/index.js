/**
 * Fase 4 — Punto de entrada único al motor de NPCs y sus piezas.
 * Uso: import { crearMotorDeNPCs } from '../npcs/index.js';
 */

export { crearMotorDeNPCs } from './motorNPCs.js';
export { conocimientosRevelables } from './conocimientosRevelables.js';
export { proyectarEstadoEmocional, clampTemor, clampDisposicion } from './proyeccionEstadoEmocional.js';
export { categoriaDeRelacion, clampRelacion, moderarDelta, CATEGORIAS_RELACION } from './categoriasRelacion.js';
export { registroTransicionesPorVerboPorDefecto } from './registroTransicionesPorVerbo.js';
