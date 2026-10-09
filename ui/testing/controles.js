/**
 * Fase 8 — Controles del panel. Principio (doc maestro): INYECTAR CONDICIONES,
 * no parchar estado para que todo se vea bien. Cada control entra por la misma
 * puerta que usaría el juego (crearEvento, avanzarMundo, restaurar motores,
 * fetch/registroUso inyectables). Efectos que sólo se ven en el próximo tick
 * se dejan así a propósito: es lo que haría el juego real.
 * Toda función devuelve datos puros; la UI sólo los pinta.
 */
import { avanzarMundo } from '../../core/orquestador/avanzarMundo.js';
import { ESTADOS_DE_ESCENA } from '../../core/comprensionMundo/calcularEstadoEscena.js';
import { crearMotorDeNPCs } from '../../core/npcs/motorNPCs.js';
import { proyectarEstadoEmocional, clampTemor, clampDisposicion } from '../../core/npcs/proyeccionEstadoEmocional.js';
import { clampRelacion } from '../../core/npcs/categoriasRelacion.js';
import { crearRegistroUso, VENTANA_DIA_MS } from '../../core/ia/registroUso.js';
import { capturarEstadoCompleto, prepararParaGuardado } from '../../persistencia/estadoCompleto.js';

/** Crea un evento por la puerta real (validación de Fase 0 incluida). El estado de escena lo recalcula el próximo tick. */
export function forzarEvento(g, { tipo, escenaId, duracion = 5, condicionExpiracion = null, metadata = {}, id }) {
  const datos = { id: id ?? `evento_forzado_${tipo}_${g.estadoMundo.ticksTranscurridos}_${Math.floor(Math.random() * 1e6)}`,
    tipo, escenaId, duracion, condicionExpiracion, activo: true, metadata };
  const r = g.motorEventos.crearEvento(datos, g.estadoMundo);
  return { ok: !!r.evento, evento: r.evento ?? null, errores: r.errores ?? [] };
}

/** N ticks de a uno (`salto:false`) o de un solo salto (`salto:true`, el caso "dormir" de Fase 1). */
export function avanzarNTicks(g, n, { salto = false } = {}) {
  const reportes = [];
  if (salto) reportes.push(...avanzarMundo(g, n, g.opcionesMundo).reportes);
  else for (let i = 0; i < n; i++) reportes.push(...avanzarMundo(g, 1, g.opcionesMundo).reportes);
  return { ticksTranscurridos: g.estadoMundo.ticksTranscurridos, reportes };
}

/** Valor FORZADO, no calculado: marcado en `g.estadosForzados` y reportado; el próximo avance de tick lo pisa. */
export function forzarEstadoEscena(g, escenaId, estado) {
  if (!ESTADOS_DE_ESCENA.some((e) => e.estado === estado)) throw new Error(`Estado inválido: '${estado}'.`);
  const escena = g.escenas.find((e) => e.id === escenaId);
  if (!escena) throw new Error(`Escena inexistente: '${escenaId}'.`);
  escena.estadoCalculado = estado;
  (g.estadosForzados ??= {})[escenaId] = estado;
  return { advertencia: `FORZADO (no calculado): ${escenaId} = ${estado}. El próximo tick lo recalcula.` };
}

/** Relación/ejes de un NPC reconstruyendo el motor de NPCs desde su estado interno exportado (misma vía que una carga). */
export function editarNpc(g, npcId, { relacion, nivelTemor, nivelDisposicion }) {
  const npc = g.npcs.find((n) => n.id === npcId);
  if (!npc) throw new Error(`NPC inexistente: '${npcId}'.`);
  const interno = JSON.parse(JSON.stringify(g.motorNPCs.exportarEstadoInterno()));
  const ejes = interno.ejes[npcId];
  if (nivelTemor !== undefined) ejes.nivelTemor = clampTemor(nivelTemor);
  if (nivelDisposicion !== undefined) ejes.nivelDisposicion = clampDisposicion(nivelDisposicion);
  if (relacion !== undefined) npc.relacion.valor = clampRelacion(relacion);
  npc.estadoEmocional = proyectarEstadoEmocional(ejes.nivelTemor, ejes.nivelDisposicion);
  g.motorNPCs = crearMotorDeNPCs({ npcs: g.npcs, escenas: g.escenas, motorEventos: g.motorEventos, estadoInternoInicial: interno });
  return { npc, ejes };
}

