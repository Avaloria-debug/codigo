/** Fase 8 — Chat mínimo. Toda la lógica vive en core/ y ui/testing/; acá sólo DOM. */
import { cargarDatasetFixtures } from '../core/cargarFixtures.js';
import { crearEstadoJuego, jugarTurno, listarNivel1, listarNivel2, escenaActualDe } from '../core/orquestador/index.js';
import { crearConfiguracionGroq, crearRegistroUso } from '../core/ia/index.js';
import { crearAlmacenIndexedDB, crearAdaptadorLocal, crearServicioPersistencia, crearAdaptadorFirebase, crearClienteFirestoreWeb,
  restaurarMotores, generarCodigoPartida, normalizarCodigoPartida } from '../persistencia/index.js';
import { crearPartidaNueva } from './partidaInicial.js';
import { instalarCapturaWarn, registrarReportes, registrarValidacion } from './testing/capturaInconsistencias.js';
import * as C from './testing/controles.js';
import { ejecutarDiagnostico } from './testing/diagnostico.js';
import { capturarEstadoCompleto } from '../persistencia/estadoCompleto.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...hijos) => { const e = Object.assign(document.createElement(tag), props); e.append(...hijos); return e; };
const captura = instalarCapturaWarn({}); const logInc = captura.log; // idempotente: si se carga dos veces reusa el handle
let g = null, servicio = null, local = null, nube = null, dataset = null, verbo = null;

const escribir = (txt, clase = '') => { $('log').append(el('div', { className: clase, textContent: txt })); $('log').scrollTop = 1e9; };
const info = () => { const e = escenaActualDe(g); $('estado').textContent = `Escena: ${e.nombre} [${e.estadoCalculado}] · día ${g.estadoMundo.diaActual} ${g.estadoMundo.horaActual}h · tick ${g.estadoMundo.ticksTranscurridos} · partida ${g.codigoPartida}`; };

function pintarOpciones() {
  info(); $('opciones').replaceChildren(); $('textoLibre').hidden = true; verbo = null;
  for (const v of listarNivel1(g)) $('opciones').append(el('button', { textContent: v.etiqueta, onclick: () => elegirVerbo(v) }));
  pintarPanel();
}
function elegirVerbo(v) {
  verbo = v;
  if (v.tipoResolucion === 'textoLibre') return pedirTexto(null);
  if (v.tipoResolucion === 'inmediata') return turno({ verbo: v });
  $('opciones').replaceChildren(...listarNivel2(g, v).map((o) => el('button', { textContent: o.etiqueta + (o.riesgosa ? ' ⚠' : ''), onclick: () =>
    o.comportamientoAlElegir === 'abreTextoLibreConContexto' ? pedirTexto(o) : turno({ verbo: v, opcionNivel2: o }) })),
    el('button', { textContent: '← volver', onclick: pintarOpciones }));
}
function pedirTexto(op) { $('opciones').replaceChildren(); $('textoLibre').hidden = false; $('txt').value = ''; $('txt').focus(); $('enviar').onclick = () => turno({ verbo, opcionNivel2: op, textoLibre: $('txt').value }); }

async function turno(eleccion) {
  try {
    const r = await jugarTurno(g, eleccion);
    escribir(`> ${eleccion.verbo.etiqueta}${eleccion.opcionNivel2 ? ' / ' + eleccion.opcionNivel2.etiqueta : ''}${eleccion.textoLibre ? ': ' + eleccion.textoLibre : ''}`, 'sis');
    escribir(r.tipo === 'dialogo' ? `[NPC] ${r.texto}` : r.texto, r.tipo === 'dialogo' ? 'npc' : '');
    if (r.origen) escribir(`  (diálogo vía ${r.origen}${r.motivo ? ': ' + r.motivo : ''}${r.tokensUsados ? ', ' + r.tokensUsados + ' tokens' : ''})`, 'sis');
    registrarReportes(logInc, r.reportes);
    r.guardado?.then((x) => { if (x && x.guardado === false) escribir(`  (guardado no completado: ${x.motivo ?? ''} ${x.error ?? ''})`, 'warn'); });
  } catch (e) { escribir(`ERROR: ${e.message}`, 'err'); console.error(e); }
  pintarOpciones();
}

// ---------- Panel ----------
const campo = (rotulo, ...c) => el('label', {}, rotulo + ' ', ...c, el('br'));
function pintarPanel() {
  $('panel').replaceChildren(seccionPartida(), seccionControles(), seccionGroq(), seccionLog(), seccionDiagnostico());
}
const accion = (txt, fn) => el('button', { textContent: txt, onclick: async () => { try { const r = await fn(); if (r?.advertencia) escribir(r.advertencia, 'warn'); if (r?.errores?.length) registrarValidacion(logInc, 'validarEstructura', r); registrarReportes(logInc, r?.reportes); } catch (e) { escribir('ERROR: ' + e.message, 'err'); } pintarOpciones(); } });

