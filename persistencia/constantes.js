/**
 * Fase 7 — Constantes de persistencia. Ver fase_7_persistencia_ACTUALIZADO.md
 * y fase_7_ADENDUM.md.
 */

/**
 * Versión del esquema de `EstadoCompleto`. Reserva de espacio para migraciones
 * futuras (decisión 4 del addendum): hoy no existe ninguna versión anterior, así
 * que no hay mecanismo de migración — sólo el campo. Un documento con versión
 * MAYOR que ésta se rechaza con motivo `version_futura` y nunca se sobrescribe.
 */
export const VERSION_ESQUEMA = 1;

/**
 * Whitelist de campos de `EstadoCompleto`. El payload se CONSTRUYE tomando sólo
 * estas claves (no se filtra después), y un test fija que el conjunto sea
 * exactamente éste. Agregar un campo acá es una decisión explícita, nunca un
 * efecto colateral. `registroUso` y `apiKey` NO están y no deben estar: son
 * estado de credencial, no de partida (addendum, decisión 2).
 */
export const CAMPOS_ESTADO_COMPLETO = Object.freeze([
  'versionEsquema',
  'codigoPartida',
  'ultimaModificacion',
  'jugador',
  'npcs',
  'escenas',
  'eventos',
  'sucesos',
  'estadoMundo',
  'estadoInternoNPCs',
  'estadoInternoSucesos',
]);

/** Máximo de entradas de `NPC.relacion.historialRelevante` que llegan al guardado. */
export const MAX_HISTORIAL_RELEVANTE = 20;

/** Alfabeto del código de partida: sin 0/O/1/I/L (ambigüedad visual). 31 símbolos. */
export const ALFABETO_CODIGO_PARTIDA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const LARGO_CODIGO_PARTIDA = 6;

/** Nombre de la colección de Firestore. */
export const COLECCION_PARTIDAS = 'partidas';

/**
 * Versión del SDK web de Firebase que se importa por CDN (ESM, sin build).
 * VERIFICAR contra la versión vigente antes de desplegar: se tomó de la
 * documentación oficial de "alternative setup" y cambia seguido.
 */
export const VERSION_SDK_FIREBASE = '12.13.0';

/** Motivos de rechazo de una carga (ver validarEstadoCompleto). */
export const MOTIVO_VERSION_FUTURA = 'version_futura';
export const MOTIVO_ESTRUCTURA = 'estructura';
export const MOTIVO_REFERENCIAS = 'referencias';
