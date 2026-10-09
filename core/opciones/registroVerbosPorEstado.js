/**
 * Fase 3 — Registro de verbos ligados a estado (documento técnico,
 * sección 3.2). Un estado nuevo o un verbo nuevo se agregan acá,
 * sin tocar la lógica de generarOpcionesNivel1.
 *
 * @type {Record<string, Array<{nombre: string, tipoResolucion: "concrecion"|"inmediata"}>>}
 */
export const registroVerbosPorEstado = {
  tranquilo: [
    { nombre: 'Explorar', tipoResolucion: 'inmediata' },
    { nombre: 'Descansar', tipoResolucion: 'inmediata' },
  ],
  social: [{ nombre: 'Observar', tipoResolucion: 'inmediata' }],
  tenso: [
    { nombre: 'Negociar', tipoResolucion: 'concrecion' },
    { nombre: 'Presionar', tipoResolucion: 'concrecion' },
    { nombre: 'Retirarse', tipoResolucion: 'concrecion' },
  ],
  peligroso: [
    { nombre: 'Huir', tipoResolucion: 'concrecion' },
    { nombre: 'Atacar', tipoResolucion: 'concrecion' },
    { nombre: 'Emboscar', tipoResolucion: 'concrecion' },
    { nombre: 'Calmar la situación', tipoResolucion: 'concrecion' },
  ],
  sigilo: [
    { nombre: 'Ocultarse', tipoResolucion: 'concrecion' },
    { nombre: 'Avanzar con cautela', tipoResolucion: 'inmediata' },
    { nombre: 'Distraer', tipoResolucion: 'concrecion' },
    { nombre: 'Abortar', tipoResolucion: 'concrecion' },
  ],
  combate: [
    { nombre: 'Atacar', tipoResolucion: 'concrecion' },
    { nombre: 'Defender', tipoResolucion: 'concrecion' },
    { nombre: 'Huir', tipoResolucion: 'concrecion' },
    { nombre: 'Rendirse', tipoResolucion: 'inmediata' },
  ],
};
