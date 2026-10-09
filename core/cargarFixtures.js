/**
 * Fase 0 — Carga del dataset de fixtures ficticio (/data/fixtures) en
 * el shape que espera validarReferencias:
 *   { jugador, npcs, escenas, eventos, sucesos, estadoDelMundo, objetos }
 * (campo `objetos` sumado en Fase 3 — ver fase_3_ADENDUM.md, sección 1)
 *
 * Pensado para correr en el navegador con fetch nativo (ES Modules,
 * sin paso de build). Se resuelve la ruta relativa a este archivo con
 * import.meta.url para que funcione sin importar desde dónde se
 * importe este módulo.
 *
 * Para Node (tests, scripts) no se reusa esta función porque el
 * fetch nativo de Node no soporta file://; los tests leen los mismos
 * JSON con node:fs directamente.
 */

const BASE = new URL('../data/fixtures/', import.meta.url);

async function cargarJSON(nombreArchivo) {
  const resp = await fetch(new URL(nombreArchivo, BASE));
  if (!resp.ok) {
    throw new Error(`No se pudo cargar el fixture '${nombreArchivo}' (HTTP ${resp.status}).`);
  }
  return resp.json();
}

/**
 * @returns {Promise<{jugador: object, npcs: object[], escenas: object[], eventos: object[], sucesos: object[], estadoDelMundo: object, objetos: object[]}>}
 */
export async function cargarDatasetFixtures() {
  const [npcs, escenas, eventos, sucesos, jugador, estadoDelMundo, objetos] = await Promise.all([
    cargarJSON('npcs.json'),
    cargarJSON('escenas.json'),
    cargarJSON('eventos.json'),
    cargarJSON('sucesos.json'),
    cargarJSON('jugador.json'),
    cargarJSON('estadoDelMundo.json'),
    cargarJSON('objetos.json'),
  ]);
  return { jugador, npcs, escenas, eventos, sucesos, estadoDelMundo, objetos };
}
