import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearServicioPersistencia } from './servicioPersistencia.js';
import { crearAdaptadorLocal } from './adaptadores/local.js';
import { crearAlmacenEnMemoria } from './adaptadores/almacenEnMemoria.js';
import { crearAdaptadorNubeEnMemoria } from './adaptadores/nubeEnMemoria.js';
import { armarPartida, cargarObjetos } from './utilsPrueba.js';
import { VERSION_ESQUEMA } from './constantes.js';

const objetos = cargarObjetos();
const estadoEn = (t, codigo = 'K7M2XP') => armarPartida({ codigoPartida: codigo }).capturar(() => t);

function entorno({ local = null, nube = {} , conNube = true } = {}) {
  const almacen = crearAlmacenEnMemoria();
  const adaptadorLocal = crearAdaptadorLocal({ almacen });
  const adaptadorNube = conNube ? crearAdaptadorNubeEnMemoria({ documentosIniciales: nube }) : null;
  const servicio = crearServicioPersistencia({ adaptadorLocal, adaptadorNube, objetos });
  return { almacen, adaptadorLocal, adaptadorNube, servicio, sembrarLocal: (e) => almacen.set('partida_activa', e) };
}

const roto = (t) => { const e = estadoEn(t); delete e.npcs[0].nombre; return e; };
const futuro = (t) => ({ ...estadoEn(t), versionEsquema: VERSION_ESQUEMA + 1 });

describe('servicio — guardar', () => {
  test('guarda local y nube; el payload de la nube es el mismo que el local', async () => {
    const { servicio, adaptadorLocal, adaptadorNube } = entorno();
    const r = await servicio.guardar(estadoEn(10));
    assert.deepEqual({ guardado: r.guardado, nube: r.nube }, { guardado: true, nube: 'ok' });
    assert.deepEqual(adaptadorNube.documento('K7M2XP'), await adaptadorLocal.cargarLocal());
  });

  test('falla de nube: el local YA quedó guardado, pendienteDeSync, el juego sigue', async () => {
    const { servicio, adaptadorLocal, adaptadorNube } = entorno();
    adaptadorNube.simularFallo('sin red');
    const r = await servicio.guardar(estadoEn(10));
    assert.equal(r.guardado, true);
    assert.equal(r.nube, 'fallo');
    assert.equal(servicio.estado().pendienteDeSync, true);
    assert.ok(await adaptadorLocal.cargarLocal());

    adaptadorNube.repararFallo();
    const r2 = await servicio.guardar(estadoEn(20));
    assert.equal(r2.nube, 'ok');
    assert.equal(servicio.estado().pendienteDeSync, false);
  });

  test('sin adaptador de nube: sólo local', async () => {
    const { servicio } = entorno({ conNube: false });
    assert.equal((await servicio.guardar(estadoEn(1))).nube, 'sin_nube');
  });

  test('un estado inválido NO se persiste en ningún lado', async () => {
    const { servicio, adaptadorLocal, adaptadorNube } = entorno();
    const r = await servicio.guardar(roto(10));
    assert.equal(r.guardado, false);
    assert.equal(r.motivo, 'estado_invalido');
    assert.equal(await adaptadorLocal.cargarLocal(), null);
    assert.equal(adaptadorNube.enviosComoTexto().length, 0);
  });

  test('un estado no serializable NO se persiste', async () => {
    const { servicio, adaptadorLocal } = entorno();
    const e = estadoEn(10);
    e.jugador.atributos.salud = Infinity;
    const r = await servicio.guardar(e);
    assert.equal(r.motivo, 'no_serializable');
    assert.equal(await adaptadorLocal.cargarLocal(), null);
  });

  test('API KEY y REGISTRO DE USO jamás llegan al payload de la nube (canario)', async () => {
    const { servicio, adaptadorLocal, adaptadorNube } = entorno();
    await adaptadorLocal.guardarApiKey('gsk_CANARIO_SECRETO_777');
    await adaptadorLocal.guardarRegistroUso({ llamadas: [{ t: 123456789012, tokens: 50 }] });
    const e = estadoEn(10);
    e.apiKey = 'gsk_CANARIO_SECRETO_777';
    e.registroUso = { llamadas: [{ t: 123456789012, tokens: 50 }] };

    await servicio.guardar(e);
    for (const envio of adaptadorNube.enviosComoTexto()) {
      assert.ok(!envio.includes('gsk_CANARIO_SECRETO_777'));
      assert.ok(!envio.includes('123456789012'));
    }
    const local = JSON.stringify(await adaptadorLocal.cargarLocal());
    assert.ok(!local.includes('gsk_CANARIO_SECRETO_777'), 'tampoco en la partida local');
  });
});