function seccionPartida() {
  const codigo = el('input', { size: 8, placeholder: 'CÓDIGO' }); const cfg = el('textarea', { rows: 3, cols: 36, placeholder: 'firebaseConfig (JSON), opcional', value: localStorage.getItem('firebaseConfig') ?? '' });
  return el('fieldset', {}, el('legend', {}, 'Partida / persistencia'),
    el('div', {}, `Código: ${g.codigoPartida} · sync pendiente: ${servicio.estado().pendienteDeSync} · nube bloqueada: ${servicio.estado().nubeBloqueada}`),
    accion('Guardar ahora', async () => { const r = await servicio.guardar(capturarEstadoCompleto({ ...g })); escribir('guardar → ' + JSON.stringify({ guardado: r.guardado, nube: r.nube, motivo: r.motivo })); registrarReportes(logInc, r.reportes, 'servicioPersistencia'); }),
    accion('Sincronizar', async () => { const r = await servicio.sincronizar(); escribir('sincronizar → ' + r.decision); registrarReportes(logInc, r.reportes, 'servicioPersistencia'); }),
    el('br'), codigo, accion('Cargar por código', async () => { const r = await servicio.cargarPorCodigo(normalizarCodigoPartida(codigo.value), { reemplazarLocal: true }); escribir('cargar → ' + r.decision); if (r.estado) await arrancarCon(r.estado); registrarReportes(logInc, r.reportes, 'servicioPersistencia'); }),
    el('br'), cfg, accion('Conectar Firebase (recarga)', () => { localStorage.setItem('firebaseConfig', cfg.value); location.reload(); }));
}
function seccionControles() {
  const tipo = el('input', { value: 'incendio', size: 14 }); const dur = el('input', { value: '5', size: 3 }); const meta = el('input', { value: '{}', size: 16 });
  const n = el('input', { value: '8', size: 3 }); const est = el('select', {}, ...['tranquilo', 'social', 'tenso', 'peligroso', 'sigilo', 'combate'].map((x) => el('option', { textContent: x })));
  const npc = el('select', {}, ...g.npcs.map((x) => el('option', { value: x.id, textContent: x.id }))); const rel = el('input', { value: '0', size: 4 }); const tem = el('input', { value: '0', size: 2 }); const dis = el('input', { value: '0', size: 2 });
  const sal = el('input', { type: 'checkbox' });
  return el('fieldset', {}, el('legend', {}, 'Inyectar condiciones'),
    campo('Evento tipo', tipo), campo('duración (vacío=null)', dur), campo('metadata JSON', meta),
    accion('Forzar evento en escena actual', () => C.forzarEvento(g, { tipo: tipo.value, escenaId: g.jugador.ubicacionActual, duracion: dur.value === '' ? null : Number(dur.value), metadata: JSON.parse(meta.value) })),
    el('hr'), campo('Avanzar N ticks', n), campo('de un salto', sal), accion('Avanzar', () => C.avanzarNTicks(g, Number(n.value), { salto: sal.checked })),
    el('hr'), campo('Forzar estado', est), accion('Forzar (NO calculado)', () => C.forzarEstadoEscena(g, g.jugador.ubicacionActual, est.value)),
    el('hr'), campo('NPC', npc), campo('relación', rel), campo('temor 0-2', tem), campo('disposición -2..1', dis),
    accion('Editar NPC', () => { C.editarNpc(g, npc.value, { relacion: Number(rel.value), nivelTemor: Number(tem.value), nivelDisposicion: Number(dis.value) }); }));
}
function seccionGroq() {
  const key = el('input', { type: 'password', size: 24, placeholder: 'API key de Groq' });
  return el('fieldset', {}, el('legend', {}, 'Groq'),
    el('div', {}, `key cargada: ${!!g.configuracionGroq.apiKey} · usos: ${JSON.stringify(g.registroUso.resumen())}`),
    key, accion('Guardar key (sólo en este navegador, texto plano en IndexedDB)', async () => { const k = key.value.trim(); await local.guardarApiKey(k); g.configuracionGroq = { ...g.configuracionGroq, apiKey: k || null }; }),
    el('br'), accion('Forzar mock ON', () => C.forzarMock(g, true)), accion('OFF', () => C.forzarMock(g, false)),
    el('br'), ...['500', 'red', '429', 'vacia'].map((t) => accion('Error ' + t, () => C.simularErrorGroq(g, t))), accion('Quitar error', () => C.simularErrorGroq(g, null)),
    el('br'), ...['rpm', 'tpm', 'rpd'].map((t) => accion('Tope ' + t, () => { const r = C.simularRateLimit(g, t); escribir('registroUso cargado: ' + JSON.stringify(r), 'warn'); })),
    accion('Reiniciar registroUso', () => { g.registroUso = crearRegistroUso({}); }));
}
function seccionLog() {
  const pre = el('pre'); const pintar = () => { pre.textContent = logInc.listar().map((e) => `[${e.canal}] ${e.origen}: ${e.mensaje}`).join('\n') || '(sin inconsistencias)'; };
  pintar(); const baja = logInc.suscribir(() => { if (pre.isConnected) pintar(); else baja(); });
  const payload = el('pre'); payload.hidden = true;
  return el('fieldset', {}, el('legend', {}, 'Log de inconsistencias (console.warn + reportes estructurados)'), pre,
    accion('Limpiar', () => logInc.limpiar()),
    accion('Ver payload a Firestore', () => { const r = C.verPayloadFirestore(g); payload.hidden = false; payload.textContent = (r.fugas ? '⚠ FUGA DETECTADA\n' : '✔ sin apiKey/registroUso\n') + (r.json ?? r.errores.join('\n')); }), payload,
    ...(nube ? ['version_futura', 'estructura', 'referencias'].map((t) => accion('Corromper nube: ' + t, () => C.corromperNube(nube, g.codigoPartida, t))) : [el('div', { className: 'sis' }, 'Sin nube conectada: no hay nada que corromper.')]));
}
function seccionDiagnostico() {
  const out = el('div'); const key = g.configuracionGroq.apiKey;
  return el('fieldset', {}, el('legend', {}, 'Diagnóstico (CORS, tokens reales, IndexedDB, Firebase)'),
    el('button', { textContent: 'Correr (la de tokens consume 3 requests)', onclick: async () => {
      out.textContent = 'corriendo…';
      const cfgFb = localStorage.getItem('firebaseConfig');
      const r = await ejecutarDiagnostico({ groq: { apiKey: key, configuracionGroq: g.configuracionGroq }, indexedDB: {},
        firebase: { firebaseConfig: cfgFb ? JSON.parse(cfgFb) : null, estadoDePrueba: capturarEstadoCompleto({ ...g, reloj: Date.now }) } });
      out.replaceChildren(...r.map((x) => el('div', {}, el('b', { className: x.estado, textContent: x.estado.toUpperCase() }), ` ${x.titulo}: ${x.detalle}`,
        x.datos?.filas ? el('pre', { textContent: JSON.stringify(x.datos.filas, null, 1) }) : '')));
    } }), out);
}

