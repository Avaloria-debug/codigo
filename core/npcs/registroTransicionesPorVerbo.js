/**
 * Fase 4 — Registro de transiciones por verbo (doc técnico, sección
 * 4.1). Mismo principio que evaluadoresExpiracion.js (Fase 1) /
 * registroCategoriasEvento.js (Fase 2): diccionario verboId ->
 * función, reemplazable por lore real sin tocar el motor ni este
 * archivo (spread por encima, o reemplazo completo).
 *
 * Cada función recibe (resultado, ejesActuales, opcionElegidaId) y
 * devuelve { deltaRelacion, nivelTemor, nivelDisposicion } — estos
 * dos últimos YA con el efecto de corto plazo aplicado (y
 * clampeados donde corresponde). `deltaRelacion` es el NOMINAL,
 * antes de la moderación en extremos — eso lo aplica motorNPCs.js,
 * es una regla transversal a los 8 verbos, no de cada uno.
 *
 * Acoplamiento documentado con Fase 3: para distinguir el tono
 * "ofrecer valor" de Negociar se importa el texto real desde
 * opcionesTono.js en vez de hardcodear el string — si Fase 3 cambia
 * la redacción de esa opción, esto se mantiene sincronizado solo en
 * vez de romperse en silencio.
 *
 * SUPUESTOS EXPLÍCITOS no cubiertos por el doc técnico tal cual está
 * redactado hoy (ver fase_4_ADENDUM.md, sección 2, para el detalle
 * completo de ambos):
 *
 * 1. AccionResuelta.resultado puede ser "neutral" (doc técnico,
 *    sección 0.1), pero la tabla de 4.1 sólo define éxito/fallo por
 *    verbo. Se trata "neutral" como no-efecto (ni delta de relación
 *    ni cambio de disposición) para los 4 verbos que distinguen
 *    éxito/fallo — un resultado inconcluso no debería penalizar
 *    igual que un fallo real. Atacar es la excepción correcta: su
 *    fila dice "cualquiera", así que -40 aplica pase lo que pase,
 *    "neutral" incluido (por eso su función ni siquiera mira
 *    `resultado`). Calmar la situación no necesita rama aparte:
 *    "fallo" ya es 0 en la tabla, así que "neutral" cae en el mismo
 *    resultado sin código adicional.
 *
 * 2. La tabla sólo documenta el delta de Negociar-éxito para el tono
 *    "ofrecer valor" (+15). No hay fila para Negociar-éxito con los
 *    otros dos tonos ("apelar a la relación", "buscar un punto
 *    medio"). Valor elegido para ese caso: +10 — a mitad de camino
 *    entre Hablar-éxito (+5, charla simple sin nada en juego) y
 *    Negociar/ofrecer-valor-éxito (+15, oferta material concreta).
 *    Coincide además con Calmar la situación-éxito (+10), que es
 *    también un éxito social sin oferta material de por medio. Dato
 *    de balance reemplazable (doc técnico, sección 9: "tabla de
 *    registro reemplazable"), no una decisión de arquitectura.
 */
import { opcionesTono } from '../opciones/opcionesTono.js';
import { clampDisposicion } from './proyeccionEstadoEmocional.js';

const TONO_NEGOCIAR_OFRECER_VALOR = opcionesTono.Negociar[0]; // 'Ofrecer algo de valor a cambio'
const DELTA_NEGOCIAR_EXITO_TONO_GENERICO = 10; // ver supuesto 2 arriba

export const registroTransicionesPorVerboPorDefecto = {
  Atacar(_resultado, ejes) {
    // "cualquiera" (doc técnico, 4.1): el resultado no importa.
    return { deltaRelacion: -40, nivelTemor: ejes.nivelTemor, nivelDisposicion: -2 };
  },

  'Hablar con...'(resultado, ejes) {
    if (resultado === 'exito') {
      return { deltaRelacion: 5, nivelTemor: ejes.nivelTemor, nivelDisposicion: clampDisposicion(ejes.nivelDisposicion + 1) };
    }
    if (resultado === 'fallo') {
      return { deltaRelacion: -5, nivelTemor: ejes.nivelTemor, nivelDisposicion: clampDisposicion(ejes.nivelDisposicion - 1) };
    }
    return { deltaRelacion: 0, nivelTemor: ejes.nivelTemor, nivelDisposicion: ejes.nivelDisposicion }; // neutral, ver supuesto 1
  },

  Negociar(resultado, ejes, opcionElegidaId) {
    if (resultado === 'exito') {
      const ofrecioValor = opcionElegidaId === TONO_NEGOCIAR_OFRECER_VALOR;
      return {
        deltaRelacion: ofrecioValor ? 15 : DELTA_NEGOCIAR_EXITO_TONO_GENERICO,
        nivelTemor: ejes.nivelTemor,
        nivelDisposicion: clampDisposicion(ejes.nivelDisposicion + 1),
      };
    }
    if (resultado === 'fallo') {
      return { deltaRelacion: -10, nivelTemor: ejes.nivelTemor, nivelDisposicion: clampDisposicion(ejes.nivelDisposicion - 1) };
    }
    return { deltaRelacion: 0, nivelTemor: ejes.nivelTemor, nivelDisposicion: ejes.nivelDisposicion }; // neutral, ver supuesto 1
  },

  Presionar(resultado, ejes) {
    if (resultado === 'exito') {
      return { deltaRelacion: 5, nivelTemor: ejes.nivelTemor, nivelDisposicion: clampDisposicion(ejes.nivelDisposicion - 1) };
    }
    if (resultado === 'fallo') {
      // Fallo: se fija en -2 directo (no es un delta relativo), igual que Atacar.
      return { deltaRelacion: -15, nivelTemor: ejes.nivelTemor, nivelDisposicion: -2 };
    }
    return { deltaRelacion: 0, nivelTemor: ejes.nivelTemor, nivelDisposicion: ejes.nivelDisposicion }; // neutral, ver supuesto 1
  },

  'Calmar la situación'(resultado, ejes) {
    if (resultado !== 'exito') {
      // Cubre "fallo" (doc técnico: delta 0, sin cambio) y también
      // "neutral" (supuesto 1) — mismo resultado para ambos, no hace
      // falta distinguirlos acá.
      return { deltaRelacion: 0, nivelTemor: ejes.nivelTemor, nivelDisposicion: ejes.nivelDisposicion };
    }
    // Regla de prioridad (doc técnico, 4.1): calma primero el miedo
    // por la situación externa; si no había miedo que calmar, recién
    // ahí mejora la disposición hacia el jugador.
    if (ejes.nivelTemor > 0) {
      return { deltaRelacion: 10, nivelTemor: ejes.nivelTemor - 1, nivelDisposicion: ejes.nivelDisposicion };
    }
    if (ejes.nivelDisposicion <= -1) {
      return { deltaRelacion: 10, nivelTemor: ejes.nivelTemor, nivelDisposicion: clampDisposicion(ejes.nivelDisposicion + 1) };
    }
    return { deltaRelacion: 10, nivelTemor: ejes.nivelTemor, nivelDisposicion: ejes.nivelDisposicion };
  },
};
