import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEscena, crearJugador, crearObjeto } from '../modelos/index.js';
import { generarOpcionesNivel2 } from './generarOpcionesNivel2.js';
import { registroPatrones } from './registroPatrones.js';
import { construirObjetosPorId } from './resolutores.js';

function escenaDePrueba(datos = {}) {
  return crearEscena({ id: 'escena_test', nombre: 'Escena de prueba', descripcionBase: 'Sin descripción.', ...datos });
}
function jugadorDePrueba(datos = {}) {
  return crearJugador({ id: 'jugador_test', nombre: 'Jugador de prueba', ubicacionActual: 'escena_test', ...datos });
}
function objetoDePrueba(datos = {}) {
  return crearObjeto({ id: 'objeto_test', nombre: 'Objeto de prueba', tipo: 'herramienta', ...datos });
}
function verbo(nombre) {
  return { nombre, tipoResolucion: 'concrecion' };
}

describe('generarOpcionesNivel2 — patrón "salidas" (sección 4.2/4.3)', () => {
  test('0 salidas: 3 opciones desesperadas, todas riesgosa:true', () => {
    const escena = escenaDePrueba({ salidas: [] });
    const opciones = generarOpcionesNivel2(verbo('Huir'), escena, jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
    assert.equal(opciones.length, 3);
    assert.ok(opciones.every((o) => o.riesgosa === true));
  });

  test('1 salida real: completa con 2 desesperadas hasta el mínimo de 3', () => {
    const escena = escenaDePrueba({ salidas: [{ etiqueta: 'la puerta', escenaDestinoId: 'escena_x' }] });
    const opciones = generarOpcionesNivel2(verbo('Huir'), escena, jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
    assert.equal(opciones.length, 3);
    assert.equal(opciones.filter((o) => o.riesgosa).length, 2);
    assert.ok(opciones.some((o) => o.etiqueta === 'Huir hacia la puerta' && !o.riesgosa));
  });

  test('3 salidas reales: exactamente esas 3, sin desesperadas', () => {
    const salidas = ['a', 'b', 'c'].map((l) => ({ etiqueta: l, escenaDestinoId: `escena_${l}` }));
    const opciones = generarOpcionesNivel2(verbo('Huir'), escenaDePrueba({ salidas }), jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
    assert.equal(opciones.length, 3);
    assert.equal(opciones.some((o) => o.riesgosa), false);
  });

  test('6 salidas reales (>4): sólo se muestran las primeras 4', () => {
    const salidas = ['a', 'b', 'c', 'd', 'e', 'f'].map((l) => ({ etiqueta: l, escenaDestinoId: `escena_${l}` }));
    const opciones = generarOpcionesNivel2(verbo('Huir'), escenaDePrueba({ salidas }), jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
    assert.equal(opciones.length, 4);
  });

  test('la etiqueta usa el nombre del verbo elegido — "Retirarse hacia X", no "Huir hacia X"', () => {
    const escena = escenaDePrueba({ salidas: [{ etiqueta: 'la ventana', escenaDestinoId: 'escena_x' }] });
    const opciones = generarOpcionesNivel2(verbo('Retirarse'), escena, jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
    assert.ok(opciones.some((o) => o.etiqueta === 'Retirarse hacia la ventana'));
  });
});

describe('generarOpcionesNivel2 — patrón "cobertura" (sección 4.2/4.3)', () => {
  test('0 cobertura: 3 opciones desesperadas', () => {
    const escena = escenaDePrueba({ coberturaDisponible: [] });
    const opciones = generarOpcionesNivel2(verbo('Emboscar'), escena, jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
    assert.equal(opciones.length, 3);
    assert.ok(opciones.every((o) => o.riesgosa === true));
  });

  test('1 cobertura real: completa a 3', () => {
    const escena = escenaDePrueba({ coberturaDisponible: ['detrás de un barril'] });
    const opciones = generarOpcionesNivel2(verbo('Emboscar'), escena, jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
    assert.equal(opciones.length, 3);
    assert.ok(opciones.some((o) => o.etiqueta === 'Emboscar desde detrás de un barril' && !o.riesgosa));
  });

  test('la etiqueta usa el nombre del verbo elegido — "Ocultarse desde X", no "Emboscar desde X"', () => {
    const escena = escenaDePrueba({ coberturaDisponible: ['detrás de la fragua'] });
    const opciones = generarOpcionesNivel2(verbo('Ocultarse'), escena, jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
    assert.ok(opciones.some((o) => o.etiqueta === 'Ocultarse desde detrás de la fragua'));
  });
});

describe('generarOpcionesNivel2 — patrón "objetos" (sección 4.2)', () => {
  test('inventario y escena vacíos: sólo la opción fija — nunca cae en fallback desesperado', () => {
    const opciones = generarOpcionesNivel2(
      verbo('Atacar'), escenaDePrueba({ objetosPresentes: [] }), jugadorDePrueba({ inventario: [] }),
      registroPatrones, construirObjetosPorId([])
    );
    assert.deepEqual(opciones, [{ etiqueta: 'Atacar a mano limpia', comportamientoAlElegir: 'seResuelveSola' }]);
  });

  test('objeto utilizable en el inventario aparece + opción fija', () => {
    const daga = objetoDePrueba({ id: 'objeto_daga', nombre: 'Daga', utilizableComo: ['atacar'] });
    const jugador = jugadorDePrueba({ inventario: [{ objetoId: 'objeto_daga', cantidad: 1 }] });
    const opciones = generarOpcionesNivel2(verbo('Atacar'), escenaDePrueba(), jugador, registroPatrones, construirObjetosPorId([daga]));
    assert.equal(opciones.length, 2);
    assert.ok(opciones.some((o) => o.etiqueta === 'Atacar con Daga' && o.objetoObjetivo === 'objeto_daga'));
    assert.ok(opciones.some((o) => o.etiqueta === 'Atacar a mano limpia'));
  });

  test('objeto utilizable presente en la escena (no en el inventario) también cuenta', () => {
    const lanza = objetoDePrueba({ id: 'objeto_lanza', nombre: 'Lanza', utilizableComo: ['atacar'] });
    const escena = escenaDePrueba({ objetosPresentes: ['objeto_lanza'] });
    const opciones = generarOpcionesNivel2(verbo('Atacar'), escena, jugadorDePrueba({ inventario: [] }), registroPatrones, construirObjetosPorId([lanza]));
    assert.ok(opciones.some((o) => o.etiqueta === 'Atacar con Lanza'));
  });

  test('objeto cuyo utilizableComo no incluye la categoría del verbo no aparece', () => {
    const antorcha = objetoDePrueba({ id: 'objeto_antorcha', nombre: 'Antorcha', utilizableComo: ['atacar'] });
    const jugador = jugadorDePrueba({ inventario: [{ objetoId: 'objeto_antorcha', cantidad: 1 }] });
    const opciones = generarOpcionesNivel2(verbo('Defender'), escenaDePrueba(), jugador, registroPatrones, construirObjetosPorId([antorcha]));
    assert.deepEqual(opciones, [{ etiqueta: 'Defenderse con lo que tengas a mano', comportamientoAlElegir: 'seResuelveSola' }]);
  });
});

describe('generarOpcionesNivel2 — patrón "tono" (sección 4.4)', () => {
  for (const nombre of ['Negociar', 'Presionar', 'Calmar la situación', 'Distraer']) {
    test(`${nombre}: siempre exactamente 3 opciones fijas, "abreTextoLibreConContexto"`, () => {
      const opciones = generarOpcionesNivel2(verbo(nombre), escenaDePrueba(), jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
      assert.equal(opciones.length, 3);
      assert.ok(opciones.every((o) => o.comportamientoAlElegir === 'abreTextoLibreConContexto'));
    });
  }

  test('no varía según la escena', () => {
    const escenaVacia = escenaDePrueba();
    const escenaConTodo = escenaDePrueba({ salidas: [{ etiqueta: 'x', escenaDestinoId: 'y' }], coberturaDisponible: ['z'] });
    const a = generarOpcionesNivel2(verbo('Negociar'), escenaVacia, jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
    const b = generarOpcionesNivel2(verbo('Negociar'), escenaConTodo, jugadorDePrueba(), registroPatrones, construirObjetosPorId([]));
    assert.deepEqual(a, b);
  });
});

describe('generarOpcionesNivel2 — patrón "usar" (fase_3_ADENDUM.md sección 2)', () => {
  test('lista todos los objetos usables del inventario, sin pool desesperado', () => {
    const antorcha = objetoDePrueba({ id: 'objeto_antorcha', nombre: 'Antorcha', utilizableComo: ['atacar'] });
    const pocion = objetoDePrueba({ id: 'objeto_pocion', nombre: 'Poción', utilizableComo: ['curar'] });
    const jugador = jugadorDePrueba({
      inventario: [{ objetoId: 'objeto_antorcha', cantidad: 1 }, { objetoId: 'objeto_pocion', cantidad: 1 }],
    });
    const opciones = generarOpcionesNivel2(
      { nombre: 'Usar', tipoResolucion: 'concrecion' }, escenaDePrueba(), jugador,
      registroPatrones, construirObjetosPorId([antorcha, pocion])
    );
    assert.equal(opciones.length, 2);
    assert.ok(opciones.some((o) => o.etiqueta === 'Usar Antorcha'));
    assert.ok(opciones.some((o) => o.etiqueta === 'Usar Poción'));
  });

  test('decisión A del addendum: usar un objeto con utilizableComo=["atacar"] nunca genera la misma opción que Atacar', () => {
    const daga = objetoDePrueba({ id: 'objeto_daga', nombre: 'Daga', utilizableComo: ['atacar'] });
    const jugador = jugadorDePrueba({ inventario: [{ objetoId: 'objeto_daga', cantidad: 1 }] });
    const objetosPorId = construirObjetosPorId([daga]);

    const desdeUsar = generarOpcionesNivel2(
      { nombre: 'Usar', tipoResolucion: 'concrecion' }, escenaDePrueba(), jugador, registroPatrones, objetosPorId
    );
    const desdeAtacar = generarOpcionesNivel2(verbo('Atacar'), escenaDePrueba(), jugador, registroPatrones, objetosPorId);

    assert.equal(desdeUsar.some((o) => o.etiqueta.startsWith('Atacar')), false);
    assert.ok(desdeUsar.some((o) => o.etiqueta === 'Usar Daga'));
    assert.ok(desdeAtacar.some((o) => o.etiqueta === 'Atacar con Daga'));
  });
});

describe('generarOpcionesNivel2 — caso desglosado de la sección 5', () => {
  const escena = escenaDePrueba({ salidas: [], coberturaDisponible: ['detrás de un barril'] });
  const daga = objetoDePrueba({ id: 'objeto_daga', nombre: 'Daga', utilizableComo: ['atacar'] });
  const jugador = jugadorDePrueba({ inventario: [{ objetoId: 'objeto_daga', cantidad: 1 }] });
  const objetosPorId = construirObjetosPorId([daga]);

  test('Huir: sin salidas → 3 opciones, las 3 primeras del pool desesperado en orden', () => {
    const opciones = generarOpcionesNivel2(verbo('Huir'), escena, jugador, registroPatrones, objetosPorId);
    assert.deepEqual(opciones.map((o) => o.etiqueta), [
      'Forzar una salida improvisada',
      'Saltar por una abertura riesgosa',
      'Retroceder a ciegas hacia la oscuridad',
    ]);
  });

  test('Atacar: daga utilizable + opción fija = 2 opciones (válido, no fuerza mínimo de 3)', () => {
    const opciones = generarOpcionesNivel2(verbo('Atacar'), escena, jugador, registroPatrones, objetosPorId);
    assert.equal(opciones.length, 2);
    assert.ok(opciones.some((o) => o.etiqueta === 'Atacar con Daga'));
    assert.ok(opciones.some((o) => o.etiqueta === 'Atacar a mano limpia'));
  });

  test('Emboscar: 1 cobertura real + 2 desesperadas (primeras del pool en orden) = 3 total', () => {
    // Nota: la sección 5 del documento lista como desesperadas "Improvisar
    // protección..." y "Ocultarse a la vista..." (pool[1] y pool[2]), pero
    // la sección 4.3 lista el pool con "Intentar una emboscada sin
    // cobertura real" primero. Tomar los primeros N en orden (mismo
    // criterio que el caso "Huir", que sí coincide con la sección 5) es
    // más consistente y determinístico — se documenta esta discrepancia
    // del propio documento en vez de resolverla en silencio.
    const opciones = generarOpcionesNivel2(verbo('Emboscar'), escena, jugador, registroPatrones, objetosPorId);
    assert.equal(opciones.length, 3);
    assert.ok(opciones.some((o) => o.etiqueta === 'Emboscar desde detrás de un barril' && !o.riesgosa));
    assert.ok(opciones.some((o) => o.etiqueta === 'Intentar una emboscada sin cobertura real'));
    assert.ok(opciones.some((o) => o.etiqueta === 'Improvisar protección con lo que haya alrededor'));
  });
});
