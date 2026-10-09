/**
 * Fase 3 — Modelo de Objeto. Fase 0 nunca definió este esquema; lo
 * define Fase 3 (documento técnico, sección 0.1) porque el sistema
 * de opciones necesita saber para qué sirve cada objeto. Integrado
 * a Fase 0 como fuente canónica (fase_3_ADENDUM.md, sección 1).
 *
 * `confiabilidad` se agrega en Fase 5 (doc técnico Fase 0, sección
 * 3.8; fase_5_ADENDUM.md, sección 1) — cambio puramente aditivo, no
 * toca `id`/`nombre`/`tipo`/`utilizableComo` ni su comportamiento.
 */

/**
 * @typedef {Object} Objeto
 * @property {string} id
 * @property {string} nombre - Nombre visible.
 * @property {string} tipo - Categoría libre (ej. "arma", "herramienta", "consumible", "objeto_narrativo").
 * @property {string[]} utilizableComo - Categorías de verbo donde este objeto es una opción válida (ej. ["atacar"], ["atacar", "emboscar"]). Puede ser vacío (objeto puramente narrativo).
 * @property {"fragil"|"estandar"|"resistente"} confiabilidad - Qué tan probable es que el objeto falle físicamente al usarse con fuerza. Sólo lo consume el verbo "Usar" (Fase 5) — no afecta el patrón "objetos" de Atacar/Defender (Fase 3).
 */

/**
 * Crea un Objeto aplicando los defaults documentados. No inventa
 * valores para campos con significado propio (id, nombre, tipo): si
 * se omiten, quedan undefined para que validarEstructura los marque
 * como faltantes. `confiabilidad` sí tiene default documentado
 * ("estandar") — mismo criterio que `utilizableComo` (`[]`).
 *
 * @param {Partial<Objeto>} [datos]
 * @returns {Objeto}
 */
export function crearObjeto(datos = {}) {
  return {
    id: datos.id,
    nombre: datos.nombre,
    tipo: datos.tipo,
    utilizableComo: datos.utilizableComo ?? [],
    confiabilidad: datos.confiabilidad ?? 'estandar',
  };
}
