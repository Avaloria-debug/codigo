import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearAdaptadorLocal } from './local.js';
import { crearAlmacenEnMemoria } from './almacenEnMemoria.js';
import { crearAlmacenIndexedDB } from './almacenIndexedDB.js';
import { crearAdaptadorNubeEnMemoria } from './nubeEnMemoria.js';
import { crearAdaptadorFirebase, verificarCompatibleFirestore } from './firebase.js';
import { crearClienteFirestoreWeb } from './clienteFirestoreWeb.js';
import { crearRegistroUso } from '../../core/ia/registroUso.js';
import { armarPartida } from '../utilsPrueba.js';

/** Doble mínimo de IndexedDB: suficiente para el contrato get/put/delete, asíncrono como el real. */
function crearIndexedDBFalso() {
  const stores = new Map();
  const aviso = (peticion, resultado, error) =>
    queueMicrotask(() => (error ? (peticion.error = error, peticion.onerror?.()) : (peticion.result = resultado, peticion.onsuccess?.())));
  const bd = {
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore: (n) => stores.set(n, new Map()),
    transaction: (nombre) => ({
      objectStore: () => {
        const datos = stores.get(nombre);
        return {
          get: (k) => { const p = {}; aviso(p, datos.has(k) ? structuredClone(datos.get(k)) : undefined); return p; },
          put: (v, k) => { const p = {}; datos.set(k, structuredClone(v)); aviso(p, k); return p; },
          delete: (k) => { const p = {}; datos.delete(k); aviso(p, undefined); return p; },
        };
      },
    }),
  };
  let aperturas = 0;
  return {
    get aperturas() { return aperturas; },
    open: () => {
      aperturas += 1;
      const p = { result: bd };
      queueMicrotask(() => { if (!stores.has('kv')) p.onupgradeneeded?.(); p.onsuccess?.(); });
      return p;
    },
  };
}

describe('adaptadorLocal', () => {
  test('guarda y carga la partida; vacío devuelve null; borrarLocal la saca', async () => {
    const local = crearAdaptadorLocal({ almacen: crearAlmacenEnMemoria() });
    assert.equal(await local.cargarLocal(), null);
    const estado = armarPartida().capturar();
    await local.guardarLocal(estado);
    assert.deepEqual(await local.cargarLocal(), estado);
    await local.borrarLocal();
    assert.equal(await local.cargarLocal(), null);
  });

  test('apiKey y registroUso viven bajo claves separadas de la partida', async () => {
    const almacen = crearAlmacenEnMemoria();
    const local = crearAdaptadorLocal({ almacen });
    await local.guardarLocal(armarPartida().capturar());
    await local.guardarApiKey('gsk_abc');
    await local.guardarRegistroUso({ llamadas: [] });
    assert.deepEqual(almacen.claves().sort(), ['api_key', 'partida_activa', 'registro_uso']);
    assert.ok(!JSON.stringify(await local.cargarLocal()).includes('gsk_abc'));
  });

  test('cambiar de API key descarta el registro de uso (otro cupo); la misma key lo conserva', async () => {
    const local = crearAdaptadorLocal({ almacen: crearAlmacenEnMemoria() });
    await local.guardarApiKey('key_1');
    await local.guardarRegistroUso({ llamadas: [{ t: 1, tokens: 5 }] });
    await local.guardarApiKey('key_1');
    assert.ok(await local.cargarRegistroUso());
    await local.guardarApiKey('key_2');
    assert.equal(await local.cargarRegistroUso(), null);
    assert.equal(await local.cargarApiKey(), 'key_2');
  });

  test('ROUND-TRIP con el registroUso real de Fase 6: serializar → guardar → cargar → estadoInicial conserva las ventanas', async () => {
    const reloj = () => 1_000_000;
    const original = crearRegistroUso({ reloj });
    original.registrar({ tokens: 300 });
    original.registrar({ tokens: 450 });

    const local = crearAdaptadorLocal({ almacen: crearAlmacenEnMemoria() });
    await local.guardarRegistroUso(original.serializar());
    const restaurado = crearRegistroUso({ reloj, estadoInicial: await local.cargarRegistroUso() });
    assert.deepEqual(restaurado.resumen(), original.resumen());
    assert.equal(restaurado.resumen().tokensUltimoMinuto, 750);
  });

  test('sin almacen lanza', () => {
    assert.throws(() => crearAdaptadorLocal({}), /almacen/);
  });
});

