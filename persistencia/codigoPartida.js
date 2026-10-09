/**
 * Fase 7 — Código de partida (6 caracteres, alfabeto sin ambigüedad visual).
 *
 * Funciona como una contraseña débil de facto (doc técnico Fase 7, sección 3):
 * por eso el generador por defecto usa `crypto.getRandomValues` y no
 * `Math.random`. Sigue siendo inyectable para pruebas deterministas (mismo
 * patrón que `generadorAleatorio` de Fase 5).
 */

import { ALFABETO_CODIGO_PARTIDA, LARGO_CODIGO_PARTIDA } from './constantes.js';

function aleatorioSeguro() {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] / 4294967296; // [0, 1)
}

/**
 * @param {() => number} [generadorAleatorio] - Devuelve un número en [0, 1).
 * @returns {string}
 */
export function generarCodigoPartida(generadorAleatorio = aleatorioSeguro) {
  let codigo = '';
  for (let i = 0; i < LARGO_CODIGO_PARTIDA; i += 1) {
    codigo += ALFABETO_CODIGO_PARTIDA[Math.floor(generadorAleatorio() * ALFABETO_CODIGO_PARTIDA.length)];
  }
  return codigo;
}

/** Normaliza lo que tipea el jugador: recorta espacios y pasa a mayúsculas. */
export function normalizarCodigoPartida(texto) {
  return typeof texto === 'string' ? texto.trim().toUpperCase() : '';
}

/** ¿Cumple el formato (largo y alfabeto)? No dice si la partida existe. */
export function esCodigoPartidaValido(codigo) {
  if (typeof codigo !== 'string' || codigo.length !== LARGO_CODIGO_PARTIDA) return false;
  for (const caracter of codigo) {
    if (!ALFABETO_CODIGO_PARTIDA.includes(caracter)) return false;
  }
  return true;
}
