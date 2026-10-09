/**
 * Fase 8 — Capa entre Fase 3 (opciones con `etiqueta`) y Fase 5 (que necesita
 * `verbo.nombre` canónico). Fase 3 no expone identidad estable: se reconstruye acá.
 */
import { generarOpcionesNivel1, generarOpcionesNivel2, registroVerbosPorEstado, registroPatrones } from '../opciones/index.js';

export function construirVerbo(opcionNivel1) {
  if (opcionNivel1.nombre) return opcionNivel1;
  const { etiqueta } = opcionNivel1;
  let nombre = etiqueta;
  if (etiqueta.startsWith('Hablar con ')) nombre = 'Hablar con...';
  else if (etiqueta.startsWith('Examinar ')) nombre = 'Examinar';
  else if (etiqueta === 'Usar' || etiqueta.startsWith('Usar ')) nombre = 'Usar';
  return { ...opcionNivel1, nombre };
}

export function escenaActualDe(estadoJuego) {
  const escena = estadoJuego.escenas.find((e) => e.id === estadoJuego.jugador.ubicacionActual);
  if (!escena) throw new Error(`Escena actual inexistente: '${estadoJuego.jugador.ubicacionActual}'.`);
  return escena;
}

export function listarNivel1(estadoJuego) {
  const escena = escenaActualDe(estadoJuego);
  return generarOpcionesNivel1(escena, escena.estadoCalculado, estadoJuego.jugador, registroVerbosPorEstado,
    estadoJuego.objetosPorId, estadoJuego.npcsPorId).map(construirVerbo);
}

export function listarNivel2(estadoJuego, verbo) {
  return generarOpcionesNivel2(construirVerbo(verbo), escenaActualDe(estadoJuego), estadoJuego.jugador,
    registroPatrones, estadoJuego.objetosPorId);
}