export function forzarMock(g, activo = true) {
  g.opcionesDialogo = { ...g.opcionesDialogo, forzarMock: activo };
}

const respuestaFalsa = (status) => ({ ok: false, status, headers: new Map(), text: async () => 'simulado', json: async () => ({}) });

/** tipo: '500' | 'red' | '429' | 'vacia' | null (quita la simulación). Con apiKey ausente pone una de mentira para que el camino llegue a la red falsa. */
export function simularErrorGroq(g, tipo) {
  const o = { ...g.opcionesDialogo };
  if (tipo == null) { delete o.fetch; g.opcionesDialogo = o; if (g._apiKeySimulada) { g.configuracionGroq = { ...g.configuracionGroq, apiKey: null }; g._apiKeySimulada = false; } return; }
  if (!g.configuracionGroq.apiKey) { g.configuracionGroq = { ...g.configuracionGroq, apiKey: 'clave-simulada' }; g._apiKeySimulada = true; }
  o.fetch = tipo === 'red' ? async () => { throw new TypeError('Failed to fetch (simulado)'); }
    : tipo === '429' ? async () => ({ ...respuestaFalsa(429), headers: new Map([['retry-after', '1']]) })
    : tipo === 'vacia' ? async () => ({ ok: true, status: 200, headers: new Map(), json: async () => ({ choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }) })
    : async () => respuestaFalsa(500);
  o.dormir = async () => {}; // sin esperas reales en simulación de 429
  g.opcionesDialogo = o;
}

/** Carga `registroUso` cerca de un tope: 'rpm' (30 llamadas/min), 'tpm' (~7.900 tokens/min), 'rpd' (1.000 en 24h). Se pasa `dormir` falso para no esperar de verdad. */
export function simularRateLimit(g, tope, ahora = Date.now()) {
  const llamadas = [];
  if (tope === 'rpm') for (let i = 0; i < 30; i++) llamadas.push({ t: ahora - 5000 - i, tokens: 10 });
  else if (tope === 'tpm') llamadas.push({ t: ahora - 5000, tokens: 7900 });
  else if (tope === 'rpd') for (let i = 0; i < 1000; i++) llamadas.push({ t: ahora - 3600_000 - i * 1000, tokens: 10 });
  else throw new Error(`Tope inválido: '${tope}'.`);
  g.registroUso = crearRegistroUso({ estadoInicial: { llamadas } });
  g.opcionesDialogo = { ...g.opcionesDialogo, dormir: async () => {} };
  return g.registroUso.resumen();
}

/** JSON exacto que se mandaría a Firestore + chequeo de canarios (apiKey/registroUso no pueden aparecer). */
export function verPayloadFirestore(g) {
  const estado = capturarEstadoCompleto({ codigoPartida: g.codigoPartida, jugador: g.jugador, npcs: g.npcs, escenas: g.escenas,
    estadoMundo: g.estadoMundo, motorEventos: g.motorEventos, motorSucesos: g.motorSucesos, motorNPCs: g.motorNPCs, reloj: g.reloj });
  const { payload, errores, reportes } = prepararParaGuardado(estado);
  const json = payload ? JSON.stringify(payload, null, 2) : null;
  const secretos = [g.configuracionGroq?.apiKey].filter(Boolean);
  return { json, errores, reportes, fugas: secretos.filter((s) => json?.includes(s)).length > 0 || /"registroUso"|"apiKey"/.test(json ?? '') };
}

/** Corrompe el documento de la nube a propósito: 'estructura' | 'version_futura' | 'referencias'. */
export async function corromperNube(adaptadorNube, codigo, tipo) {
  const doc = await adaptadorNube.cargarPartida(codigo);
  if (!doc) throw new Error('No hay documento en la nube para ese código.');
  const copia = JSON.parse(JSON.stringify(doc));
  if (tipo === 'version_futura') copia.versionEsquema = (copia.versionEsquema ?? 1) + 1;
  else if (tipo === 'estructura') delete copia.jugador;
  else if (tipo === 'referencias') copia.jugador.ubicacionActual = 'escena_que_no_existe';
  else throw new Error(`Tipo inválido: '${tipo}'.`);
  await adaptadorNube.guardarPartida(copia);
}
