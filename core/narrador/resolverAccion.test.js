import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearNPC, crearRelacion, crearObjeto, crearEstadoDelMundo } from '../modelos/index.js';
import { resolverAccion } from './resolverAccion.js';

function objeto(datos = {}) {
  return crearObjeto({ id: 'objeto_test', nombre: 'Objeto de prueba', tipo: 'herramienta', ...datos });
}
function npcConRelacion(valor) {
  return crearNPC({
    id: 'npc_test',
    nombre: 'NPC de prueba',
    arquetipo: 'x',
    personalidadBase: 'x',
    relacion: crearRelacion({ valor }),
  });
}
function estadoMundo(ticksTranscurridos = 10) {
  return crearEstadoDelMundo({ ticksTranscurridos });
}
function verbo(nombre, tipoResolucion, extra = {}) {
  return { nombre, tipoResolucion, ...extra };
}
function mapaObjetos(...objetos) {
  return new Map(objetos.map((o) => [o.id, o]));
}

// Argumentos posicionales fijos que ningún test de esta suite usa
// (escena, jugador) — reservados, ver comentario de resolverAccion.js.
const ESCENA_NO_USADA = null;
const JUGADOR_NO_USADO = null;

describe('resolverAccion — verbos "inmediata" (genérico, excepto "Usar")', () => {
  for (const nombre of ['Explorar', 'Descansar', 'Observar', 'Avanzar con cautela', 'Rendirse']) {
    test(`${nombre}: siempre "neutral", sin Nivel 2 ni NPC objetivo, sin tirar dado`, () => {
      const resultado = resolverAccion(
        verbo(nombre, 'inmediata'), null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(5), mapaObjetos(),
        () => {
          throw new Error('no debería consultar el generador aleatorio para un verbo inmediata');
        }
      );
      assert.deepEqual(resultado, {
        verboId: nombre,
        opcionElegidaId: null,
        npcObjetivoId: null,
        textoLibre: null,
        resultado: 'neutral',
        tick: 5,
      });
    });
  }

  test('"Examinar": neutral con Nivel 1 ya fijado, objetoObjetivo no forma parte de AccionResuelta', () => {
    const resultado = resolverAccion(
      verbo('Examinar', 'inmediata', { objetoObjetivo: 'objeto_x' }),
      null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(1), mapaObjetos()
    );
    assert.equal(resultado.resultado, 'neutral');
    assert.equal(resultado.opcionElegidaId, null);
  });
});

describe('resolverAccion — "Usar", decisión B del addendum: se chequea antes del atajo de "inmediata"', () => {
  test('exactamente 1 objeto (Nivel 1 "inmediata"): "fragil" da 55% — límite exacto con generadorAleatorio fijo', () => {
    const fragil = objeto({ id: 'objeto_fragil', confiabilidad: 'fragil' });
    const v = verbo('Usar', 'inmediata', { objetoObjetivo: 'objeto_fragil' });
    const exito = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(fragil), () => 0.54);
    const fallo = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(fragil), () => 0.56);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
  });

  test('exactamente 1 objeto: "estandar" da 75%', () => {
    const estandar = objeto({ id: 'objeto_estandar', confiabilidad: 'estandar' });
    const v = verbo('Usar', 'inmediata', { objetoObjetivo: 'objeto_estandar' });
    const exito = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(estandar), () => 0.74);
    const fallo = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(estandar), () => 0.76);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
  });

  test('exactamente 1 objeto: "resistente" da 90%', () => {
    const resistente = objeto({ id: 'objeto_resistente', confiabilidad: 'resistente' });
    const v = verbo('Usar', 'inmediata', { objetoObjetivo: 'objeto_resistente' });
    const exito = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(resistente), () => 0.89);
    const fallo = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(resistente), () => 0.91);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
  });

  test('objeto sin confiabilidad explícita (fixture viejo, bypass de crearObjeto) se trata como "estandar" (75%)', () => {
    const sinCampo = { id: 'objeto_viejo', nombre: 'Viejo', tipo: 'arma', utilizableComo: ['atacar'] };
    const v = verbo('Usar', 'inmediata', { objetoObjetivo: 'objeto_viejo' });
    const exito = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(sinCampo), () => 0.74);
    assert.equal(exito.resultado, 'exito');
  });

  test('más de 1 objeto (Nivel 2 "concrecion"): el objetoObjetivo viaja en opcionNivel2, mismo cálculo', () => {
    const fragil = objeto({ id: 'objeto_fragil', nombre: 'Antorcha', confiabilidad: 'fragil' });
    const v = verbo('Usar', 'concrecion');
    const opcionNivel2 = { etiqueta: 'Usar Antorcha', objetoObjetivo: 'objeto_fragil', comportamientoAlElegir: 'seResuelveSola' };
    const fallo = resolverAccion(v, opcionNivel2, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(fragil), () => 0.56);
    assert.equal(fallo.resultado, 'fallo');
    assert.equal(fallo.opcionElegidaId, 'Usar Antorcha');
  });

  test('nunca aplica el modificador de relación, ni con NPC hostil presente en la escena', () => {
    const estandar = objeto({ id: 'objeto_estandar', confiabilidad: 'estandar' });
    const hostil = npcConRelacion(-90); // categoría Hostil, modificador tabla -25
    const v = verbo('Usar', 'inmediata', { objetoObjetivo: 'objeto_estandar' });
    // Si el modificador de relación se colara, 75-25=50 fallaría en 0.51;
    // sin modificador, 75% sigue dando éxito en 0.51.
    const resultado = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, hostil, estadoMundo(), mapaObjetos(estandar), () => 0.51);
    assert.equal(resultado.resultado, 'exito');
    assert.equal(resultado.npcObjetivoId, null); // "Usar" no tiene concepto de NPC objetivo
  });
});

