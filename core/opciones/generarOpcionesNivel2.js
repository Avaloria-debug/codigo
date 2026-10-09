import { poolDesesperadoSalidas, poolDesesperadoCobertura } from './poolsDesesperados.js';
import { opcionesTono } from './opcionesTono.js';
import { objetosUsablesDeInventario } from './generarOpcionesNivel1.js';

/**
 * Opción fija por verbo del patrón "objetos" (sección 4.2). Garantiza
 * que Atacar/Defender nunca caen en el fallback desesperado.
 */
const OPCION_FIJA_POR_VERBO = {
  Atacar: 'Atacar a mano limpia',
  Defender: 'Defenderse con lo que tengas a mano',
};

function completarConDesesperadas(opcionesReales, poolDesesperado, minimo) {
  const faltantes = minimo - opcionesReales.length;
  if (faltantes <= 0) return opcionesReales;
  const desesperadas = poolDesesperado.slice(0, faltantes).map((etiqueta) => ({
    etiqueta,
    comportamientoAlElegir: 'seResuelveSola',
    riesgosa: true,
  }));
  return [...opcionesReales, ...desesperadas];
}

/**
 * Objetos de jugador.inventario + escena.objetosPresentes cuyo
 * utilizableComo incluye la categoría del verbo (nombre en
 * minúsculas — así están los valores de ejemplo en Fase 0/3, ej.
 * "atacar"). Deduplicado por id.
 */
function objetosUtilizablesParaVerbo(nombreVerbo, jugador, escena, objetosPorId) {
  const categoria = nombreVerbo.toLowerCase();
  const idsCandidatos = [
    ...(jugador.inventario ?? []).map((item) => item.objetoId),
    ...(escena.objetosPresentes ?? []),
  ];
  const vistos = new Set();
  const resultado = [];
  for (const id of idsCandidatos) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    const obj = objetosPorId.get(id);
    if (obj?.utilizableComo?.includes(categoria)) resultado.push(obj);
  }
  return resultado;
}

/**
 * Fase 3 — Nivel 2: concreción (documento técnico, sección 4.5).
 *
 * "usar" no está en la tabla 4.2 original (esa tabla es sólo para
 * verbos ligados a estado) — se agrega acá porque "Usar" también
 * puede necesitar Nivel 2 cuando hay más de un objeto utilizable
 * (sección 3.1). No usa registroPatrones porque "Usar" no es un
 * verbo ligado a estado; se identifica por nombre directamente.
 * Ver fase_3_ADENDUM.md, sección 2, para la semántica completa
 * (nunca produce el mismo efecto que un verbo de estado).
 *
 * @param {{nombre: string, tipoResolucion: string}} verboSeleccionado
 * @param {object} escena
 * @param {object} jugador
 * @param {Record<string, string>} registroPatrones
 * @param {Map<string, object>} objetosPorId
 * @returns {Array<object>}
 */
export function generarOpcionesNivel2(verboSeleccionado, escena, jugador, registroPatrones, objetosPorId) {
  const nombre = verboSeleccionado.nombre;
  const patron = nombre === 'Usar' ? 'usar' : registroPatrones[nombre];

  switch (patron) {
    case 'salidas': {
      const opcionesReales = (escena.salidas ?? []).slice(0, 4).map((s) => ({
        etiqueta: `${nombre} hacia ${s.etiqueta}`,
        escenaDestinoId: s.escenaDestinoId,
        comportamientoAlElegir: 'seResuelveSola',
      }));
      return completarConDesesperadas(opcionesReales, poolDesesperadoSalidas, 3);
    }

    case 'cobertura': {
      const opcionesReales = (escena.coberturaDisponible ?? []).slice(0, 4).map((lugar) => ({
        etiqueta: `${nombre} desde ${lugar}`,
        comportamientoAlElegir: 'seResuelveSola',
      }));
      return completarConDesesperadas(opcionesReales, poolDesesperadoCobertura, 3);
    }

    case 'objetos': {
      const opcionesReales = objetosUtilizablesParaVerbo(nombre, jugador, escena, objetosPorId).map((obj) => ({
        etiqueta: `${nombre} con ${obj.nombre}`,
        objetoObjetivo: obj.id,
        comportamientoAlElegir: 'seResuelveSola',
      }));
      opcionesReales.push({
        etiqueta: OPCION_FIJA_POR_VERBO[nombre] ?? `${nombre} sin objeto`,
        comportamientoAlElegir: 'seResuelveSola',
      });
      return opcionesReales; // nunca necesita fallback desesperado
    }

    case 'tono': {
      return (opcionesTono[nombre] ?? []).map((etiqueta) => ({
        etiqueta,
        comportamientoAlElegir: 'abreTextoLibreConContexto',
      }));
    }

    case 'usar': {
      return objetosUsablesDeInventario(jugador, objetosPorId).map((obj) => ({
        etiqueta: `Usar ${obj.nombre}`,
        objetoObjetivo: obj.id,
        comportamientoAlElegir: 'seResuelveSola',
      }));
    }

    default:
      // No alcanzable con el registro cerrado actual (documento
      // técnico, sección 4.1 + fase_3_ADENDUM.md sección 3): un
      // verbo "concrecion" sin patrón registrado. Se reporta y no
      // se rompe, mismo criterio que Fase 1/2 — nunca se inventa un
      // menú de texto libre sin dueño.
      console.warn(`generarOpcionesNivel2: sin patrón registrado para el verbo '${nombre}'.`);
      return [];
  }
}