describe('servicio — iniciar', () => {
  test('sin partida local: sin_partida_local', async () => {
    const { servicio } = entorno();
    assert.equal((await servicio.iniciar()).decision, 'sin_partida_local');
  });

  test('local válido, nube vacía: se crea en la nube', async () => {
    const e = entorno();
    await e.sembrarLocal(estadoEn(10));
    const r = await e.servicio.iniciar();
    assert.equal(r.decision, 'nube_creada');
    assert.ok(e.adaptadorNube.documento('K7M2XP'));
  });

  test('nube más nueva y válida: se adopta y se reemplaza el local', async () => {
    const e = entorno({ nube: { K7M2XP: estadoEn(500) } });
    await e.sembrarLocal(estadoEn(10));
    const r = await e.servicio.iniciar();
    assert.equal(r.decision, 'usar_nube');
    assert.equal(r.estado.ultimaModificacion, 500);
    assert.equal((await e.adaptadorLocal.cargarLocal()).ultimaModificacion, 500);
  });

  test('sin nube configurada: solo_local', async () => {
    const e = entorno({ conNube: false });
    await e.sembrarLocal(estadoEn(10));
    assert.equal((await e.servicio.iniciar()).decision, 'solo_local');
  });

  test('sin conexión: sigue con el local y queda pendiente de sync', async () => {
    const e = entorno();
    await e.sembrarLocal(estadoEn(10));
    e.adaptadorNube.simularFallo('sin red');
    const r = await e.servicio.iniciar();
    assert.equal(r.decision, 'nube_no_disponible');
    assert.equal(r.estado.ultimaModificacion, 10);
    assert.equal(e.servicio.estado().pendienteDeSync, true);
  });
});