describe('resolverAccion — patrón "objetos" (Atacar/Defender, doc técnico 2.2)', () => {
  test('Atacar con objeto real: 65%', () => {
    const v = verbo('Atacar', 'concrecion');
    const opcionConObjeto = { etiqueta: 'Atacar con Daga', objetoObjetivo: 'objeto_daga', comportamientoAlElegir: 'seResuelveSola' };
    const exito = resolverAccion(v, opcionConObjeto, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(), () => 0.64);
    const fallo = resolverAccion(v, opcionConObjeto, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(), () => 0.66);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
  });

  test('Atacar con la opción fija ("a mano limpia", sin objetoObjetivo): 45%', () => {
    const v = verbo('Atacar', 'concrecion');
    const opcionFija = { etiqueta: 'Atacar a mano limpia', comportamientoAlElegir: 'seResuelveSola' };
    const exito = resolverAccion(v, opcionFija, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(), () => 0.44);
    const fallo = resolverAccion(v, opcionFija, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(), () => 0.46);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
  });

  test('Atacar invierte el signo del modificador de relación: NPC hostil ayuda (65% + 25% = 90%)', () => {
    const hostil = npcConRelacion(-90);
    const v = verbo('Atacar', 'concrecion');
    const opcion = { etiqueta: 'Atacar con Daga', objetoObjetivo: 'objeto_daga', comportamientoAlElegir: 'seResuelveSola' };
    const exito = resolverAccion(v, opcion, ESCENA_NO_USADA, JUGADOR_NO_USADO, hostil, estadoMundo(), mapaObjetos(), () => 0.89);
    const fallo = resolverAccion(v, opcion, ESCENA_NO_USADA, JUGADOR_NO_USADO, hostil, estadoMundo(), mapaObjetos(), () => 0.91);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
    assert.equal(exito.npcObjetivoId, 'npc_test');
  });

  test('Defender NO invierte el signo: NPC hostil perjudica (65% - 25% = 40%)', () => {
    const hostil = npcConRelacion(-90);
    const v = verbo('Defender', 'concrecion');
    const opcion = { etiqueta: 'Defender con Escudo', objetoObjetivo: 'objeto_escudo', comportamientoAlElegir: 'seResuelveSola' };
    const exito = resolverAccion(v, opcion, ESCENA_NO_USADA, JUGADOR_NO_USADO, hostil, estadoMundo(), mapaObjetos(), () => 0.39);
    const fallo = resolverAccion(v, opcion, ESCENA_NO_USADA, JUGADOR_NO_USADO, hostil, estadoMundo(), mapaObjetos(), () => 0.41);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
  });
});