describe('almacenIndexedDB (con IndexedDB falso inyectado)', () => {
  test('get/set/delete, y lo leído no comparte referencias con lo escrito', async () => {
    const almacen = crearAlmacenIndexedDB({ indexedDB: crearIndexedDBFalso() });
    assert.equal(await almacen.get('x'), undefined);
    const valor = { a: { b: 1 } };
    await almacen.set('x', valor);
    valor.a.b = 99;
    assert.deepEqual(await almacen.get('x'), { a: { b: 1 } });
    await almacen.delete('x');
    assert.equal(await almacen.get('x'), undefined);
  });

  test('abre la base una sola vez para varias operaciones', async () => {
    const idb = crearIndexedDBFalso();
    const almacen = crearAlmacenIndexedDB({ indexedDB: idb });
    await almacen.set('a', 1);
    await almacen.get('a');
    await almacen.set('b', 2);
    assert.equal(idb.aperturas, 1);
  });

  test('funciona como almacén del adaptadorLocal', async () => {
    const local = crearAdaptadorLocal({ almacen: crearAlmacenIndexedDB({ indexedDB: crearIndexedDBFalso() }) });
    const estado = armarPartida().capturar();
    await local.guardarLocal(estado);
    assert.deepEqual(await local.cargarLocal(), estado);
  });

  test('sin indexedDB disponible lanza un error claro; un open que falla permite reintentar', async () => {
    assert.throws(() => crearAlmacenIndexedDB({ indexedDB: null }), /no hay indexedDB/);
    let intentos = 0;
    const idbRoto = {
      open: () => {
        intentos += 1;
        const p = {};
        queueMicrotask(() => { p.error = new Error('bloqueada'); p.onerror?.(); });
        return p;
      },
    };
    const almacen = crearAlmacenIndexedDB({ indexedDB: idbRoto });
    await assert.rejects(() => almacen.get('x'), /bloqueada/);
    await assert.rejects(() => almacen.get('x'), /bloqueada/);
    assert.equal(intentos, 2);
  });
});

describe('nubeEnMemoria', () => {
  test('guarda copias y registra exactamente el texto enviado', async () => {
    const nube = crearAdaptadorNubeEnMemoria();
    const estado = armarPartida().capturar();
    await nube.guardarPartida(estado);
    estado.jugador.nombre = 'mutado';
    assert.notEqual((await nube.cargarPartida('K7M2XP')).jugador.nombre, 'mutado');
    assert.equal(nube.enviosComoTexto().length, 1);
    assert.equal(await nube.cargarPartida('NOEXIS'), null);
  });

  test('simularFallo hace fallar guardar y cargar; repararFallo lo apaga', async () => {
    const nube = crearAdaptadorNubeEnMemoria();
    nube.simularFallo('caída');
    await assert.rejects(() => nube.cargarPartida('K7M2XP'), /caída/);
    await assert.rejects(() => nube.guardarPartida({ codigoPartida: 'K7M2XP' }), /caída/);
    nube.repararFallo();
    assert.equal(await nube.cargarPartida('K7M2XP'), null);
  });
});

function clienteFalso() {
  const docs = new Map();
  const llamadas = [];
  return {
    llamadas,
    docs,
    asegurarSesion: async () => { llamadas.push('sesion'); },
    leerDocumento: async (c, id) => { llamadas.push(`leer:${c}/${id}`); return docs.has(`${c}/${id}`) ? structuredClone(docs.get(`${c}/${id}`)) : null; },
    escribirDocumento: async (c, id, d) => { llamadas.push(`escribir:${c}/${id}`); docs.set(`${c}/${id}`, structuredClone(d)); },
  };
}