describe('servicio — 4b: NUBE inválida', () => {
  async function conNubeRota(docNube) {
    const e = entorno({ nube: { K7M2XP: docNube } });
    await e.sembrarLocal(estadoEn(999));
    const r = await e.servicio.iniciar();
    return { e, r };
  }

  test('iniciar: se sigue con el local, nube bloqueada, reporte con motivo y errores; la nube NO se toca', async () => {
    const dañado = roto(50);
    const { e, r } = await conNubeRota(dañado);
    assert.equal(r.decision, 'nube_invalida');
    assert.equal(r.estado.ultimaModificacion, 999);
    assert.equal(r.conflicto.ladoRoto, 'nube');
    assert.equal(r.conflicto.motivo, 'estructura');
    assert.ok(r.conflicto.errores.length > 0);
    assert.deepEqual(e.adaptadorNube.documento('K7M2XP'), dañado);
    assert.ok(e.servicio.estado().nubeBloqueada);
  });

  test('con la nube bloqueada, el autoguardado sigue en LOCAL y NO escribe la nube (nada de set() ciego)', async () => {
    const dañado = roto(50);
    const { e } = await conNubeRota(dañado);
    const r = await e.servicio.guardar(estadoEn(1000));
    assert.equal(r.guardado, true);
    assert.equal(r.nube, 'bloqueada');
    assert.equal((await e.adaptadorLocal.cargarLocal()).ultimaModificacion, 1000);
    assert.deepEqual(e.adaptadorNube.documento('K7M2XP'), dañado);
    assert.equal(e.adaptadorNube.enviosComoTexto().length, 0);
  });

  test("resolverConflictoDeCarga('usarLocal') sobrescribe la nube con el local y desbloquea", async () => {
    const { e } = await conNubeRota(roto(50));
    const r = await e.servicio.resolverConflictoDeCarga('usarLocal');
    assert.equal(r.estado.ultimaModificacion, 999);
    assert.equal(e.adaptadorNube.documento('K7M2XP').ultimaModificacion, 999);
    assert.equal(e.servicio.estado().nubeBloqueada, null);
    assert.equal(e.servicio.estado().conflicto, null);
    assert.equal((await e.servicio.guardar(estadoEn(1001))).nube, 'ok');
  });

  test("con la nube rota, 'usarNube' lanza: destruiría el lado sano", async () => {
    const { e } = await conNubeRota(roto(50));
    await assert.rejects(() => e.servicio.resolverConflictoDeCarga('usarNube'), /la nube es la inválida/);
    assert.ok(e.servicio.estado().nubeBloqueada, 'el conflicto sigue pendiente');
  });

  test('version_futura: la sobrescritura LANZA en el código, en cualquier dirección; nada se toca', async () => {
    const f = futuro(50);
    const { e, r } = await conNubeRota(f);
    assert.equal(r.conflicto.motivo, 'version_futura');
    assert.equal(r.conflicto.sobrescrituraPermitida, false);
    await assert.rejects(() => e.servicio.resolverConflictoDeCarga('usarLocal'), /versión más nueva/);
    await assert.rejects(() => e.servicio.resolverConflictoDeCarga('usarNube'), /versión más nueva/);
    assert.deepEqual(e.adaptadorNube.documento('K7M2XP'), f);
    assert.equal((await e.servicio.guardar(estadoEn(2000))).nube, 'bloqueada');
    assert.deepEqual(e.adaptadorNube.documento('K7M2XP'), f);
  });

  test('si la sobrescritura confirmada falla en red, el conflicto sigue pendiente (no se pierde)', async () => {
    const { e } = await conNubeRota(roto(50));
    e.adaptadorNube.simularFallo('sin red');
    await assert.rejects(() => e.servicio.resolverConflictoDeCarga('usarLocal'), /sin red/);
    assert.ok(e.servicio.estado().nubeBloqueada);
    e.adaptadorNube.repararFallo();
    await e.servicio.resolverConflictoDeCarga('usarLocal');
    assert.equal(e.servicio.estado().nubeBloqueada, null);
  });

  test('resolverConflictoDeCarga sin conflicto o con dirección inválida lanza', async () => {
    const e = entorno();
    await assert.rejects(() => e.servicio.resolverConflictoDeCarga('usarNube'), /ningún conflicto/);
    await assert.rejects(() => e.servicio.resolverConflictoDeCarga('x'), /dirección/);
  });
});

describe('servicio — 4b (simétrico): LOCAL inválido', () => {
  test('local roto + nube válida: no se usa nada solo, se ofrece la nube; el local no se toca', async () => {
    const dañado = roto(10);
    const e = entorno({ nube: { K7M2XP: estadoEn(500) } });
    await e.sembrarLocal(dañado);
    const r = await e.servicio.iniciar();
    assert.equal(r.decision, 'local_invalido');
    assert.equal(r.estado, null);
    assert.equal(r.conflicto.ladoRoto, 'local');
    assert.deepEqual(await e.adaptadorLocal.cargarLocal(), dañado);
    assert.equal((await e.servicio.guardar(estadoEn(600))).motivo, 'local_bloqueado');
    assert.deepEqual(await e.adaptadorLocal.cargarLocal(), dañado);
  });

  test("resolverConflictoDeCarga('usarNube') reemplaza el local roto con la nube válida", async () => {
    const e = entorno({ nube: { K7M2XP: estadoEn(500) } });
    await e.sembrarLocal(roto(10));
    await e.servicio.iniciar();
    await assert.rejects(() => e.servicio.resolverConflictoDeCarga('usarLocal'), /el local es el inválido/);
    const r = await e.servicio.resolverConflictoDeCarga('usarNube');
    assert.equal(r.estado.ultimaModificacion, 500);
    assert.equal((await e.adaptadorLocal.cargarLocal()).ultimaModificacion, 500);
    assert.equal((await e.servicio.guardar(estadoEn(501))).guardado, true);
  });

  test('local de versión futura: no se borra ni se reemplaza, ni por resolver ni por descartar', async () => {
    const f = futuro(10);
    const e = entorno({ nube: { K7M2XP: estadoEn(500) } });
    await e.sembrarLocal(f);
    const r = await e.servicio.iniciar();
    assert.equal(r.conflicto.motivo, 'version_futura');
    await assert.rejects(() => e.servicio.resolverConflictoDeCarga('usarNube'), /versión más nueva/);
    await assert.rejects(() => e.servicio.descartarLocalInvalido(), /versión más nueva/);
    assert.deepEqual(await e.adaptadorLocal.cargarLocal(), f);
  });

  test('local roto sin copia en la nube: sinAlternativa; descartarLocalInvalido es explícito y libera el slot', async () => {
    const e = entorno();
    await e.sembrarLocal(roto(10));
    const r = await e.servicio.iniciar();
    assert.equal(r.conflicto.sinAlternativa, true);
    await e.servicio.descartarLocalInvalido();
    assert.equal(await e.adaptadorLocal.cargarLocal(), null);
    assert.equal((await e.servicio.guardar(estadoEn(1))).guardado, true);
  });
});

