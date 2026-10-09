/**
 * Fase 8 — Pantalla de diagnóstico: lo que NO se pudo verificar en el entorno
 * de construcción (CORS de Groq, tokens reales, IndexedDB real, Firebase real).
 * Cada prueba termina en exactamente uno de tres estados — nunca un "ok" falso:
 *   'paso'        la prueba corrió y lo verificado está bien
 *   'fallo'       la prueba corrió y encontró un problema
 *   'no_se_pudo'  falta una precondición (key, config, API del entorno): NO es un pasó ni un falló
 * Una precondición ausente se señala lanzando NoSePudoCorrer; CUALQUIER otra
 * excepción es 'fallo' (nunca se la convierte en no_se_pudo para ocultarla).
 * Todas las dependencias del entorno son inyectables (tests en Node con dobles).
 */
import { llamarGroq } from '../../core/ia/llamarGroq.js';
import { armarMensajes } from '../../core/ia/armarMensajes.js';
import { estimarTokensMensajes } from '../../core/ia/estimarTokens.js';
import { ErrorGroq, ErrorRateLimit } from '../../core/ia/errores.js';
import { crearAlmacenIndexedDB } from '../../persistencia/adaptadores/almacenIndexedDB.js';
import { crearClienteFirestoreWeb } from '../../persistencia/adaptadores/clienteFirestoreWeb.js';
import { crearAdaptadorFirebase } from '../../persistencia/adaptadores/firebase.js';
import { generarCodigoPartida } from '../../persistencia/codigoPartida.js';
import { VERSION_SDK_FIREBASE } from '../../persistencia/constantes.js';

export class NoSePudoCorrer extends Error {}
const paso = (detalle, datos = null) => ({ estado: 'paso', detalle, datos });
const fallo = (detalle, datos = null) => ({ estado: 'fallo', detalle, datos });

export async function correrPrueba(id, titulo, fn) {
  try { return { id, titulo, ...(await fn()) }; }
  catch (e) {
    if (e instanceof NoSePudoCorrer) return { id, titulo, estado: 'no_se_pudo', detalle: e.message, datos: null };
    return { id, titulo, estado: 'fallo', detalle: `Excepción: ${e?.message ?? e}`, datos: null };
  }
}

const ESCENA = { nombre: 'Plaza', estadoCalculado: 'tenso' };
const NPC = { nombre: 'Diagnóstico', personalidadBase: 'Hosco, directo, desconfía de forasteros.' };
const CONOCS = ['Existe un paso oculto detrás de la herrería que evita el peaje de la ciudad.', 'El guardia cobra sobornos los jueves.', 'La fuente pública está envenenada desde hace una semana.'];
/** Tres casos de la tabla 3.2 de Fase 6: sin conocimientos, típico (1 + tono), peor caso (personalidad/texto largos + 3 conocimientos). */
export function contextosDeMedicion() {
  const base = (over) => ({ npc: NPC, estadoEmocionalProyectado: 'neutral', categoriaRelacion: 'Neutral', escena: ESCENA,
    estadoMundo: { horaActual: 22, climaActual: 'lluvia' }, accionResuelta: { resultado: 'exito' }, tonoElegido: null, conocimientosRevelables: [], textoLibreJugador: 'Hola, ¿qué tal anda todo por acá?', ...over });
  return {
    sin_conocimientos: base({}),
    tipico: base({ tonoElegido: 'Apelar a la relación existente', conocimientosRevelables: [{ contenido: CONOCS[0] }] }),
    peor_caso: base({ npc: { ...NPC, personalidadBase: 'x'.repeat(300) }, textoLibreJugador: 'y '.repeat(150), conocimientosRevelables: CONOCS.map((c) => ({ contenido: c + ' ' + c })) }),
  };
}

export function pruebaGroq({ fetch = globalThis.fetch, apiKey, configuracionGroq, enLinea = () => globalThis.navigator?.onLine !== false } = {}) {
  return () => {
    if (!apiKey) throw new NoSePudoCorrer('Falta la API key de Groq (cargala en el panel).');
    if (!enLinea()) throw new NoSePudoCorrer('El navegador reporta que no hay conexión.');
    return (async () => {
      const config = { ...configuracionGroq, apiKey };
      try {
        const r = await llamarGroq([{ role: 'system', content: 'Respondé sólo "ok".' }, { role: 'user', content: 'ping' }], { ...config, maxCompletionTokens: 50 }, { fetch });
        return paso('Groq respondió desde el navegador: CORS permitido y key válida.', { finishReason: r.finishReason, usage: r.usage });
      } catch (e) {
        if (e instanceof ErrorRateLimit) return { estado: 'paso', detalle: 'CORS permitido (la respuesta 429 fue legible); cupo agotado ahora.', datos: { status: 429 } };
        if (e instanceof ErrorGroq && e.status === 0) return fallo('La petición no llegó a completarse (status 0). En el navegador CORS y red caída son INDISTINGUIBLES: abrí la pestaña Network/Consola y buscá "CORS". Si es CORS, hay que pasar por un proxy (llamarGroq está aislado para eso).', { causa: e.message });
        if (e instanceof ErrorGroq && (e.status === 401 || e.status === 403)) return fallo(`CORS permitido pero la key fue rechazada (HTTP ${e.status}).`, { status: e.status });
        if (e instanceof ErrorGroq) return fallo(`Groq respondió HTTP ${e.status}.`, { status: e.status });
        throw e;
      }
    })();
  };
}