// ---------- Arranque ----------
async function arrancarCon(estado) {
  const r = restaurarMotores(estado, {});
  await montar({ codigoPartida: r.codigoPartida, jugador: r.jugador, npcs: r.npcs, escenas: r.escenas, estadoMundo: r.estadoMundo, motorEventos: r.motorEventos, motorSucesos: r.motorSucesos, motorNPCs: r.motorNPCs });
}
async function montar(partida) {
  const apiKey = await local.cargarApiKey(); const estadoUso = await local.cargarRegistroUso();
  g = crearEstadoJuego(partida, { objetos: dataset.objetos, servicioPersistencia: servicio, adaptadorLocal: local,
    configuracionGroq: crearConfiguracionGroq({ apiKey: apiKey ?? null }), registroUso: crearRegistroUso({ estadoInicial: estadoUso }) });
  registrarReportes(logInc, g.reportesIniciales);
  escribir(`Partida ${g.codigoPartida} lista.`, 'sis'); pintarOpciones();
}
async function main() {
  dataset = await cargarDatasetFixtures();
  local = crearAdaptadorLocal({ almacen: crearAlmacenIndexedDB() });
  const cfg = localStorage.getItem('firebaseConfig');
  if (cfg) { try { nube = crearAdaptadorFirebase({ cliente: await crearClienteFirestoreWeb({ firebaseConfig: JSON.parse(cfg) }) }); } catch (e) { escribir('Firebase no se pudo iniciar: ' + e.message, 'err'); } }
  servicio = crearServicioPersistencia({ adaptadorLocal: local, adaptadorNube: nube, objetos: dataset.objetos });
  const ini = await servicio.iniciar(); registrarReportes(logInc, ini.reportes, 'servicioPersistencia');
  if (ini.estado) return arrancarCon(ini.estado);
  if (ini.conflicto) {
    escribir(`Partida guardada inválida (${ini.conflicto.motivo}):\n${(ini.conflicto.errores ?? []).join('\n')}`, 'err');
    if (ini.conflicto.sobrescrituraPermitida === false) return escribir('Versión de guardado más nueva que este juego: actualizalo. No se sobrescribe nada.', 'err');
    $('opciones').append(el('button', { textContent: 'Descartar guardado local y empezar de nuevo', onclick: async () => { await servicio.descartarLocalInvalido(); location.reload(); } }));
    return;
  }
  await montar(crearPartidaNueva(dataset, generarCodigoPartida()));
}
main().catch((e) => { escribir('Fallo de arranque: ' + e.message, 'err'); console.error(e); });
