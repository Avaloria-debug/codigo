/**
 * Fase 0 — Validación estructural.
 * Verifica forma, tipos y las reglas condicionales documentadas en el
 * documento técnico de Fase 0 (sección 3). No verifica referencias
 * entre entidades — eso es responsabilidad de validarReferencias.js
 * (separación de niveles, sección 2, principio 5).
 *
 * Validación estricta: cada entidad rechaza campos de nivel superior
 * que no estén documentados. Los objetos abiertos por diseño
 * (atributos, flags, metadata) NO tienen restricción de claves por
 * dentro — eso es justamente lo que los hace "abiertos".
 *
 * Nota sobre un caso asimétrico: el documento marca explícitamente
 * como error "Conocimiento con nivelAcceso=requiereEvento pero
 * eventoDisparadorId=null" (sección 3.2, casos límite). No hace la
 * afirmación simétrica para "requiereRelacion sin umbralRelacion" en
 * ningún lugar del texto — ahí sólo describe qué significa el campo,
 * no lo marca como regla de error. Esta implementación NO inventa esa
 * regla simétrica para no sobre-diseñar; si se quiere, es un cambio de
 * una línea acá cuando se decida a propósito.
 */

function esString(v) {
  return typeof v === 'string';
}
function esNumber(v) {
  return typeof v === 'number' && !Number.isNaN(v);
}
function esBoolean(v) {
  return typeof v === 'boolean';
}
function esArray(v) {
  return Array.isArray(v);
}
function esObjetoPlano(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function campoFaltante(objeto, campo) {
  return objeto[campo] === undefined;
}

function camposDesconocidos(objeto, permitidos) {
  return Object.keys(objeto).filter((clave) => !permitidos.includes(clave));
}

function idDe(objeto) {
  return esString(objeto?.id) ? objeto.id : '(sin id)';
}

function agregarCamposDesconocidos(errores, prefijo, objeto, permitidos) {
  camposDesconocidos(objeto, permitidos).forEach((c) =>
    errores.push(`${prefijo} campo desconocido '${c}' no está documentado para este esquema.`)
  );
}

// ---------------------------------------------------------------
// Relación y Conocimiento (embebidos en NPC)
// ---------------------------------------------------------------

function validarRelacionEstructura(relacion, prefijoNPC) {
  const errores = [];
  const prefijo = `${prefijoNPC} 'relacion'`;
  const permitidos = ['valor', 'historialRelevante'];

  if (!esObjetoPlano(relacion)) {
    errores.push(`${prefijo} debe ser un objeto.`);
    return errores;
  }

  agregarCamposDesconocidos(errores, prefijo, relacion, permitidos);

  if (campoFaltante(relacion, 'valor') || !esNumber(relacion.valor)) {
    errores.push(`${prefijo}.valor es obligatorio y debe ser number.`);
  }

  if (campoFaltante(relacion, 'historialRelevante') || !esArray(relacion.historialRelevante)) {
    errores.push(`${prefijo}.historialRelevante es obligatorio y debe ser array.`);
  } else {
    relacion.historialRelevante.forEach((entrada, i) => {
      if (
        !esObjetoPlano(entrada) ||
        !esString(entrada.eventoId) ||
        !esNumber(entrada.delta) ||
        !esString(entrada.momento)
      ) {
        errores.push(
          `${prefijo}.historialRelevante[${i}] debe tener { eventoId: string, delta: number, momento: string }.`
        );
      }
    });
  }

  return errores;
}

function validarConocimientoEstructura(conocimiento, i, prefijoNPC) {
  const errores = [];
  const prefijo = `${prefijoNPC} 'conocimientos[${i}]'`;
  const permitidos = ['id', 'contenido', 'nivelAcceso', 'umbralRelacion', 'eventoDisparadorId'];

  if (!esObjetoPlano(conocimiento)) {
    errores.push(`${prefijo} debe ser un objeto.`);
    return errores;
  }

  agregarCamposDesconocidos(errores, prefijo, conocimiento, permitidos);

  if (campoFaltante(conocimiento, 'id') || !esString(conocimiento.id)) {
    errores.push(`${prefijo}.id es obligatorio y debe ser string.`);
  }
  if (campoFaltante(conocimiento, 'contenido') || !esString(conocimiento.contenido)) {
    errores.push(`${prefijo}.contenido es obligatorio y debe ser string.`);
  }

  const nivelesValidos = ['publico', 'requiereRelacion', 'requiereEvento'];
  if (campoFaltante(conocimiento, 'nivelAcceso') || !nivelesValidos.includes(conocimiento.nivelAcceso)) {
    errores.push(`${prefijo}.nivelAcceso es obligatorio y debe ser uno de: ${nivelesValidos.join(', ')}.`);
  }

  if (campoFaltante(conocimiento, 'umbralRelacion') || !(conocimiento.umbralRelacion === null || esNumber(conocimiento.umbralRelacion))) {
    errores.push(`${prefijo}.umbralRelacion es obligatorio y debe ser number o null.`);
  }

  if (campoFaltante(conocimiento, 'eventoDisparadorId') || !(conocimiento.eventoDisparadorId === null || esString(conocimiento.eventoDisparadorId))) {
    errores.push(`${prefijo}.eventoDisparadorId es obligatorio y debe ser string o null.`);
  }

  // Regla dura explícita (sección 3.2, casos límite): requiereEvento sin eventoDisparadorId es error.
  if (conocimiento.nivelAcceso === 'requiereEvento' && !esString(conocimiento.eventoDisparadorId)) {
    errores.push(`${prefijo} tiene nivelAcceso='requiereEvento' pero eventoDisparadorId no está seteado (no puede ser null).`);
  }

  return errores;
}

// ---------------------------------------------------------------
// Validadores por entidad de nivel superior
// ---------------------------------------------------------------

function validarJugadorEstructura(objeto) {
  const errores = [];
  const prefijo = `[Jugador ${idDe(objeto)}]`;
  const permitidos = ['id', 'nombre', 'ubicacionActual', 'inventario', 'atributos', 'flags'];

  agregarCamposDesconocidos(errores, prefijo, objeto, permitidos);

  if (campoFaltante(objeto, 'id') || !esString(objeto.id)) {
    errores.push(`${prefijo} 'id' es obligatorio y debe ser string.`);
  }
  if (campoFaltante(objeto, 'nombre') || !esString(objeto.nombre)) {
    errores.push(`${prefijo} 'nombre' es obligatorio y debe ser string.`);
  }
  if (campoFaltante(objeto, 'ubicacionActual') || !esString(objeto.ubicacionActual)) {
    errores.push(`${prefijo} 'ubicacionActual' es obligatorio y debe ser string (ID de Escena, no nullable).`);
  }

  if (campoFaltante(objeto, 'inventario') || !esArray(objeto.inventario)) {
    errores.push(`${prefijo} 'inventario' es obligatorio y debe ser array (puede ser vacío).`);
  } else {
    objeto.inventario.forEach((item, i) => {
      if (!esObjetoPlano(item) || !esString(item.objetoId) || !esNumber(item.cantidad)) {
        errores.push(`${prefijo} 'inventario[${i}]' debe tener { objetoId: string, cantidad: number }.`);
      }
    });
  }

  if (campoFaltante(objeto, 'atributos') || !esObjetoPlano(objeto.atributos)) {
    errores.push(`${prefijo} 'atributos' es obligatorio y debe ser objeto (puede ser vacío).`);
  } else {
    Object.entries(objeto.atributos).forEach(([clave, valor]) => {
      if (!esNumber(valor)) errores.push(`${prefijo} 'atributos.${clave}' debe ser number.`);
    });
  }

  if (campoFaltante(objeto, 'flags') || !esObjetoPlano(objeto.flags)) {
    errores.push(`${prefijo} 'flags' es obligatorio y debe ser objeto (puede ser vacío).`);
  } else {
    Object.entries(objeto.flags).forEach(([clave, valor]) => {
      if (!esBoolean(valor) && !esNumber(valor) && !esString(valor)) {
        errores.push(`${prefijo} 'flags.${clave}' debe ser boolean, number o string.`);
      }
    });
  }

  return errores;
}

function validarNPCEstructura(objeto) {
  const errores = [];
  const prefijo = `[NPC ${idDe(objeto)}]`;
  const permitidos = [
    'id',
    'nombre',
    'arquetipo',
    'personalidadBase',
    'estadoEmocional',
    'relacion',
    'ubicacionActual',
    'conocimientos',
    'activo',
  ];

  agregarCamposDesconocidos(errores, prefijo, objeto, permitidos);

  if (campoFaltante(objeto, 'id') || !esString(objeto.id)) errores.push(`${prefijo} 'id' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'nombre') || !esString(objeto.nombre)) errores.push(`${prefijo} 'nombre' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'arquetipo') || !esString(objeto.arquetipo)) errores.push(`${prefijo} 'arquetipo' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'personalidadBase') || !esString(objeto.personalidadBase)) errores.push(`${prefijo} 'personalidadBase' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'estadoEmocional') || !esString(objeto.estadoEmocional)) errores.push(`${prefijo} 'estadoEmocional' es obligatorio y debe ser string (cualquier string es válido hasta Fase 4).`);

  if (campoFaltante(objeto, 'relacion')) {
    errores.push(`${prefijo} 'relacion' es obligatorio.`);
  } else {
    errores.push(...validarRelacionEstructura(objeto.relacion, prefijo));
  }

  if (campoFaltante(objeto, 'ubicacionActual') || !(objeto.ubicacionActual === null || esString(objeto.ubicacionActual))) {
    errores.push(`${prefijo} 'ubicacionActual' es obligatorio y debe ser string o null.`);
  }

  if (campoFaltante(objeto, 'conocimientos') || !esArray(objeto.conocimientos)) {
    errores.push(`${prefijo} 'conocimientos' es obligatorio y debe ser array (puede ser vacío).`);
  } else {
    objeto.conocimientos.forEach((c, i) => {
      errores.push(...validarConocimientoEstructura(c, i, prefijo));
    });
  }

  if (campoFaltante(objeto, 'activo') || !esBoolean(objeto.activo)) {
    errores.push(`${prefijo} 'activo' es obligatorio y debe ser boolean.`);
  }

  return errores;
}

