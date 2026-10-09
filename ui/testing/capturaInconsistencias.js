/**
 * Fase 8 — Log de inconsistencias del panel de testing. Dos canales distintos:
 *  (1) `console.warn` — lo que 6 módulos de core reportan hoy sin canal inyectable.
 *      Se intercepta SIN tragar el warn original.
 *  (2) reportes estructurados — lo que ya devuelven calcularEstadoEscena
 *      (`reportes`), validarEstructura (`errores`) y procesarAccionResuelta (`reportes`).
 *
 * Riesgo del canal (1): si un módulo cambia cómo reporta, esto falla EN SILENCIO.
 * Mitigación: capturaInconsistencias.canarios.test.js dispara el warn conocido de
 * cada uno de los 6 módulos y exige que aparezca en el log.
 * Vive en ui/testing, no en core: es herramienta de prueba, no del motor.
 */
const MARCA = Symbol.for('motor.capturaInconsistencias');

export function crearLogInconsistencias({ max = 500, reloj = Date.now } = {}) {
  const entradas = [];
  const suscriptores = new Set();
  let contador = 0;
  return {
    agregar({ canal, origen, mensaje }) {
      const entrada = { id: ++contador, t: reloj(), canal, origen: origen ?? 'desconocido', mensaje: String(mensaje) };
      entradas.push(entrada);
      if (entradas.length > max) entradas.shift();
      for (const fn of suscriptores) { try { fn(entrada); } catch { /* un suscriptor roto no rompe el juego */ } }
      return entrada;
    },
    listar: () => [...entradas],
    limpiar: () => { entradas.length = 0; },
    suscribir(fn) { suscriptores.add(fn); return () => suscriptores.delete(fn); },
  };
}

export function origenDeMensajeWarn(mensaje) {
  return /^([A-Za-z_]\w*):/.exec(mensaje)?.[1] ?? 'desconocido';
}

/**
 * Instala (idempotente) el wrapper sobre `consola.warn`. Si ya hay uno activo
 * sobre esa consola se devuelve el MISMO handle (con su propio `log`): usar
 * siempre `handle.log`, no el que se pasó. Nunca apila wrappers.
 */
export function instalarCapturaWarn({ log = crearLogInconsistencias(), consola = console } = {}) {
  const actual = consola.warn;
  if (actual?.[MARCA]) {
    actual[MARCA].activo = true;
    return actual[MARCA].handle;
  }
  const original = actual;
  const estado = { activo: true, handle: null };
  const wrapper = function (...args) {
    original.apply(this, args); // el warn original SIEMPRE pasa
    if (!estado.activo) return;
    try {
      const mensaje = args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : String(a))).join(' ');
      log.agregar({ canal: 'console.warn', origen: origenDeMensajeWarn(mensaje), mensaje });
    } catch { /* capturar nunca debe romper el turno */ }
  };
  wrapper[MARCA] = estado;
  estado.handle = {
    log,
    get instalada() { return estado.activo; },
    /** Si alguien envolvió console.warn encima nuestro, no se puede sacar sin romperlo: se desactiva el log y el wrapper queda en modo paso. */
    desinstalar() {
      if (consola.warn === wrapper) { consola.warn = original; estado.activo = false; return { restaurado: true }; }
      estado.activo = false;
      return { restaurado: false };
    },
  };
  consola.warn = wrapper;
  return estado.handle;
}

/** Canal estructurado: [{origen, mensaje}] (jugarTurno / avanzarMundo) o strings con `origen` explícito. */
export function registrarReportes(log, reportes, origenPorDefecto = 'desconocido') {
  for (const r of reportes ?? []) {
    log.agregar(typeof r === 'string'
      ? { canal: 'estructurado', origen: origenPorDefecto, mensaje: r }
      : { canal: 'estructurado', origen: r.origen ?? origenPorDefecto, mensaje: r.mensaje });
  }
}

/** Resultado tipo validarEstructura / validarEstadoCompleto: { valido, errores } (o { evento|suceso:null, errores } de los motores). */
export function registrarValidacion(log, origen, resultado) {
  const errores = resultado?.errores ?? [];
  if (resultado?.valido === false || errores.length > 0) {
    for (const e of errores) log.agregar({ canal: 'estructurado', origen, mensaje: e });
  }
}