describe('adaptadorFirebase (con cliente falso)', () => {
  test('guarda en partidas/<código> y asegura sesión antes; carga devuelve null si no existe', async () => {
    const cliente = clienteFalso();
    const fb = crearAdaptadorFirebase({ cliente });
    const estado = armarPartida().capturar();
    await fb.guardarPartida(estado);
    assert.deepEqual(cliente.llamadas, ['sesion', 'escribir:partidas/K7M2XP']);
    assert.deepEqual(await fb.cargarPartida('K7M2XP'), estado);
    assert.equal(await fb.cargarPartida('ABCDEF'), null);
  });

  test('un código con caracteres de path NUNCA llega al cliente (no se puede salir de partidas/)', async () => {
    const cliente = clienteFalso();
    const fb = crearAdaptadorFirebase({ cliente });
    await assert.rejects(() => fb.cargarPartida('../admin'), /Código de partida inválido/);
    await assert.rejects(() => fb.guardarPartida({ codigoPartida: 'a/b' }), /Código de partida inválido/);
    assert.equal(cliente.llamadas.length, 0);
  });

  test('rechaza arrays anidados y documentos demasiado grandes ANTES de escribir, con mensaje claro', async () => {
    const cliente = clienteFalso();
    const fb = crearAdaptadorFirebase({ cliente });
    await assert.rejects(() => fb.guardarPartida({ codigoPartida: 'K7M2XP', matriz: [[1, 2]] }), /array dentro de un array/);
    await assert.rejects(() => fb.guardarPartida({ codigoPartida: 'K7M2XP', relleno: 'x'.repeat(950_000) }), /pesa/);
    assert.equal(cliente.llamadas.length, 0);
  });

  test('una partida real de los fixtures es compatible con Firestore (sin arrays anidados, muy por debajo del límite)', () => {
    const estado = armarPartida().capturar();
    assert.deepEqual(verificarCompatibleFirestore(estado), []);
    assert.ok(JSON.stringify(estado).length < 50_000);
  });

  test('si el cliente falla, el error se propaga (el servicio lo convierte en pendiente de sync)', async () => {
    const cliente = clienteFalso();
    cliente.escribirDocumento = async () => { throw new Error('permission-denied'); };
    await assert.rejects(() => crearAdaptadorFirebase({ cliente }).guardarPartida(armarPartida().capturar()), /permission-denied/);
  });

  test('sin cliente lanza', () => {
    assert.throws(() => crearAdaptadorFirebase({}), /cliente/);
  });
});

describe('clienteFirestoreWeb (con módulos del SDK falsos)', () => {
  function sdkFalso() {
    const urls = [];
    const log = [];
    const auth = { currentUser: null };
    const store = new Map();
    const modulos = {
      'firebase-app.js': { initializeApp: (cfg) => { log.push(['initializeApp', cfg.projectId]); return { app: true }; } },
      'firebase-auth.js': {
        getAuth: () => auth,
        signInAnonymously: async (a) => { log.push(['signInAnonymously']); a.currentUser = { uid: 'anon' }; },
      },
      'firebase-firestore.js': {
        getFirestore: () => ({ bd: true }),
        doc: (_bd, c, id) => `${c}/${id}`,
        getDoc: async (ref) => ({ exists: () => store.has(ref), data: () => structuredClone(store.get(ref)) }),
        setDoc: async (ref, datos) => { log.push(['setDoc', ref]); store.set(ref, structuredClone(datos)); },
      },
    };
    const importar = async (url) => {
      urls.push(url);
      const archivo = url.split('/').pop();
      if (!modulos[archivo]) throw new Error(`módulo inesperado ${url}`);
      return modulos[archivo];
    };
    return { importar, urls, log, store };
  }

  test('importa el SDK por CDN gstatic con la versión configurada, una sola vez, e inicia sesión anónima sólo si hace falta', async () => {
    const sdk = sdkFalso();
    const cliente = crearClienteFirestoreWeb({ firebaseConfig: { projectId: 'demo' }, versionSdk: '9.9.9', importar: sdk.importar });
    await cliente.asegurarSesion();
    await cliente.asegurarSesion();
    await cliente.escribirDocumento('partidas', 'K7M2XP', { a: 1 });
    assert.deepEqual(await cliente.leerDocumento('partidas', 'K7M2XP'), { a: 1 });
    assert.equal(await cliente.leerDocumento('partidas', 'NOEXIS'), null);

    assert.equal(sdk.urls.length, 3);
    assert.ok(sdk.urls.every((u) => u.startsWith('https://www.gstatic.com/firebasejs/9.9.9/')));
    assert.equal(sdk.log.filter((l) => l[0] === 'signInAnonymously').length, 1);
    assert.equal(sdk.log.filter((l) => l[0] === 'initializeApp').length, 1);
  });

  test('si falla la descarga del SDK, el error se propaga y un intento posterior reintenta', async () => {
    let fallar = true;
    const sdk = sdkFalso();
    const cliente = crearClienteFirestoreWeb({
      firebaseConfig: { projectId: 'demo' },
      importar: async (u) => { if (fallar) throw new Error('offline'); return sdk.importar(u); },
    });
    await assert.rejects(() => cliente.asegurarSesion(), /offline/);
    fallar = false;
    await cliente.asegurarSesion();
  });

  test('sin firebaseConfig lanza', () => {
    assert.throws(() => crearClienteFirestoreWeb({}), /firebaseConfig/);
  });
});
