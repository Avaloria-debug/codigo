/**
 * Fase 7 — "Nube" en memoria con el mismo contrato que el adaptador de
 * Firebase: `guardarPartida(payload)` y `cargarPartida(codigo)`. Sirve para
 * tests y para el panel de Fase 8 (simular caída de red sin tocar Firebase),
 * igual que el modo mock de Fase 6.
 *
 * Guarda copias JSON de lo que recibe (como un servidor real) y guarda el
 * último payload crudo para poder inspeccionar EXACTAMENTE qué se envió.
 */

export function crearAdaptadorNubeEnMemoria({ documentosIniciales = {} } = {}) {
  const documentos = new Map(
    Object.entries(documentosIniciales).map(([codigo, doc]) => [codigo, JSON.parse(JSON.stringify(doc))])
  );
  let _fallo = null;
  const envios = [];

  function chequearFallo() {
    if (_fallo) throw new Error(_fallo);
  }

  return {
    async guardarPartida(payload) {
      chequearFallo();
      const texto = JSON.stringify(payload);
      envios.push(texto);
      documentos.set(payload.codigoPartida, JSON.parse(texto));
    },
    async cargarPartida(codigo) {
      chequearFallo();
      return documentos.has(codigo) ? JSON.parse(JSON.stringify(documentos.get(codigo))) : null;
    },

    /** Simula una falla de red/cuota. `null` la apaga. */
    simularFallo(mensaje = 'Fallo de red simulado') {
      _fallo = mensaje;
    },
    repararFallo() {
      _fallo = null;
    },
    /** Sólo tests/panel: todos los payloads enviados, como texto JSON. */
    enviosComoTexto() {
      return [...envios];
    },
    /** Sólo tests/panel: documento actual sin pasar por el contrato. */
    documento(codigo) {
      return documentos.has(codigo) ? JSON.parse(JSON.stringify(documentos.get(codigo))) : null;
    },
    /** Sólo tests/panel: pisa un documento (para armar nubes inválidas). */
    poner(codigo, doc) {
      documentos.set(codigo, JSON.parse(JSON.stringify(doc)));
    },
  };
}
