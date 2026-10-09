import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { armarPartida, cargarObjetos } from '../../persistencia/utilsPrueba.js';
import { crearEstadoJuego, jugarTurno, avanzarMundo, resolverNpcObjetivo, ticksParaVerbo, construirVerbo, listarNivel1, listarNivel2, registroTicksPorVerboPorDefecto } from './index.js';

function juego(extra = {}) {
  const p = armarPartida();
  return crearEstadoJuego(p, { objetos: cargarObjetos(), ...extra });
}
const verboDe = (g, etiquetaIni) => listarNivel1(g).find((v) => v.etiqueta.startsWith(etiquetaIni));
const crearEv = (g, escenaId, tipo, metadata = {}) =>
  g.motorEventos.crearEvento({ id: `ev_${tipo}_${Math.random()}`, tipo, escenaId, duracion: 50, condicionExpiracion: null, activo: true, metadata }, g.estadoMundo);

const C_forzar = (g) => { g.escenas.find((e) => e.id === 'escena_plaza').estadoCalculado = 'peligroso'; };

describe('ticksPorVerbo', () => {
  test('default 1, Descansar 8, inyectable, inválido lanza', () => {
    assert.equal(ticksParaVerbo('Explorar'), 1);
    assert.equal(ticksParaVerbo('Descansar'), 8);
    assert.equal(ticksParaVerbo('Explorar', { _default: 1, Explorar: 3 }), 3);
    assert.throws(() => ticksParaVerbo('X', { _default: 0 }));
    assert.throws(() => ticksParaVerbo('X', { _default: 1.5 }));
  });
});

describe('avanzarMundo', () => {
  test('el reloj se toca vía avanzarTicks: ticks y hora avanzan juntos, sin derivar uno del otro', () => {
    const g = juego(); const t0 = g.estadoMundo.ticksTranscurridos; const h0 = g.estadoMundo.horaActual;
    avanzarMundo(g, 3);
    assert.equal(g.estadoMundo.ticksTranscurridos, t0 + 3);
    assert.equal(g.estadoMundo.horaActual, (h0 + 3) % 24);
  });
  test('un evento activo se refleja en estadoCalculado y un tipo sin categorizar queda en reportes estructurados', () => {
    const g = juego(); crearEv(g, 'escena_herreria', 'incendio'); crearEv(g, 'escena_herreria', 'tipo_inventado');
    const r = avanzarMundo(g, 1);
    assert.equal(g.escenas.find((e) => e.id === 'escena_herreria').estadoCalculado, 'peligroso');
    assert.ok(r.reportes.some((x) => x.origen === 'calcularEstadoEscena' && x.mensaje.includes('tipo_inventado')));
  });
  test('ticks inválidos lanzan (no avanza nada)', () => {
    const g = juego(); const t0 = g.estadoMundo.ticksTranscurridos;
    assert.throws(() => avanzarMundo(g, 0));
    assert.equal(g.estadoMundo.ticksTranscurridos, t0);
  });
  test('ORDEN eventos -> estado -> NPCs: un evento nuevo asusta al NPC en el MISMO avance (no un tick tarde)', () => {
    const g = juego();
    for (const e of g.motorEventos.listarEventosActivos('escena_herreria')) g.motorEventos.desactivarEvento(e.id, 'prueba'); // herrería queda calma
    avanzarMundo(g, 1); avanzarMundo(g, 1); // el temor decae y el estado se recalcula sin amenazas
    const herrero = g.npcs.find((n) => n.id === 'npc_herrero_001'); assert.equal(herrero.estadoEmocional, 'neutral');
    assert.notEqual(g.escenas.find((e) => e.id === 'escena_herreria').estadoCalculado, 'peligroso');
    crearEv(g, 'escena_herreria', 'incendio');
    avanzarMundo(g, 1);
    assert.equal(g.escenas.find((e) => e.id === 'escena_herreria').estadoCalculado, 'peligroso');
    assert.equal(herrero.estadoEmocional, 'temeroso');
  });
});

