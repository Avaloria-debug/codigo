import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { correrPrueba, NoSePudoCorrer, pruebaGroq, pruebaTokens, pruebaIndexedDB, pruebaFirebase, ejecutarDiagnostico, contextosDeMedicion } from './diagnostico.js';
import { crearConfiguracionGroq } from '../../core/ia/configuracionGroq.js';
import { armarPartida } from '../../persistencia/utilsPrueba.js';
import { estimarTokensMensajes, armarMensajes } from '../../core/ia/index.js';
import { crearAdaptadorNubeEnMemoria } from '../../persistencia/index.js';

const config = crearConfiguracionGroq();
const resp = (status, json = {}, headers = new Map()) => ({ ok: status >= 200 && status < 300, status, headers, text: async () => 'x', json: async () => json });
const ok = (content = 'ok', usage = { prompt_tokens: 300, completion_tokens: 5, total_tokens: 305 }) => async () => resp(200, { choices: [{ message: { content }, finish_reason: 'stop' }], usage });
const estado = (id, r) => r.find((x) => x.id === id).estado;

describe('runner: tres estados, nunca un ok falso', () => {
  test('NoSePudoCorrer -> no_se_pudo; cualquier otra excepción -> fallo (no se esconde)', async () => {
    assert.equal((await correrPrueba('a', 'A', () => { throw new NoSePudoCorrer('falta x'); })).estado, 'no_se_pudo');
    const r = await correrPrueba('a', 'A', () => { throw new TypeError('bug'); });
    assert.equal(r.estado, 'fallo'); assert.match(r.detalle, /bug/);
  });
});

describe('Groq / CORS', () => {
  test('sin key -> no_se_pudo; sin conexión -> no_se_pudo', async () => {
    assert.equal((await correrPrueba('g', 'G', pruebaGroq({ configuracionGroq: config }))).estado, 'no_se_pudo');
    assert.equal((await correrPrueba('g', 'G', pruebaGroq({ apiKey: 'k', configuracionGroq: config, enLinea: () => false }))).estado, 'no_se_pudo');
  });
  test('200 -> paso; 401 -> fallo (pero con CORS permitido); 500 -> fallo; 429 legible -> paso', async () => {
    const run = (fetch) => correrPrueba('g', 'G', pruebaGroq({ apiKey: 'k', configuracionGroq: config, fetch, enLinea: () => true }));
    assert.equal((await run(ok())).estado, 'paso');
    const r401 = await run(async () => resp(401)); assert.equal(r401.estado, 'fallo'); assert.match(r401.detalle, /CORS permitido/);
    assert.equal((await run(async () => resp(500))).estado, 'fallo');
    assert.equal((await run(async () => resp(429, {}, new Map([['retry-after', '1']])))).estado, 'paso');
  });
  test('TypeError de red/CORS -> fallo que dice que son indistinguibles (no afirma CORS)', async () => {
    const r = await correrPrueba('g', 'G', pruebaGroq({ apiKey: 'k', configuracionGroq: config, enLinea: () => true, fetch: async () => { throw new TypeError('Failed to fetch'); } }));
    assert.equal(r.estado, 'fallo'); assert.match(r.detalle, /INDISTINGUIBLES/);
  });
});

