/**
 * Fase 7 — Adaptador de Firebase (Firestore) detrás del contrato de nube:
 * `guardarPartida(payload)` / `cargarPartida(codigo)`. Todo el resto del motor
 * programa contra el contrato, nunca contra Firebase.
 *
 * El acceso real está en un `cliente` inyectable (ver clienteFirestoreWeb.js)
 * con tres operaciones: `asegurarSesion()`, `leerDocumento(coleccion, id)` y
 * `escribirDocumento(coleccion, id, datos)`. Así el adaptador se prueba con un
 * cliente falso, sin red ni SDK.
 *
 * Firestore rechaza arrays anidados y documentos de más de 1 MiB: acá se
 * verifica antes de escribir, para fallar con un mensaje claro en vez de un
 * error opaco del servidor.
 */

import { COLECCION_PARTIDAS } from '../constantes.js';
import { esCodigoPartidaValido } from '../codigoPartida.js';

const LIMITE_BYTES_SEGURO = 900_000; // Firestore: 1 MiB por documento; margen para metadatos.

function buscarArraysAnidados(valor, ruta = '$', errores = []) {
  if (Array.isArray(valor)) {
    valor.forEach((item, i) => {
      if (Array.isArray(item)) errores.push(`${ruta}[${i}]: array dentro de un array (Firestore lo rechaza).`);
      else buscarArraysAnidados(item, `${ruta}[${i}]`, errores);
    });
  } else if (valor !== null && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) buscarArraysAnidados(v, `${ruta}.${k}`, errores);
  }
  return errores;
}

/** @returns {string[]} Motivos por los que el payload no entra en Firestore. Vacío = compatible. */
export function verificarCompatibleFirestore(payload) {
  const errores = buscarArraysAnidados(payload);
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes > LIMITE_BYTES_SEGURO) {
    errores.push(`El documento pesa ${bytes} bytes; el límite seguro es ${LIMITE_BYTES_SEGURO} (Firestore: 1 MiB).`);
  }
  return errores;
}

/** @param {{ cliente: { asegurarSesion: Function, leerDocumento: Function, escribirDocumento: Function } }} config */
export function crearAdaptadorFirebase({ cliente }) {
  if (!cliente) throw new Error('crearAdaptadorFirebase: `cliente` es obligatorio.');

  function exigirCodigo(codigo) {
    if (!esCodigoPartidaValido(codigo)) {
      // También protege el path del documento: un código con '/' no llega nunca a Firestore.
      throw new Error(`Código de partida inválido: '${codigo}'.`);
    }
  }

  return {
    async guardarPartida(payload) {
      exigirCodigo(payload?.codigoPartida);
      const problemas = verificarCompatibleFirestore(payload);
      if (problemas.length > 0) throw new Error(`Payload incompatible con Firestore: ${problemas.join(' ')}`);
      await cliente.asegurarSesion();
      await cliente.escribirDocumento(COLECCION_PARTIDAS, payload.codigoPartida, payload);
    },
    async cargarPartida(codigo) {
      exigirCodigo(codigo);
      await cliente.asegurarSesion();
      const doc = await cliente.leerDocumento(COLECCION_PARTIDAS, codigo);
      return doc === undefined ? null : doc;
    },
  };
}