describe('resolverNpcObjetivo (regla de Fase 8, escena_plaza tiene 2 NPCs activos)', () => {
  const V = (nombre, extra = {}) => ({ nombre, tipoResolucion: 'concrecion', ...extra });
  const plaza = (g) => g.escenas.find((e) => e.id === 'escena_plaza');

  test('Hablar con...: el NPC ya viene fijado, sin ambigüedad ni reporte', () => {
    const g = juego();
    const r = resolverNpcObjetivo(V('Hablar con...', { npcObjetivo: 'npc_viajero_001' }), plaza(g), g.npcsPorId);
    assert.equal(r.npc.id, 'npc_viajero_001'); assert.equal(r.reportes.length, 0);
  });
  test('verbo que no necesita NPC -> null', () => {
    const g = juego(); assert.equal(resolverNpcObjetivo(V('Huir'), plaza(g), g.npcsPorId).npc, null);
  });
  test('un solo NPC -> ese, sin reporte; cero NPCs -> null', () => {
    const g = juego();
    const h = resolverNpcObjetivo(V('Atacar'), g.escenas.find((e) => e.id === 'escena_herreria'), g.npcsPorId);
    assert.equal(h.npc.id, 'npc_herrero_001'); assert.equal(h.reportes.length, 0);
    assert.equal(resolverNpcObjetivo(V('Atacar'), g.escenas.find((e) => e.id === 'escena_celda'), g.npcsPorId).npc, null);
  });
  test('DOS NPCs, empate total -> el primero de npcsPresentes, y SIEMPRE queda reportado', () => {
    const g = juego();
    const r = resolverNpcObjetivo(V('Atacar'), plaza(g), g.npcsPorId, { motorEventos: g.motorEventos });
    assert.equal(r.npc.id, 'npc_guardia_001'); assert.equal(r.motivo, 'primero_presente');
    assert.equal(r.reportes.length, 1); assert.match(r.reportes[0].mensaje, /npc_guardia_001, npc_viajero_001/);
  });
  test('DOS NPCs, distinta relación -> gana el de menor relación (más conflictivo)', () => {
    const g = juego(); g.npcsPorId.get('npc_viajero_001').relacion.valor = -30;
    const r = resolverNpcObjetivo(V('Presionar'), plaza(g), g.npcsPorId, { motorEventos: g.motorEventos });
    assert.equal(r.npc.id, 'npc_viajero_001'); assert.equal(r.motivo, 'menor_relacion');
  });
  test('DOS NPCs, uno es fuente de amenaza (metadata.npcId) -> gana aunque tenga mejor relación que el otro', () => {
    const g = juego(); g.npcsPorId.get('npc_viajero_001').relacion.valor = -50; g.npcsPorId.get('npc_guardia_001').relacion.valor = 10;
    crearEv(g, 'escena_plaza', 'amenaza_npc_hostil', { npcId: 'npc_guardia_001' });
    const r = resolverNpcObjetivo(V('Atacar'), plaza(g), g.npcsPorId, { motorEventos: g.motorEventos });
    assert.equal(r.npc.id, 'npc_guardia_001'); assert.equal(r.motivo, 'fuente_de_amenaza');
  });
  test('NPCs inactivos no son candidatos', () => {
    const g = juego(); g.npcsPorId.get('npc_guardia_001').activo = false;
    const r = resolverNpcObjetivo(V('Atacar'), plaza(g), g.npcsPorId);
    assert.equal(r.npc.id, 'npc_viajero_001'); assert.equal(r.motivo, 'unico_presente');
  });
});