describe('resolverAccion — patrón "riesgo" (salidas/cobertura: Huir/Retirarse/Abortar/Emboscar/Ocultarse)', () => {
  test('Huir por una salida limpia (sin riesgosa): 70%', () => {
    const v = verbo('Huir', 'concrecion');
    const opcionLimpia = { etiqueta: 'Huir hacia la puerta', escenaDestinoId: 'escena_x', comportamientoAlElegir: 'seResuelveSola' };
    const exito = resolverAccion(v, opcionLimpia, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(), () => 0.69);
    const fallo = resolverAccion(v, opcionLimpia, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(), () => 0.71);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
  });

  test('Huir por una opción del pool desesperado (riesgosa:true): 30% — caso desglosado sección 4', () => {
    const v = verbo('Huir', 'concrecion');
    const opcionRiesgosa = { etiqueta: 'Forzar una salida improvisada', comportamientoAlElegir: 'seResuelveSola', riesgosa: true };
    // Reproduce exactamente el caso de la sección 4 del doc técnico:
    // generadorAleatorio() = 0.5 -> 0.5*100=50, no es menor a 30 -> fallo.
    const resultado = resolverAccion(
      v, opcionRiesgosa, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(72), mapaObjetos(), () => 0.5
    );
    assert.deepEqual(resultado, {
      verboId: 'Huir',
      opcionElegidaId: 'Forzar una salida improvisada',
      npcObjetivoId: null,
      textoLibre: null,
      resultado: 'fallo',
      tick: 72,
    });
  });
});

describe('resolverAccion — patrón "tono" (Negociar/Presionar/Calmar la situación/Distraer): 55% fijo', () => {
  test('Negociar: 55%, no distingue por opción de tono elegida', () => {
    const v = verbo('Negociar', 'concrecion');
    const ofrecerValor = { etiqueta: 'Ofrecer algo de valor a cambio', comportamientoAlElegir: 'abreTextoLibreConContexto' };
    const puntoMedio = { etiqueta: 'Buscar un punto medio razonable', comportamientoAlElegir: 'abreTextoLibreConContexto' };
    for (const opcion of [ofrecerValor, puntoMedio]) {
      const exito = resolverAccion(v, opcion, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(), () => 0.54);
      const fallo = resolverAccion(v, opcion, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(), mapaObjetos(), () => 0.56);
      assert.equal(exito.resultado, 'exito');
      assert.equal(fallo.resultado, 'fallo');
    }
  });

  test('Negociar con NPC cordial: 55% + 10% = 65%', () => {
    const cordial = npcConRelacion(40);
    const v = verbo('Negociar', 'concrecion');
    const opcion = { etiqueta: 'Apelar a la relación existente', comportamientoAlElegir: 'abreTextoLibreConContexto' };
    const exito = resolverAccion(v, opcion, ESCENA_NO_USADA, JUGADOR_NO_USADO, cordial, estadoMundo(), mapaObjetos(), () => 0.64);
    const fallo = resolverAccion(v, opcion, ESCENA_NO_USADA, JUGADOR_NO_USADO, cordial, estadoMundo(), mapaObjetos(), () => 0.66);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
  });
});

describe('resolverAccion — "Hablar con..." (textoLibre puro, sin Nivel 2): 60% fijo', () => {
  test('60% base, opcionElegidaId null porque no hay Nivel 2', () => {
    const v = verbo('Hablar con...', 'textoLibre');
    const exito = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(3), mapaObjetos(), () => 0.59);
    const fallo = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(3), mapaObjetos(), () => 0.61);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
    assert.equal(exito.opcionElegidaId, null);
  });

  test('con NPC objetivo aplica modificador de relación igual que cualquier otro verbo con npcObjetivo', () => {
    const desconfiado = npcConRelacion(-40); // categoría Desconfiado, modificador -10
    const v = verbo('Hablar con...', 'textoLibre');
    const exito = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, desconfiado, estadoMundo(), mapaObjetos(), () => 0.49);
    const fallo = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, desconfiado, estadoMundo(), mapaObjetos(), () => 0.51);
    assert.equal(exito.resultado, 'exito');
    assert.equal(fallo.resultado, 'fallo');
    assert.equal(exito.npcObjetivoId, 'npc_test');
  });
});

describe('resolverAccion — determinismo e identidad del resultado', () => {
  test('mismo generadorAleatorio fijo produce siempre el mismo resultado', () => {
    const v = verbo('Huir', 'concrecion');
    const opcion = { etiqueta: 'Huir hacia la puerta', escenaDestinoId: 'x', comportamientoAlElegir: 'seResuelveSola' };
    const a = resolverAccion(v, opcion, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(1), mapaObjetos(), () => 0.1);
    const b = resolverAccion(v, opcion, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(1), mapaObjetos(), () => 0.1);
    assert.deepEqual(a, b);
  });

  test('tick sale de estadoMundo.ticksTranscurridos, no de un contador propio', () => {
    const v = verbo('Explorar', 'inmediata');
    const resultado = resolverAccion(v, null, ESCENA_NO_USADA, JUGADOR_NO_USADO, null, estadoMundo(999), mapaObjetos());
    assert.equal(resultado.tick, 999);
  });
});