function validarEscenaEstructura(objeto) {
  const errores = [];
  const prefijo = `[Escena ${idDe(objeto)}]`;
  const permitidos = [
    'id',
    'nombre',
    'descripcionBase',
    'salidas',
    'objetosPresentes',
    'npcsPresentes',
    'eventosActivos',
    'estadoCalculado',
    'coberturaDisponible',
  ];

  agregarCamposDesconocidos(errores, prefijo, objeto, permitidos);

  if (campoFaltante(objeto, 'id') || !esString(objeto.id)) errores.push(`${prefijo} 'id' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'nombre') || !esString(objeto.nombre)) errores.push(`${prefijo} 'nombre' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'descripcionBase') || !esString(objeto.descripcionBase)) errores.push(`${prefijo} 'descripcionBase' es obligatorio y debe ser string.`);

  if (campoFaltante(objeto, 'salidas') || !esArray(objeto.salidas)) {
    errores.push(`${prefijo} 'salidas' es obligatorio y debe ser array (puede ser vacío).`);
  } else {
    objeto.salidas.forEach((s, i) => {
      if (!esObjetoPlano(s) || !esString(s.etiqueta) || !esString(s.escenaDestinoId)) {
        errores.push(`${prefijo} 'salidas[${i}]' debe tener { etiqueta: string, escenaDestinoId: string }.`);
      }
    });
  }

  const listasDeStrings = ['objetosPresentes', 'npcsPresentes', 'eventosActivos', 'coberturaDisponible'];
  listasDeStrings.forEach((campo) => {
    if (campoFaltante(objeto, campo) || !esArray(objeto[campo])) {
      errores.push(`${prefijo} '${campo}' es obligatorio y debe ser array (puede ser vacío).`);
    } else {
      objeto[campo].forEach((v, i) => {
        if (!esString(v)) errores.push(`${prefijo} '${campo}[${i}]' debe ser string.`);
      });
    }
  });

  if (campoFaltante(objeto, 'estadoCalculado') || !(objeto.estadoCalculado === null || esString(objeto.estadoCalculado))) {
    errores.push(`${prefijo} 'estadoCalculado' es obligatorio y debe ser string o null (null hasta Fase 2).`);
  }

  return errores;
}

