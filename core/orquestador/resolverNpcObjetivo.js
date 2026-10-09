/**
 * Fase 8 — ¿Contra qué NPC apunta un verbo ligado a estado?
 *
 * Fase 3 nunca lo definió (el Nivel 2 de Atacar elige arma, no objetivo) y
 * Fase 4/5 aplican su efecto al `npcObjetivoId` que reciban. HUECO REAL: el
 * fixture base ya tiene 2 NPCs activos en escena_plaza, o sea que el caso de
 * ambigüedad NO es hipotético (el doc de Fase 8 original decía que nunca se
 * ejercitaba: era incorrecto).
 *
 * REGLA (decisión de Fase 8, ver fase_8_ADENDUM.md §3), determinística:
 *   0. verbo.npcObjetivo ya fijado (Hablar con...) -> ese NPC, sin ambigüedad.
 *   1. verbo que no necesita NPC -> null.
 *   2. candidatos = NPCs activos presentes en la escena. 0 -> null; 1 -> ese.
 *   3. 2 o más (SIEMPRE se reporta como ambigüedad), en este orden:
 *      a. "fuente de amenaza": los que son `metadata.npcId` de un evento activo
 *         de la escena categorizado peligroso/combate (misma convención que
 *         Fase 4, sección 4.2). Si hay alguno entre los candidatos, se restringe a ellos.
 *      b. entre los que quedan, el de MENOR `relacion.valor` (el más conflictivo).
 *      c. empate -> el primero en `escena.npcsPresentes`.
 *
 * Limitación conocida: el jugador no puede elegir. Resolverlo de verdad es un
 * cambio de alcance de Fase 3 (una opción por NPC); queda como extensión futura.
 */
import { registroCategoriasEventoPorDefecto } from '../comprensionMundo/registroCategoriasEvento.js';

export const verbosConNpcObjetivoPorDefecto = Object.freeze([
  'Atacar', 'Defender', 'Emboscar', 'Negociar', 'Presionar', 'Calmar la situación', 'Distraer',
]);

const CATEGORIAS_AMENAZA = ['peligroso', 'combate'];

/** @returns {{ npc: object|null, motivo: string, reportes: {origen:string,mensaje:string}[] }} */
export function resolverNpcObjetivo(verbo, escena, npcsPorId, {
  motorEventos = null,
  registroCategoriasEvento = registroCategoriasEventoPorDefecto,
  verbosConNpcObjetivo = verbosConNpcObjetivoPorDefecto,
} = {}) {
  const reportes = [];

  if (verbo.npcObjetivo) {
    return { npc: npcsPorId.get(verbo.npcObjetivo) ?? null, motivo: 'fijado_por_verbo', reportes };
  }
  if (!verbosConNpcObjetivo.includes(verbo.nombre)) return { npc: null, motivo: 'verbo_sin_npc', reportes };

  const candidatos = (escena.npcsPresentes ?? []).map((id) => npcsPorId.get(id)).filter((n) => n && n.activo);
  if (candidatos.length === 0) return { npc: null, motivo: 'sin_npcs', reportes };
  if (candidatos.length === 1) return { npc: candidatos[0], motivo: 'unico_presente', reportes };

  let pool = candidatos;
  let motivo = 'primero_presente';

  const fuentes = new Set();
  for (const ev of motorEventos?.listarEventosActivos(escena.id) ?? []) {
    const cat = registroCategoriasEvento[ev.tipo]?.categoriaEstado;
    if (CATEGORIAS_AMENAZA.includes(cat) && ev.metadata?.npcId) fuentes.add(ev.metadata.npcId);
  }
  const conAmenaza = pool.filter((n) => fuentes.has(n.id));
  if (conAmenaza.length > 0) { pool = conAmenaza; motivo = 'fuente_de_amenaza'; }

  const minRel = Math.min(...pool.map((n) => n.relacion.valor));
  const masConflictivos = pool.filter((n) => n.relacion.valor === minRel);
  if (masConflictivos.length < pool.length) { pool = masConflictivos; if (motivo !== 'fuente_de_amenaza') motivo = 'menor_relacion'; }

  const elegido = pool[0]; // el pool conserva el orden de escena.npcsPresentes
  reportes.push({
    origen: 'resolverNpcObjetivo',
    mensaje: `Objetivo ambiguo para '${verbo.nombre}' en ${escena.id}: ${candidatos.length} NPCs activos (${candidatos.map((n) => n.id).join(', ')}). Se eligió '${elegido.id}' por regla '${motivo}'.`,
  });
  return { npc: elegido, motivo, reportes };
}