describe('jugarTurno', () => {
  test('verbo inmediata (Examinar): narración, 1 tick, sin tocar NPCs ni Groq', async () => {
    const g = juego(); const t0 = g.estadoMundo.ticksTranscurridos;
    const r = await jugarTurno(g, { verbo: verboDe(g, 'Examinar') });
    assert.equal(r.tipo, 'narracion'); assert.equal(r.accionResuelta.resultado, 'neutral');
    assert.equal(g.estadoMundo.ticksTranscurridos, t0 + 1);
  });
  test('Descansar consume 8 ticks (registro, no if)', async () => {
    const g = juego(); const t0 = g.estadoMundo.ticksTranscurridos;
    g.escenas.find((e) => e.id === 'escena_plaza').estadoCalculado = 'tranquilo';
    await jugarTurno(g, { verbo: verboDe(g, 'Descansar') });
    assert.equal(g.estadoMundo.ticksTranscurridos, t0 + registroTicksPorVerboPorDefecto.Descansar);
    const g2 = juego(); g2.escenas.find((e) => e.id === 'escena_plaza').estadoCalculado = 'tranquilo';
    const t1 = g2.estadoMundo.ticksTranscurridos;
    await jugarTurno(g2, { verbo: verboDe(g2, 'Descansar') }, { registroTicksPorVerbo: { _default: 1, Descansar: 2 } });
    assert.equal(g2.estadoMundo.ticksTranscurridos, t1 + 2);
  });
  test('ORDEN Fase 5 -> Fase 4: la tirada usa la relación de ANTES de la acción', async () => {
    // Relación -55 (Desconfiado: modificador -10, invertido para Atacar = +10): a mano limpia 45+10 = 55%.
    // Si la relación ya se hubiera actualizado (-95, Hostil: +25) sería 70%. Con 0.6 sólo "antes" da fallo.
    const g = juego(); g.npcs.find((n) => n.id === 'npc_guardia_001').relacion.valor = -55;
    C_forzar(g);
    const atacar = verboDe(g, 'Atacar'); const manoLimpia = listarNivel2(g, atacar).find((o) => !o.objetoObjetivo);
    const r = await jugarTurno(g, { verbo: atacar, opcionNivel2: manoLimpia }, { generadorAleatorio: () => 0.6 });
    assert.equal(r.npcObjetivoId, 'npc_guardia_001'); assert.equal(r.accionResuelta.resultado, 'fallo');
    const guardia = g.npcs.find((n) => n.id === 'npc_guardia_001');
    assert.equal(guardia.estadoEmocional, 'hostil'); assert.equal(guardia.relacion.valor, -95); // el NPC cambia DESPUÉS
  });
  test('ambigüedad con 2 NPCs en la plaza: Atacar apunta al guardia y el reporte llega en resultado.reportes', async () => {
    const g = juego(); g.escenas.find((e) => e.id === 'escena_plaza').estadoCalculado = 'peligroso';
    const atacar = verboDe(g, 'Atacar');
    const r = await jugarTurno(g, { verbo: atacar, opcionNivel2: listarNivel2(g, atacar)[0] }, { generadorAleatorio: () => 0.1 });
    assert.equal(r.npcObjetivoId, 'npc_guardia_001');
    assert.ok(r.reportes.some((x) => x.origen === 'resolverNpcObjetivo'));
    assert.equal(g.npcs.find((n) => n.id === 'npc_viajero_001').relacion.valor, 0); // el otro NPC no se toca
  });
  test('Hablar con X termina en diálogo mock (forzado) con el estado emocional de DESPUÉS de la acción', async () => {
    const g = juego({ opcionesDialogo: { forzarMock: true } });
    g.escenas.find((e) => e.id === 'escena_plaza').estadoCalculado = 'tenso';
    const presionar = verboDe(g, 'Presionar'); const op = listarNivel2(g, presionar)[0];
    const r = await jugarTurno(g, { verbo: presionar, opcionNivel2: op, textoLibre: 'Dame la llave.' }, { generadorAleatorio: () => 0.99 }); // fallo -> hostil
    assert.equal(r.tipo, 'dialogo'); assert.equal(r.origen, 'mock'); assert.equal(r.motivo, 'forzado');
    assert.match(r.texto, /^\[MOCK\] .*\(hostil, resultado: fallo\)/);
  });
  test('verbo de texto libre sin textoLibre string: lanza (error de programación de la UI)', async () => {
    const g = juego({ opcionesDialogo: { forzarMock: true } });
    await assert.rejects(jugarTurno(g, { verbo: verboDe(g, 'Hablar con') }), /texto libre/);
  });
  test('Groq caído (fetch 500) degrada a mock sin cortar el turno', async () => {
    const g = juego({ configuracionGroq: { ...juego().configuracionGroq, apiKey: 'k' }, opcionesDialogo: { fetch: async () => ({ ok: false, status: 500, headers: new Map(), text: async () => 'x', json: async () => ({}) }) } });
    const r = await jugarTurno(g, { verbo: verboDe(g, 'Hablar con'), textoLibre: 'hola' });
    assert.equal(r.origen, 'mock'); assert.match(r.motivo, /error_groq_500/);
  });
  test('Huir exitoso con salida real mueve al jugador; fallo no', async () => {
    const mk = () => { const g = juego(); g.escenas.find((e) => e.id === 'escena_plaza').estadoCalculado = 'peligroso'; return g; };
    const g = mk(); const huir = verboDe(g, 'Huir'); const op = listarNivel2(g, huir).find((o) => o.escenaDestinoId);
    const ok = await jugarTurno(g, { verbo: huir, opcionNivel2: op }, { generadorAleatorio: () => 0.01 });
    assert.deepEqual(ok.movimiento, { desde: 'escena_plaza', hacia: op.escenaDestinoId }); assert.equal(g.jugador.ubicacionActual, op.escenaDestinoId);
    const g2 = mk(); const op2 = listarNivel2(g2, verboDe(g2, 'Huir')).find((o) => o.escenaDestinoId);
    const mal = await jugarTurno(g2, { verbo: verboDe(g2, 'Huir'), opcionNivel2: op2 }, { generadorAleatorio: () => 0.99 });
    assert.equal(mal.movimiento, null); assert.equal(g2.jugador.ubicacionActual, 'escena_plaza');
  });
  test('persistencia: se guarda DESPUÉS de avanzar el mundo, sin bloquear; un fallo no lanza', async () => {
    const llamadas = [];
    const servicio = { guardar: async (e) => { llamadas.push(e.estadoMundo.ticksTranscurridos); return { guardado: true }; } };
    const g = juego({ servicioPersistencia: servicio }); const t0 = g.estadoMundo.ticksTranscurridos;
    const r = await jugarTurno(g, { verbo: verboDe(g, 'Examinar') }); await r.guardado;
    assert.deepEqual(llamadas, [t0 + 1]);
    const g2 = juego({ servicioPersistencia: { guardar: async () => { throw new Error('nube caída'); } } });
    const r2 = await jugarTurno(g2, { verbo: verboDe(g2, 'Examinar') });
    assert.equal((await r2.guardado).guardado, false);
  });
  test('construirVerbo reconstruye el nombre canónico', () => {
    assert.equal(construirVerbo({ etiqueta: 'Hablar con Genérico el Guardia', tipoResolucion: 'textoLibre' }).nombre, 'Hablar con...');
    assert.equal(construirVerbo({ etiqueta: 'Examinar Fuente', tipoResolucion: 'inmediata' }).nombre, 'Examinar');
    assert.equal(construirVerbo({ etiqueta: 'Usar Antorcha', tipoResolucion: 'inmediata' }).nombre, 'Usar');
    assert.equal(construirVerbo({ etiqueta: 'Calmar la situación', tipoResolucion: 'concrecion' }).nombre, 'Calmar la situación');
  });
});