/** Mide tokens reales de los 3 casos (consume 3 requests del cupo) y los compara con la estimación de Fase 6. */
export function pruebaTokens({ fetch = globalThis.fetch, apiKey, configuracionGroq, umbralDesvio = 0.25 } = {}) {
  return async () => {
    if (!apiKey) throw new NoSePudoCorrer('Falta la API key de Groq: sin ella no se pueden medir tokens reales.');
    const filas = [];
    for (const [caso, ctx] of Object.entries(contextosDeMedicion())) {
      const mensajes = armarMensajes(ctx);
      const estimadoEntrada = estimarTokensMensajes(mensajes);
      let r;
      try { r = await llamarGroq(mensajes, { ...configuracionGroq, apiKey }, { fetch }); }
      catch (e) { if (e instanceof ErrorGroq && e.status === 0) throw new NoSePudoCorrer('No hubo respuesta de Groq (red o CORS): corré antes la prueba de CORS.'); throw e; }
      const u = r.usage ?? {};
      filas.push({ caso, estimadoEntrada, realEntrada: u.prompt_tokens ?? null, realSalida: u.completion_tokens ?? null, realTotal: u.total_tokens ?? null,
        desvio: u.prompt_tokens ? (u.prompt_tokens - estimadoEntrada) / estimadoEntrada : null, textoVacio: !r.texto });
    }
    const sinUsage = filas.filter((f) => f.realEntrada == null);
    if (sinUsage.length) return fallo('La respuesta no trajo `usage`: no se puede calibrar.', { filas });
    const fuera = filas.filter((f) => Math.abs(f.desvio) > umbralDesvio);
    const vacios = filas.filter((f) => f.textoVacio);
    if (vacios.length) return fallo(`Respuesta vacía en: ${vacios.map((f) => f.caso).join(', ')} (¿el razonamiento se comió el tope?).`, { filas });
    if (fuera.length) return fallo(`La estimación de entrada se desvía más de ${umbralDesvio * 100}% en: ${fuera.map((f) => f.caso).join(', ')}. Recalibrar estimarTokens y el presupuesto de la sección 3.2 de Fase 6.`, { filas });
    return paso(`Estimación de entrada dentro de ±${umbralDesvio * 100}% en los 3 casos. Valores reales listos para recalibrar el addendum de Fase 6.`, { filas });
  };
}

export function pruebaIndexedDB({ indexedDB = globalThis.indexedDB } = {}) {
  return async () => {
    if (!indexedDB) throw new NoSePudoCorrer('Este entorno no expone indexedDB (modo privado de algunos navegadores, o Node).');
    const almacen = crearAlmacenIndexedDB({ nombreBD: 'motor_narracion_diagnostico', indexedDB });
    const valor = { n: 1, texto: 'ñandú', anidado: { a: [1, 2, { b: null }] } };
    await almacen.set('diag', valor);
    const leido = await almacen.get('diag');
    await almacen.delete('diag');
    const despues = await almacen.get('diag');
    if (JSON.stringify(leido) !== JSON.stringify(valor)) return fallo('Lo leído no coincide con lo escrito.', { leido });
    if (despues !== undefined && despues !== null) return fallo('El borrado no tuvo efecto.');
    return paso('IndexedDB: escribe, lee idéntico y borra.');
  };
}

/** Round-trip contra Firebase REAL. Escribe un documento de prueba (las reglas prohíben borrar: queda ahí, con código DIAG aleatorio). */
export function pruebaFirebase({ firebaseConfig, crearCliente = crearClienteFirestoreWeb, importar, fetch = globalThis.fetch, estadoDePrueba } = {}) {
  return async () => {
    if (!firebaseConfig) throw new NoSePudoCorrer('Falta el firebaseConfig de tu proyecto.');
    if (!estadoDePrueba) throw new NoSePudoCorrer('Falta un estado de partida válido para el round-trip.');
    const codigo = generarCodigoPartida();
    const adaptador = crearAdaptadorFirebase({ cliente: await crearCliente({ firebaseConfig, ...(importar ? { importar } : {}) }) });
    const doc = { ...estadoDePrueba, codigoPartida: codigo };
    await adaptador.guardarPartida(doc);
    const vuelta = await adaptador.cargarPartida(codigo);
    if (!vuelta) return fallo('Se guardó pero la lectura devolvió vacío (¿reglas de lectura?).', { codigo });
    if (JSON.stringify(vuelta) !== JSON.stringify(doc)) return fallo('El documento recuperado difiere del guardado.', { codigo });
    return paso(`Firebase: Auth anónima + escritura + lectura idéntica (código ${codigo}). SDK ${VERSION_SDK_FIREBASE} cargó (eso confirma que EXISTE, no que sea la última).`, { codigo });
  };
}

export async function ejecutarDiagnostico(config) {
  return [
    await correrPrueba('groq_cors', 'Groq desde el navegador (CORS + key)', pruebaGroq(config.groq ?? {})),
    await correrPrueba('groq_tokens', 'Tokens reales vs estimación (consume 3 requests)', pruebaTokens(config.groq ?? {})),
    await correrPrueba('indexeddb', 'IndexedDB del navegador', pruebaIndexedDB(config.indexedDB ?? {})),
    await correrPrueba('firebase', 'Firebase real (round-trip)', pruebaFirebase(config.firebase ?? {})),
  ];
}
