/**
 * Fase 5 — Registro de plantillas de narración. Ver doc técnico Fase
 * 5, sección 3.2, y fase_5_ADENDUM.md, sección 3 (alcance de
 * cobertura para el cascarón).
 *
 * Simplificación respecto al `Plantilla { id, variantes }` del
 * pseudocódigo original (sección 3.1): acá el registro es
 * `Record<string, string[]>` directo — el id ya es la clave del
 * objeto, repetirlo adentro de cada entrada sería redundante y no es
 * el estilo que usa ningún otro registro del proyecto (compárese con
 * `opcionesTono.js` / `registroPatrones.js` de Fase 3). No cambia
 * ningún contrato externo: `seleccionarVariante` sigue recibiendo un
 * `plantillaId` string y devolviendo un string.
 *
 * COBERTURA (decisión de alcance confirmada con Tomás, ver charla de
 * inicio de esta fase): las 6 combinaciones del ejemplo mínimo del
 * documento (huir/atacar/usar exito+fallo, verbo_explorar) más una
 * plantilla extra por cada patrón que faltaba representar
 * (negociar → "tono", hablar_con → "textoLibre") y el resto de los
 * verbos "inmediata" (que sólo necesitan 1 entrada cada uno, sin
 * split éxito/fallo, porque siempre resuelven "neutral" — barato de
 * cubrir del todo). Deliberadamente AFUERA: Presionar, Retirarse,
 * Abortar, Emboscar, Ocultarse, Distraer, Defender, Calmar la
 * situación — combinaciones verbo×resultado que no están acá caen en
 * el fallback documentado en sección 5 ("plantilla no registrada") y
 * quedan como punto de extensión para cuando entre lore real, mismo
 * criterio anti-sobre-diseño que el resto del cascarón.
 */

export const registroPlantillasPorDefecto = {
  // --- Patrón "salidas" (Huir) — ejemplo mínimo del documento ---
  resultado_huir_exito: [
    'Lográs escabullirte {lugar} justo a tiempo.',
    'Con el corazón acelerado, conseguís escapar {lugar}.',
    'La salida se abre paso libre y salís {lugar} sin mirar atrás.',
  ],
  resultado_huir_fallo: [
    'Tropezás al intentar huir {lugar} y perdés un instante valioso.',
    'El escape {lugar} no sale como esperabas — algo te frena.',
    'Casi lo lográs, pero {lugar} termina siendo un callejón sin salida.',
  ],

  // --- Patrón "objetos" (Atacar) — ejemplo mínimo del documento ---
  resultado_atacar_exito: [
    'El golpe conecta con fuerza.',
    '{jugador} logra un ataque certero.',
    'El movimiento da en el blanco, limpio y directo.',
  ],
  resultado_atacar_fallo: [
    'El golpe se pierde en el aire.',
    '{npc} esquiva por poco.',
    'El ataque falla, dejándote expuesto un instante.',
  ],

  // --- Verbo "Usar" (patrón propio) — ejemplo mínimo del documento ---
  resultado_usar_exito: [
    'Usás {objeto} sin contratiempos.',
    'El {objeto} responde bien a la mano.',
    '{jugador} maneja {objeto} con la soltura esperada.',
  ],
  resultado_usar_fallo: [
    '{objeto} falla justo cuando lo necesitás — se traba en tus manos.',
    'El {objeto} no responde como esperabas, y perdés un instante valioso.',
    'Algo cede en el {objeto} en el peor momento posible.',
  ],

  // --- Patrón "tono" (Negociar) — cobertura extra de patrón ---
  resultado_negociar_exito: [
    'La propuesta cae bien — llegan a un acuerdo.',
    'Encontrás las palabras justas y la negociación se acomoda a tu favor.',
    'El otro lado cede terreno; el trato queda cerrado.',
  ],
  resultado_negociar_fallo: [
    'La negociación se traba — no hay acuerdo posible por ahora.',
    'Tu propuesta cae en saco roto.',
    'El intento de acercar posiciones no prospera.',
  ],

  // --- "Hablar con..." (textoLibre puro) — cobertura extra de patrón ---
  resultado_hablar_con_exito: [
    'La charla fluye — {npc} responde con más apertura de la esperada.',
    'Encontrás el tono justo y la conversación avanza bien.',
    '{npc} se relaja un poco y sigue hablando de buena gana.',
  ],
  resultado_hablar_con_fallo: [
    'La conversación se enfría — {npc} se cierra.',
    'Algo en lo que decís no cae bien; {npc} se pone cortante.',
    '{npc} responde con monosílabos y corta la charla ahí.',
  ],

  // --- Verbos "inmediata" (siempre "neutral", una sola entrada c/u) ---
  verbo_explorar: [
    'Recorrés el lugar con calma, sin prisa.',
    'Le das una vuelta al entorno, atento a los detalles.',
    'Caminás explorando lo que hay alrededor.',
  ],
  verbo_descansar: [
    'Te tomás un momento para descansar.',
    'Aflojás el paso y dejás que el cuerpo se recupere un poco.',
    'Un respiro breve, sin apuro por seguir.',
  ],
  verbo_observar: [
    'Recorrés el lugar con la mirada, sin decir nada todavía.',
    'Te quedás un momento observando antes de actuar.',
    'Prestás atención a los detalles de lo que te rodea.',
  ],
  verbo_examinar: [
    'Le dedicás un momento a examinar {objeto}.',
    'Revisás {objeto} de cerca, con calma.',
    'Te detenés a mirar {objeto} con atención.',
  ],
  verbo_avanzar_con_cautela: [
    'Avanzás despacio, atento a cualquier señal.',
    'Cada paso lo das con cuidado, sin apurarte.',
    'Te movés con cautela, tratando de no llamar la atención.',
  ],
  verbo_rendirse: [
    'Bajás las manos y te rendís.',
    'Dejás en claro que no vas a seguir resistiendo.',
    'Te entregás, sin oponer más resistencia.',
  ],
};

/**
 * Convención de nomenclatura de ids de plantilla:
 *   - "neutral" (verbos inmediata, o cualquier otro que resuelva
 *     neutral) → `verbo_<slug>` — no distingue éxito/fallo porque no
 *     hubo tirada.
 *   - cualquier otro resultado → `resultado_<slug>_<exito|fallo>`.
 * `slug` normaliza tildes, baja a minúsculas, saca puntuación
 * ("Hablar con..." → "hablar_con") y reemplaza espacios por "_".
 *
 * @param {string} verboNombre
 * @returns {string}
 */
function slugDeVerbo(verboNombre) {
  return verboNombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * @param {string} verboNombre
 * @param {"exito"|"fallo"|"neutral"} resultado
 * @returns {string} plantillaId
 */
export function plantillaIdPara(verboNombre, resultado) {
  const slug = slugDeVerbo(verboNombre);
  return resultado === 'neutral' ? `verbo_${slug}` : `resultado_${slug}_${resultado}`;
}
