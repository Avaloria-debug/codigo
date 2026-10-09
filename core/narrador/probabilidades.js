/**
 * Fase 5 — Probabilidades de resolución de acciones. Ver doc técnico
 * Fase 5, secciones 2.2, 2.3 y 2.3bis, y fase_5_ADENDUM.md sección 2.
 *
 * Registro de datos, no lógica hardcodeada — mismo criterio que
 * registroPatrones.js (Fase 3) / registroTransicionesPorVerbo.js
 * (Fase 4): reemplazable por lore real sin tocar resolverAccion.js.
 *
 * Cobertura del registro: exactamente los 11 verbos "concrecion" que
 * hoy existen en registroVerbosPorEstado.js (Fase 3) más "Hablar
 * con..." (contextual, textoLibre). "Usar" NO está acá — se resuelve
 * aparte en resolverAccion.js (ver fase_5_ADENDUM.md sección 2, la
 * decisión de reordenar el chequeo de "Usar" antes del atajo de
 * "inmediata"). Los verbos "inmediata" (Explorar, Descansar,
 * Observar, Examinar, "Avanzar con cautela", Rendirse) tampoco
 * aparecen: nunca llegan a esta tabla, resuelven "neutral" directo.
 */

/**
 * Tabla 2.2 (doc técnico). Cada entrada declara CÓMO calcular la
 * probabilidad base, no un número plano — el "tipo" determina qué
 * sub-campo de la opción de Nivel 2 hay que mirar:
 *
 * - "objetos" (Atacar/Defender): `conObjeto` si opcionNivel2 trae
 *   `objetoObjetivo`, `fija` si es la opción fija ("a mano limpia").
 * - "riesgo" (salidas/cobertura): `riesgosa` si opcionNivel2.riesgosa
 *   === true (pool desesperado, Fase 3 sección 4.3), `limpia` si no.
 * - "fija": no depende de opcionNivel2 en absoluto (patrón tono, y
 *   "Hablar con..." que ni siquiera tiene Nivel 2).
 *
 * @type {Record<string, {tipo: "objetos", conObjeto: number, fija: number} | {tipo: "riesgo", limpia: number, riesgosa: number} | {tipo: "fija", valor: number}>}
 */
export const registroProbabilidadBase = {
  Atacar: { tipo: 'objetos', conObjeto: 65, fija: 45 },
  Defender: { tipo: 'objetos', conObjeto: 65, fija: 45 },

  Huir: { tipo: 'riesgo', limpia: 70, riesgosa: 30 },
  Retirarse: { tipo: 'riesgo', limpia: 70, riesgosa: 30 },
  Abortar: { tipo: 'riesgo', limpia: 70, riesgosa: 30 },
  Emboscar: { tipo: 'riesgo', limpia: 70, riesgosa: 30 },
  Ocultarse: { tipo: 'riesgo', limpia: 70, riesgosa: 30 },

  Negociar: { tipo: 'fija', valor: 55 },
  Presionar: { tipo: 'fija', valor: 55 },
  'Calmar la situación': { tipo: 'fija', valor: 55 },
  Distraer: { tipo: 'fija', valor: 55 },

  'Hablar con...': { tipo: 'fija', valor: 60 },
};

/** Sección 2.2/2.3bis: base fija de "Usar", antes del modificador por confiabilidad. */
export const PROBABILIDAD_BASE_USAR = 75;

/**
 * Tabla 2.3. Claves = categorías ya cerradas en Fase 4
 * (`categoriaDeRelacion`, core/npcs/categoriasRelacion.js) — se
 * reutiliza esa función en vez de reimplementar los rangos de
 * relacion.valor acá (ver fase_5_ADENDUM.md, sección 3).
 */
export const MODIFICADOR_POR_CATEGORIA_RELACION = {
  Hostil: -25,
  Desconfiado: -10,
  Neutral: 0,
  Cordial: 10,
  Aliado: 20,
};

/** Tabla 2.3bis. Sólo la consume "Usar" — ver resolverAccion.js. */
export const MODIFICADOR_POR_CONFIABILIDAD = {
  fragil: -20,
  estandar: 0,
  resistente: 15,
};

/**
 * @param {{nombre: string}} verbo
 * @param {object|null} [opcionNivel2]
 * @returns {number} Probabilidad base (0-100, sin clamp todavía).
 */
export function probabilidadBase(verbo, opcionNivel2) {
  const entrada = registroProbabilidadBase[verbo.nombre];

  if (!entrada) {
    // Teóricamente inalcanzable con el registro cerrado actual (cubre
    // los 11 verbos "concrecion" + Hablar con... — ver comentario de
    // archivo). Mismo criterio que generarOpcionesNivel2.js (Fase 3)
    // para un verbo "concrecion" sin patrón: reportar y no romper, en
    // vez de inventar un número sin fundamento silenciosamente.
    console.warn(`probabilidadBase: sin entrada registrada para el verbo '${verbo.nombre}'. Se usa 50 (neutro) como fallback.`);
    return 50;
  }

  switch (entrada.tipo) {
    case 'objetos':
      return opcionNivel2?.objetoObjetivo != null ? entrada.conObjeto : entrada.fija;
    case 'riesgo':
      return opcionNivel2?.riesgosa === true ? entrada.riesgosa : entrada.limpia;
    case 'fija':
    default:
      return entrada.valor;
  }
}

/**
 * Sección 2.3. `categoria` viene de `categoriaDeRelacion` (Fase 4) —
 * esta función no recalcula la categoría por su cuenta, la recibe ya
 * resuelta para no importar categoriasRelacion.js en dos lugares con
 * el riesgo de que se desincronicen las firmas.
 *
 * @param {"Hostil"|"Desconfiado"|"Neutral"|"Cordial"|"Aliado"} categoria
 */
export function modificadorPorRelacion(categoria) {
  return MODIFICADOR_POR_CATEGORIA_RELACION[categoria] ?? 0;
}

/**
 * Sección 2.3bis. Objeto sin `confiabilidad` explícita (fixtures
 * viejos que no pasaron por `crearObjeto`, ver Fase 0 sección 3.8) se
 * trata como "estandar" acá mismo, en el punto de uso — no depender
 * de que la fuente de datos ya haya aplicado el default.
 *
 * @param {"fragil"|"estandar"|"resistente"|undefined} confiabilidad
 */
export function modificadorPorConfiabilidad(confiabilidad) {
  return MODIFICADOR_POR_CONFIABILIDAD[confiabilidad ?? 'estandar'] ?? 0;
}

/** Sección 2.3/2.3bis: clamp final, siempre 5-95, sin excepción. */
export function clampProbabilidad(valor) {
  return Math.min(95, Math.max(5, valor));
}