describe('servicio — cargarPorCodigo (dispositivo B)', () => {
  test('código con espacios y minúsculas: se normaliza, se valida y queda en el local', async () => {
    const e = entorno({ nube: { K7M2XP: estadoEn(500) } });
    const r = await e.servicio.cargarPorCodigo('  k7m2xp ');
    assert.equal(r.decision, 'cargada_de_nube');
    assert.equal((await e.adaptadorLocal.cargarLocal()).codigoPartida, 'K7M2XP');
  });

  test('código inexistente → codigo_inexistente; formato malo → codigo_invalido sin tocar la nube', async () => {
    const e = entorno();
    assert.equal((await e.servicio.cargarPorCodigo('ABCDEF')).decision, 'codigo_inexistente');
    assert.equal((await e.servicio.cargarPorCodigo('ab')).decision, 'codigo_invalido');
  });

  test('con partida local existente exige reemplazarLocal: true; no pisa en silencio', async () => {
    const e = entorno({ nube: { K7M2XP: estadoEn(500) } });
    await e.sembrarLocal(estadoEn(10, 'ABCDEF'));
    await assert.rejects(() => e.servicio.cargarPorCodigo('K7M2XP'), /reemplazarLocal/);
    assert.equal((await e.adaptadorLocal.cargarLocal()).codigoPartida, 'ABCDEF');
    const r = await e.servicio.cargarPorCodigo('K7M2XP', { reemplazarLocal: true });
    assert.equal(r.decision, 'cargada_de_nube');
  });

  test('documento de nube inválido: no se descarga nada', async () => {
    const e = entorno({ nube: { K7M2XP: roto(500) } });
    const r = await e.servicio.cargarPorCodigo('K7M2XP');
    assert.equal(r.decision, 'nube_invalida');
    assert.equal(await e.adaptadorLocal.cargarLocal(), null);
  });

  test('nube caída: nube_no_disponible sin lanzar', async () => {
    const e = entorno();
    e.adaptadorNube.simularFallo('sin red');
    assert.equal((await e.servicio.cargarPorCodigo('K7M2XP')).decision, 'nube_no_disponible');
  });
});

describe('servicio — sincronizar (reintento)', () => {
  test('tras una caída, sincronizar sube el local pendiente', async () => {
    const e = entorno();
    e.adaptadorNube.simularFallo('sin red');
    await e.servicio.guardar(estadoEn(10));
    e.adaptadorNube.repararFallo();
    const r = await e.servicio.sincronizar();
    assert.equal(r.decision, 'nube_creada');
    assert.equal(e.servicio.estado().pendienteDeSync, false);
  });

  test('con la nube bloqueada no sincroniza', async () => {
    const e = entorno({ nube: { K7M2XP: roto(50) } });
    await e.sembrarLocal(estadoEn(999));
    await e.servicio.iniciar();
    assert.equal((await e.servicio.sincronizar()).decision, 'nube_bloqueada');
  });
});