function validarEventoEstructura(objeto) {
  const errores = [];
  const prefijo = `[Evento ${idDe(objeto)}]`;
  const permitidos = ['id', 'tipo', 'escenaId', 'duracion', 'condicionExpiracion', 'activo', 'metadata'];

  agregarCamposDesconocidos(errores, prefijo, objeto, permitidos);

  if (campoFaltante(objeto, 'id') || !esString(objeto.id)) errores.push(`${prefijo} 'id' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'tipo') || !esString(objeto.tipo)) errores.push(`${prefijo} 'tipo' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'escenaId') || !esString(objeto.escenaId)) errores.push(`${prefijo} 'escenaId' es obligatorio y debe ser string.`);

  const duracionOk = !campoFaltante(objeto, 'duracion') && (objeto.duracion === null || esNumber(objeto.duracion));
  if (!duracionOk) errores.push(`${prefijo} 'duracion' es obligatorio y debe ser number o null.`);

  const condicionOk = !campoFaltante(objeto, 'condicionExpiracion') && (objeto.condicionExpiracion === null || esString(objeto.condicionExpiracion));
  if (!condicionOk) errores.push(`${prefijo} 'condicionExpiracion' es obligatorio y debe ser string o null.`);

  // Regla dura (sección 3.5): no pueden ser ambos null a la vez.
  if (duracionOk && condicionOk && objeto.duracion === null && objeto.condicionExpiracion === null) {
    errores.push(`${prefijo} 'duracion' y 'condicionExpiracion' no pueden ser ambos null — el evento nunca terminaría.`);
  }

  if (campoFaltante(objeto, 'activo') || !esBoolean(objeto.activo)) errores.push(`${prefijo} 'activo' es obligatorio y debe ser boolean.`);
  if (campoFaltante(objeto, 'metadata') || !esObjetoPlano(objeto.metadata)) errores.push(`${prefijo} 'metadata' es obligatorio y debe ser objeto (puede ser vacío).`);

  return errores;
}

