/**
 * Fase 1 — Único punto del motor que toca los campos temporales de
 * EstadoDelMundo (ticksTranscurridos, horaActual, diaActual).
 *
 * Motivo (doc técnico Fase 1, sección 6, riesgo heredado de Fase 0):
 * "Si EstadoDelMundo.ticksTranscurridos no se incrementa de forma
 * consistente en todos los puntos del motor... este campo tiene que
 * ser tocado en un único lugar del código, no en varios puntos
 * dispersos." Este archivo es ese único lugar. Ningún otro módulo de
 * Fase 1 (motorEventos, motorSucesos) escribe estos tres campos.
 *
 * Supuesto de diseño (marcado en el chat, no está en ningún documento
 * base): 1 tick = 1 hora. No es una derivación absoluta
 * (horaActual = ticksTranscurridos % 24) sino un AVANCE RELATIVO desde
 * los valores actuales de horaActual/diaActual. Se eligió así porque
 * el EstadoDelMundo ficticio de Fase 0 (horaActual:14, diaActual:3,
 * ticksTranscurridos:72) no es consistente con una derivación absoluta
 * (72 ticks / 24 = día 3, hora 0 — no hora 14). Avanzar en relativo
 * respeta cualquier estado inicial ya cargado, sea cual sea su origen,
 * sin necesidad de tocar ese fixture ni asumir que ticksTranscurridos
 * arrancó en 0 en algún "epoch" común con horaActual/diaActual.
 *
 * Esta función NO dispara revisarExpiraciones ni procesarTicks. Avanzar
 * el reloj y procesar sus consecuencias son responsabilidades separadas
 * a propósito — quien orquesta (hoy: los tests; más adelante: Fase 8 u
 * otro punto de integración) decide el orden:
 *
 *   avanzarTicks(estadoMundo, n);
 *   motorEventos.revisarExpiraciones(estadoMundo);
 *   motorSucesos.procesarTicks(estadoMundo, motorEventos);
 */

/**
 * @param {import('./modelos/estadoDelMundo.js').EstadoDelMundo} estadoMundo
 * @param {number} [cantidadTicks=1] - Entero positivo. Soporta saltos grandes
 *   de una sola vez (ej. el jugador duerme 8 horas) sin iterar tick a tick.
 * @returns {typeof estadoMundo} el mismo objeto, mutado, para permitir encadenar.
 */
export function avanzarTicks(estadoMundo, cantidadTicks = 1) {
  if (!Number.isInteger(cantidadTicks) || cantidadTicks <= 0) {
    throw new Error(
      `avanzarTicks: cantidadTicks debe ser un entero positivo, recibido ${cantidadTicks}.`
    );
  }

  estadoMundo.ticksTranscurridos += cantidadTicks;

  const horaTotal = estadoMundo.horaActual + cantidadTicks;
  estadoMundo.horaActual = horaTotal % 24;
  estadoMundo.diaActual += Math.floor(horaTotal / 24);

  return estadoMundo;
}
