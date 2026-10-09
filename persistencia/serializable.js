/**
 * Fase 7 — Chequeo de serializabilidad a JSON SIN pérdida (principio 2 de
 * Fase 0). `JSON.stringify` convierte en silencio NaN/Infinity en null, un Map
 * en {} y descarta funciones: justo el tipo de pérdida que no queremos
 * descubrir el día que se carga una partida.
 *
 * Una propiedad con valor `undefined` NO se reporta: el round-trip JSON la
 * descarta y eso es lo que queremos (Firestore rechaza `undefined`). Un
 * `undefined` dentro de un array sí se reporta (se volvería `null`).
 */

function esObjetoPlano(valor) {
  const proto = Object.getPrototypeOf(valor);
  return proto === Object.prototype || proto === null;
}

/**
 * @param {unknown} valor
 * @param {string} [ruta]
 * @returns {string[]} Errores en texto plano, con la ruta del valor problemático. Vacío = serializable.
 */
export function verificarSerializable(valor, ruta = '$') {
  const errores = [];
  const ancestros = new Set();

  function visitar(v, r) {
    if (v === null) return;
    switch (typeof v) {
      case 'string':
      case 'boolean':
        return;
      case 'number':
        if (!Number.isFinite(v)) errores.push(`${r}: número no finito (${v}); JSON lo convertiría en null.`);
        return;
      case 'undefined':
        return; // sólo llega acá vía array (ver abajo); las propiedades undefined se filtran antes
      case 'function':
      case 'symbol':
      case 'bigint':
        errores.push(`${r}: tipo no serializable (${typeof v}).`);
        return;
      default:
    }

    if (ancestros.has(v)) {
      errores.push(`${r}: referencia circular.`);
      return;
    }
    ancestros.add(v);
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item === undefined) errores.push(`${r}[${i}]: undefined dentro de un array; JSON lo convertiría en null.`);
        else visitar(item, `${r}[${i}]`);
      });
    } else if (esObjetoPlano(v)) {
      for (const [clave, item] of Object.entries(v)) {
        if (item === undefined) continue;
        visitar(item, `${r}.${clave}`);
      }
    } else {
      errores.push(`${r}: objeto no plano (${v?.constructor?.name ?? 'desconocido'}); no sobrevive a JSON sin pérdida.`);
    }
    ancestros.delete(v);
  }

  visitar(valor, ruta);
  return errores;
}