describe('tokens medidos', () => {
  test('sin key -> no_se_pudo', async () => assert.equal((await correrPrueba('t', 'T', pruebaTokens({ configuracionGroq: config }))).estado, 'no_se_pudo'));
  test('paso: usage coherente con la estimación -> devuelve filas medidas por caso', async () => {
    const ctx = contextosDeMedicion(); let i = 0; const nombres = Object.keys(ctx);
    const fetch = async () => { const est = estimarTokensMensajes(armarMensajes(ctx[nombres[i++]])); return ok('ok', { prompt_tokens: est + 5, completion_tokens: 20, total_tokens: est + 25 })(); };
    const r = await correrPrueba('t', 'T', pruebaTokens({ apiKey: 'k', configuracionGroq: config, fetch }));
    assert.equal(r.estado, 'paso'); assert.deepEqual(r.datos.filas.map((f) => f.caso), nombres); assert.ok(r.datos.filas.every((f) => f.realTotal > 0));
  });
  test('fallo: la estimación subestima mucho -> avisa que hay que recalibrar y devuelve las filas', async () => {
    const r = await correrPrueba('t', 'T', pruebaTokens({ apiKey: 'k', configuracionGroq: config, fetch: ok('ok', { prompt_tokens: 5000, completion_tokens: 5, total_tokens: 5005 }) }));
    assert.equal(r.estado, 'fallo'); assert.match(r.detalle, /Recalibrar/); assert.equal(r.datos.filas.length, 3);
  });
  test('fallo: respuesta vacía o sin usage', async () => {
    assert.equal((await correrPrueba('t', 'T', pruebaTokens({ apiKey: 'k', configuracionGroq: config, fetch: ok('') }))).estado, 'fallo');
    assert.equal((await correrPrueba('t', 'T', pruebaTokens({ apiKey: 'k', configuracionGroq: config, fetch: async () => resp(200, { choices: [{ message: { content: 'hola' } }] }) }))).estado, 'fallo');
  });
  test('los 3 contextos de medición generan prompts de tamaño creciente', () => {
    const [a, b, c] = Object.values(contextosDeMedicion()).map((x) => estimarTokensMensajes(armarMensajes(x)));
    assert.ok(a < b && b < c);
  });
});

describe('IndexedDB', () => {
  test('sin indexedDB -> no_se_pudo', async () => assert.equal((await correrPrueba('i', 'I', pruebaIndexedDB({ indexedDB: null }))).estado, 'no_se_pudo'));
  test('un indexedDB que explota -> fallo', async () => {
    const roto = { open() { throw new Error('SecurityError'); } };
    const r = await correrPrueba('i', 'I', pruebaIndexedDB({ indexedDB: roto })); assert.equal(r.estado, 'fallo');
  });
});

describe('Firebase', () => {
  const estadoDePrueba = { versionEsquema: 1, ultimaModificacion: 1, codigoPartida: 'AAAAAA', x: 1 };
  test('sin config o sin estado -> no_se_pudo', async () => {
    assert.equal((await correrPrueba('f', 'F', pruebaFirebase({ estadoDePrueba }))).estado, 'no_se_pudo');
    assert.equal((await correrPrueba('f', 'F', pruebaFirebase({ firebaseConfig: {} }))).estado, 'no_se_pudo');
  });
  const clienteFalso = (modo) => { const db = new Map(); return {
    async asegurarSesion() { if (modo === 'sin_sesion') throw new Error('auth/operation-not-allowed'); },
    async escribirDocumento(col, id, doc) { db.set(`${col}/${id}`, modo === 'distinto' ? { ...doc, x: 2 } : doc); },
    async leerDocumento(col, id) { return modo === 'vacio' ? null : db.get(`${col}/${id}`) ?? null; } }; };
  const run = (modo) => correrPrueba('f', 'F', pruebaFirebase({ firebaseConfig: {}, estadoDePrueba, crearCliente: async () => clienteFalso(modo) }));
  test('round-trip idéntico -> paso', async () => { const r = await run('ok'); assert.equal(r.estado, 'paso'); assert.match(r.datos.codigo, /^[2-9A-HJKMNP-Z]{6}$/); });
  test('documento que vuelve distinto, vacío, o Auth anónima deshabilitada -> fallo', async () => {
    for (const modo of ['distinto', 'vacio', 'sin_sesion']) assert.equal((await run(modo)).estado, 'fallo', modo);
  });
});

describe('ejecutarDiagnostico sin nada configurado', () => {
  test('en un entorno vacío (Node, sin key ni config) todo es no_se_pudo — jamás "paso"', async () => {
    const r = await ejecutarDiagnostico({ indexedDB: { indexedDB: null } });
    assert.deepEqual(r.map((x) => x.estado), ['no_se_pudo', 'no_se_pudo', 'no_se_pudo', 'no_se_pudo']);
  });
});
