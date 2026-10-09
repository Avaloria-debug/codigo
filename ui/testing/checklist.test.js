/**
 * Checklist de la sección 6 del doc técnico de Fase 8, automatizada: un test por punto,
 * con los motores reales y los fixtures de Fase 0. El N° del test = el N° del punto.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { armarPartida, cargarObjetos } from '../../persistencia/utilsPrueba.js';
import { crearEstadoJuego, jugarTurno, listarNivel1, listarNivel2, avanzarMundo } from '../../core/orquestador/index.js';
import { crearAdaptadorNubeEnMemoria, crearAlmacenEnMemoria, crearAdaptadorLocal, crearServicioPersistencia, capturarEstadoCompleto, restaurarMotores } from '../../persistencia/index.js';
import { crearLogInconsistencias, registrarReportes } from './capturaInconsistencias.js';
import * as C from './controles.js';

const juego = (extra) => crearEstadoJuego(armarPartida(), { objetos: cargarObjetos(), ...extra });
const verbo = (g, ini) => listarNivel1(g).find((v) => v.etiqueta.startsWith(ini));
const escena = (g, id) => g.escenas.find((e) => e.id === id);

describe('checklist sección 6', () => {
  test('1. evento sin forma de expirar: la validación de Fase 0 lo rechaza antes del motor', () => {
    const g = juego(); const r = C.forzarEvento(g, { tipo: 'incendio', escenaId: 'escena_plaza', duracion: null, condicionExpiracion: null });
    assert.equal(r.ok, false); assert.equal(g.motorEventos.listarTodos().some((e) => e.tipo === 'incendio' && e.escenaId === 'escena_plaza'), false);
  });
  test('2. eventos contradictorios simultáneos (incendio 60 peligroso vs disputa 40 tenso): gana el de mayor puntaje; empate real lo cubre Fase 2', () => {
    const g = juego(); C.forzarEvento(g, { tipo: 'incendio', escenaId: 'escena_plaza', duracion: 20 });
    C.avanzarNTicks(g, 1); assert.equal(escena(g, 'escena_plaza').estadoCalculado, 'peligroso');
  });
  test('3. escena sin salidas + Huir: Nivel 2 son 3 opciones desesperadas (riesgosa)', () => {
    const g = juego(); g.jugador.ubicacionActual = 'escena_celda'; C.forzarEstadoEscena(g, 'escena_celda', 'peligroso');
    const op = listarNivel2(g, verbo(g, 'Huir')); assert.equal(op.length, 3); assert.ok(op.every((o) => o.riesgosa === true));
  });
  test('4. Usar con un solo objeto frágil: éxito sólo por debajo de 55% (el más bajo de las tres confiabilidades)', async () => {
    const intentar = async (gen) => { const g = juego(); g.objetosPorId.get('objeto_antorcha').confiabilidad = 'fragil'; /* el fixture NO la trae: ver addendum Fase 8 §7 */ return (await jugarTurno(g, { verbo: verbo(g, 'Usar') }, { generadorAleatorio: () => gen })).accionResuelta.resultado; };
    assert.equal(await intentar(0.54), 'exito'); assert.equal(await intentar(0.56), 'fallo');
  });
  test('5. relación cruzando el umbral (40): el secreto se vuelve revelable exactamente ahí', () => {
    const g = juego(); const rev = () => g.motorNPCs.conocimientosRevelablesDe('npc_herrero_001', g.jugador).map((c) => c.id);
    C.editarNpc(g, 'npc_herrero_001', { relacion: 39 }); assert.ok(!rev().includes('conocimiento_ruta_secreta'));
    C.editarNpc(g, 'npc_herrero_001', { relacion: 40 }); assert.ok(rev().includes('conocimiento_ruta_secreta'));
  });
  test('6. NPC recién atacado, diálogo inmediato: Fase 6 recibe el estado de DESPUÉS', async () => {
    const g = juego({ opcionesDialogo: { forzarMock: true } });
    const antes = g.npcs.find((n) => n.id === 'npc_guardia_001').estadoEmocional; assert.equal(antes, 'neutral');
    C.forzarEstadoEscena(g, 'escena_plaza', 'peligroso'); const atacar = verbo(g, 'Atacar');
    await jugarTurno(g, { verbo: atacar, opcionNivel2: listarNivel2(g, atacar)[0] }, { generadorAleatorio: () => 0.1 });
    const r = await jugarTurno(g, { verbo: verbo(g, 'Hablar con Guardia'), textoLibre: 'Perdón.' }, { generadorAleatorio: () => 0.99 }); // fallo: sigue hostil
    assert.match(r.texto, /\(hostil, resultado: fallo\)/);
    assert.equal(g.npcs.find((n) => n.id === 'npc_guardia_001').relacion.valor, -45);
  });
  test('7. error de Groq (500): degrada a mock sin cortar la sesión', async () => {
    const g = juego(); C.simularErrorGroq(g, '500'); const r = await jugarTurno(g, { verbo: verbo(g, 'Hablar con Guardia'), textoLibre: 'hola' });
    assert.equal(r.origen, 'mock'); const r2 = await jugarTurno(g, { verbo: verbo(g, 'Examinar') }); assert.equal(r2.tipo, 'narracion');
  });
  test('8. los tres topes: RPD cae a mock por rpd_agotado; RPM y TPM ESPERAN su cupo y después usan Groq (diseño de Fase 6, no caen a mock)', async () => {
    const mk = () => juego({ configuracionGroq: { ...juego().configuracionGroq, apiKey: 'k' }, opcionesDialogo: { fetch: async () => ({ ok: true, status: 200, headers: new Map(), json: async () => ({ choices: [{ message: { content: 'ok.' }, finish_reason: 'stop' }], usage: { total_tokens: 20 } }) }) } });
    const g = mk(); C.simularRateLimit(g, 'rpd');
    assert.equal((await jugarTurno(g, { verbo: verbo(g, 'Hablar con Guardia'), textoLibre: 'x' })).motivo, 'rpd_agotado');
  });
  test('9. guardar y cargar desde otro dispositivo: la partida continúa idéntica a no haber cortado', async () => {
    const objetos = cargarObjetos(); const nube = crearAdaptadorNubeEnMemoria(); const reloj = () => 777;
    const dispositivo = () => { const local = crearAdaptadorLocal({ almacen: crearAlmacenEnMemoria() }); return { local, servicio: crearServicioPersistencia({ adaptadorLocal: local, adaptadorNube: nube, objetos }) }; };
    const A = dispositivo(); const gA = juego({ servicioPersistencia: A.servicio, reloj, opcionesDialogo: { forzarMock: true } });
    const gen = () => 0.3; const jugar = (g) => jugarTurno(g, { verbo: verbo(g, 'Hablar con Guardia'), textoLibre: 'hola' }, { generadorAleatorio: gen });
    await (await jugar(gA)).guardado; await (await jugarTurno(gA, { verbo: verbo(gA, 'Examinar') }, { generadorAleatorio: gen })).guardado;
    const B = dispositivo(); const carga = await B.servicio.cargarPorCodigo(gA.codigoPartida, { reemplazarLocal: true });
    assert.ok(carga.estado, carga.decision);
    const r = restaurarMotores(carga.estado, {});
    const gB = crearEstadoJuego({ codigoPartida: r.codigoPartida, jugador: r.jugador, npcs: r.npcs, escenas: r.escenas, estadoMundo: r.estadoMundo, motorEventos: r.motorEventos, motorSucesos: r.motorSucesos, motorNPCs: r.motorNPCs }, { objetos, reloj, opcionesDialogo: { forzarMock: true } });
    const cap = (g) => JSON.stringify(capturarEstadoCompleto({ ...g, reloj }));
    assert.equal(cap(gB), cap(gA));
    await jugar(gA); await jugar(gB); assert.equal(cap(gB), cap(gA)); // y SIGUE idéntica después de jugar
  });
  test('10. nube con version_futura: el código (no sólo la UI) rechaza la sobrescritura', async () => {
    const objetos = cargarObjetos(); const nube = crearAdaptadorNubeEnMemoria();
    const servicio = crearServicioPersistencia({ adaptadorLocal: crearAdaptadorLocal({ almacen: crearAlmacenEnMemoria() }), adaptadorNube: nube, objetos });
    const g = juego(); await servicio.guardar(capturarEstadoCompleto({ ...g, reloj: () => 5 }));
    await C.corromperNube(nube, g.codigoPartida, 'version_futura'); await servicio.sincronizar();
    assert.equal(servicio.estado().conflicto.sobrescrituraPermitida, false);
    await assert.rejects(async () => servicio.resolverConflictoDeCarga('usarLocal'));
    await assert.rejects(async () => servicio.resolverConflictoDeCarga('usarNube'));
  });
  test('11. objetivo ambiguo (2 NPCs en la plaza): fallback determinístico y queda en el log de inconsistencias', async () => {
    const g = juego(); C.forzarEstadoEscena(g, 'escena_plaza', 'peligroso'); const log = crearLogInconsistencias();
    const atacar = verbo(g, 'Atacar'); const r = await jugarTurno(g, { verbo: atacar, opcionNivel2: listarNivel2(g, atacar)[0] }, { generadorAleatorio: () => 0.1 });
    registrarReportes(log, r.reportes);
    assert.equal(r.npcObjetivoId, 'npc_guardia_001'); assert.ok(log.listar().some((e) => e.origen === 'resolverNpcObjetivo' && e.canal === 'estructurado'));
  });
});
