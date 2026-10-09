import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sincronizarPartida } from './sincronizarPartida.js';
import { crearAdaptadorNubeEnMemoria } from './adaptadores/nubeEnMemoria.js';
import { armarPartida, cargarObjetos } from './utilsPrueba.js';
import { VERSION_ESQUEMA } from './constantes.js';

const objetos = cargarObjetos();
const estadoEn = (t) => armarPartida().capturar(() => t);
const sync = (local, nube) => sincronizarPartida(local, nube, { objetos });

describe('sincronizarPartida — regla de la sección 4.1', () => {
  test('nube vacía: se crea con el local', async () => {
    const nube = crearAdaptadorNubeEnMemoria();
    const local = estadoEn(100);
    const r = await sync(local, nube);
    assert.equal(r.decision, 'nube_creada');
    assert.deepEqual(nube.documento('K7M2XP'), local);
  });

  test('local más nuevo: se sube', async () => {
    const nube = crearAdaptadorNubeEnMemoria({ documentosIniciales: { K7M2XP: estadoEn(100) } });
    const local = estadoEn(200);
    const r = await sync(local, nube);
    assert.equal(r.decision, 'nube_actualizada');
    assert.equal(nube.documento('K7M2XP').ultimaModificacion, 200);
    assert.equal(r.estado, local);
  });

  test('nube más nueva: se devuelve la nube y NO se escribe nada', async () => {
    const nube = crearAdaptadorNubeEnMemoria({ documentosIniciales: { K7M2XP: estadoEn(300) } });
    const r = await sync(estadoEn(200), nube);
    assert.equal(r.decision, 'usar_nube');
    assert.equal(r.estado.ultimaModificacion, 300);
    assert.equal(nube.enviosComoTexto().length, 0);
  });

  test('empate exacto: se queda el local, sin escribir', async () => {
    const nube = crearAdaptadorNubeEnMemoria({ documentosIniciales: { K7M2XP: estadoEn(100) } });
    const local = estadoEn(100);
    const r = await sync(local, nube);
    assert.equal(r.decision, 'sin_cambios');
    assert.equal(r.estado, local);
    assert.equal(nube.enviosComoTexto().length, 0);
  });
});

describe('sincronizarPartida — nube inválida (4b): nunca se sobrescribe', () => {
  test('estructura inválida: decisión nube_invalida con motivo y errores; la nube queda intacta', async () => {
    const roto = estadoEn(50);
    delete roto.npcs[0].nombre;
    const nube = crearAdaptadorNubeEnMemoria({ documentosIniciales: { K7M2XP: roto } });
    const r = await sync(estadoEn(999), nube); // el local es MÁS nuevo, y aun así no pisa
    assert.equal(r.decision, 'nube_invalida');
    assert.equal(r.motivo, 'estructura');
    assert.ok(r.errores.length > 0);
    assert.deepEqual(nube.documento('K7M2XP'), roto);
    assert.equal(nube.enviosComoTexto().length, 0);
  });

  test('versión futura: nube_invalida/version_futura, intacta', async () => {
    const futuro = { ...estadoEn(50), versionEsquema: VERSION_ESQUEMA + 1, campoNuevo: 1 };
    const nube = crearAdaptadorNubeEnMemoria({ documentosIniciales: { K7M2XP: futuro } });
    const r = await sync(estadoEn(999), nube);
    assert.equal(r.motivo, 'version_futura');
    assert.deepEqual(nube.documento('K7M2XP'), futuro);
  });

  test('documento válido pero que declara otro codigoPartida: inválido, no se usa ni se pisa', async () => {
    const otro = { ...estadoEn(50), codigoPartida: 'ZZZZZZ' };
    const nube = crearAdaptadorNubeEnMemoria({ documentosIniciales: { K7M2XP: otro } });
    const r = await sync(estadoEn(999), nube);
    assert.equal(r.decision, 'nube_invalida');
    assert.match(r.errores[0], /ZZZZZZ/);
    assert.equal(nube.enviosComoTexto().length, 0);
  });
});

describe('sincronizarPartida — fallos del adaptador no lanzan', () => {
  test('cargarPartida falla: nube_no_disponible con el local intacto', async () => {
    const nube = crearAdaptadorNubeEnMemoria();
    nube.simularFallo('sin red');
    const local = estadoEn(1);
    const r = await sync(local, nube);
    assert.equal(r.decision, 'nube_no_disponible');
    assert.equal(r.error, 'sin red');
    assert.equal(r.estado, local);
  });

  test('guardarPartida falla después de una carga exitosa: nube_no_disponible', async () => {
    const nube = crearAdaptadorNubeEnMemoria();
    const original = nube.guardarPartida;
    nube.guardarPartida = async () => { throw new Error('cuota agotada'); };
    const r = await sync(estadoEn(1), nube);
    assert.equal(r.decision, 'nube_no_disponible');
    assert.match(r.error, /cuota/);
    nube.guardarPartida = original;
  });
});