function validarSucesoEstructura(objeto) {
  const errores = [];
  const prefijo = `[Suceso ${idDe(objeto)}]`;
  const permitidos = [
    'id',
    'tipo',
    'alcance',
    'escenaId',
    'progreso',
    'velocidadProgreso',
    'condicionResolucion',
    'eventoGeneradoAlResolver',
    'activo',
  ];

  agregarCamposDesconocidos(errores, prefijo, objeto, permitidos);

  if (campoFaltante(objeto, 'id') || !esString(objeto.id)) errores.push(`${prefijo} 'id' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'tipo') || !esString(objeto.tipo)) errores.push(`${prefijo} 'tipo' es obligatorio y debe ser string.`);

  const alcancesValidos = ['escena', 'global'];
  const alcanceOk = !campoFaltante(objeto, 'alcance') && alcancesValidos.includes(objeto.alcance);
  if (!alcanceOk) errores.push(`${prefijo} 'alcance' es obligatorio y debe ser uno de: ${alcancesValidos.join(', ')}.`);

  const escenaIdOk = !campoFaltante(objeto, 'escenaId') && (objeto.escenaId === null || esString(objeto.escenaId));
  if (!escenaIdOk) errores.push(`${prefijo} 'escenaId' es obligatorio y debe ser string o null.`);

  // Regla dura (sección 3.6): obligatorio si alcance="escena", debe ser null si alcance="global".
  if (alcanceOk && escenaIdOk) {
    if (objeto.alcance === 'escena' && objeto.escenaId === null) {
      errores.push(`${prefijo} alcance='escena' pero 'escenaId' es null — es obligatorio en ese caso.`);
    }
    if (objeto.alcance === 'global' && objeto.escenaId !== null) {
      errores.push(`${prefijo} alcance='global' pero 'escenaId' no es null — ambigüedad entre alcance regional y global.`);
    }
  }

  if (campoFaltante(objeto, 'progreso') || !esNumber(objeto.progreso) || objeto.progreso < 0 || objeto.progreso > 100) {
    errores.push(`${prefijo} 'progreso' es obligatorio y debe ser number entre 0 y 100.`);
  }

  if (campoFaltante(objeto, 'velocidadProgreso') || !esNumber(objeto.velocidadProgreso)) {
    errores.push(`${prefijo} 'velocidadProgreso' es obligatorio y debe ser number.`);
  }

  if (campoFaltante(objeto, 'condicionResolucion') || !esString(objeto.condicionResolucion)) {
    errores.push(`${prefijo} 'condicionResolucion' es obligatorio y debe ser string.`);
  }

  if (campoFaltante(objeto, 'eventoGeneradoAlResolver') || !(objeto.eventoGeneradoAlResolver === null || esString(objeto.eventoGeneradoAlResolver))) {
    errores.push(`${prefijo} 'eventoGeneradoAlResolver' es obligatorio y debe ser string o null (es un TIPO de evento, no un ID).`);
  }

  if (campoFaltante(objeto, 'activo') || !esBoolean(objeto.activo)) {
    errores.push(`${prefijo} 'activo' es obligatorio y debe ser boolean.`);
  }

  return errores;
}

function validarEstadoDelMundoEstructura(objeto) {
  const errores = [];
  const prefijo = `[EstadoDelMundo]`;
  const permitidos = ['horaActual', 'diaActual', 'climaActual', 'faseLunar', 'ticksTranscurridos'];

  agregarCamposDesconocidos(errores, prefijo, objeto, permitidos);

  if (campoFaltante(objeto, 'horaActual') || !esNumber(objeto.horaActual) || objeto.horaActual < 0 || objeto.horaActual > 23) {
    errores.push(`${prefijo} 'horaActual' es obligatorio y debe ser number entre 0 y 23.`);
  }
  if (campoFaltante(objeto, 'diaActual') || !esNumber(objeto.diaActual)) {
    errores.push(`${prefijo} 'diaActual' es obligatorio y debe ser number.`);
  }
  if (campoFaltante(objeto, 'climaActual') || !esString(objeto.climaActual)) {
    errores.push(`${prefijo} 'climaActual' es obligatorio y debe ser string (lista abierta, no cerrada a nivel de esquema).`);
  }
  if (campoFaltante(objeto, 'faseLunar') || !esString(objeto.faseLunar)) {
    errores.push(`${prefijo} 'faseLunar' es obligatorio y debe ser string (lista abierta, mismo criterio que clima).`);
  }
  if (campoFaltante(objeto, 'ticksTranscurridos') || !esNumber(objeto.ticksTranscurridos)) {
    errores.push(`${prefijo} 'ticksTranscurridos' es obligatorio y debe ser number.`);
  }

  return errores;
}

// ---------------------------------------------------------------
// Objeto — Fase 0 nunca definió este esquema. Lo define Fase 3
// (documento técnico, sección 0.1) porque el sistema de opciones
// necesita saber para qué sirve cada objeto. Se integra acá por
// decisión documentada en fase_3_ADENDUM.md, sección 1: cambio
// puramente aditivo, no modifica ningún validador de los 6 tipos
// anteriores ni su comportamiento.
// ---------------------------------------------------------------

const CONFIABILIDADES_VALIDAS = ['fragil', 'estandar', 'resistente'];

function validarObjetoEstructura(objeto) {
  const errores = [];
  const prefijo = `[Objeto ${idDe(objeto)}]`;
  const permitidos = ['id', 'nombre', 'tipo', 'utilizableComo', 'confiabilidad'];

  agregarCamposDesconocidos(errores, prefijo, objeto, permitidos);

  if (campoFaltante(objeto, 'id') || !esString(objeto.id)) errores.push(`${prefijo} 'id' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'nombre') || !esString(objeto.nombre)) errores.push(`${prefijo} 'nombre' es obligatorio y debe ser string.`);
  if (campoFaltante(objeto, 'tipo') || !esString(objeto.tipo)) errores.push(`${prefijo} 'tipo' es obligatorio y debe ser string.`);

  if (campoFaltante(objeto, 'utilizableComo') || !esArray(objeto.utilizableComo)) {
    errores.push(`${prefijo} 'utilizableComo' es obligatorio y debe ser array (puede ser vacío).`);
  } else {
    objeto.utilizableComo.forEach((v, i) => {
      if (!esString(v)) errores.push(`${prefijo} 'utilizableComo[${i}]' debe ser string.`);
    });
  }

  // confiabilidad (Fase 5, aditivo — ver Fase 0 doc técnico sección 3.8
  // y fase_5_ADENDUM.md sección 1): OPCIONAL a nivel de validación
  // estructural. Si está ausente, el default "estandar" lo aplica quien
  // consume el campo (Fase 5), no esta función — así los 3 objetos del
  // fixture original (Fase 3), que no la traen, siguen siendo válidos
  // sin tocarlos. Si está presente, tiene que ser uno de los 3 valores
  // cerrados.
  if (!campoFaltante(objeto, 'confiabilidad') && !CONFIABILIDADES_VALIDAS.includes(objeto.confiabilidad)) {
    errores.push(`${prefijo} 'confiabilidad', si está presente, debe ser una de: ${CONFIABILIDADES_VALIDAS.join(', ')}.`);
  }

  return errores;
}

const VALIDADORES_ESTRUCTURA = {
  Jugador: validarJugadorEstructura,
  NPC: validarNPCEstructura,
  Escena: validarEscenaEstructura,
  Evento: validarEventoEstructura,
  Suceso: validarSucesoEstructura,
  EstadoDelMundo: validarEstadoDelMundoEstructura,
  Objeto: validarObjetoEstructura,
};

/**
 * @param {"Jugador"|"NPC"|"Escena"|"Evento"|"Suceso"|"EstadoDelMundo"|"Objeto"} tipo
 * @param {object} objeto
 * @returns {{ valido: boolean, errores: string[] }}
 */
export function validarEstructura(tipo, objeto) {
  const validador = VALIDADORES_ESTRUCTURA[tipo];
  if (!validador) {
    return { valido: false, errores: [`Tipo desconocido para validarEstructura: '${tipo}'.`] };
  }
  if (!esObjetoPlano(objeto)) {
    return { valido: false, errores: [`[${tipo}] el valor recibido no es un objeto.`] };
  }
  const errores = validador(objeto);
  return { valido: errores.length === 0, errores };
}
