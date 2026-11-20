// Guías de experto: cómo razonar con los datos de Fénix para responder preguntas de restauración tras un incendio.
// Se ofrecen como prompts MCP (clientes que los admiten) y como la herramienta guia_experta (ChatGPT y otros).
// Contenido: criterios del propio Fénix y de las fuentes citadas en su pestaña Fuentes; nada de recetas inventadas.

export const TEMAS = {
  plan_repoblacion: 'Plan de repoblación o restauración para un municipio o zona quemada',
  informe_ayuntamiento: 'Informe breve para un ayuntamiento sobre su término municipal quemado',
  evaluar_punto: 'Evaluar una parcela o unas coordenadas concretas',
  reincendio: 'Zonas que han vuelto a arder antes de 15 años (sobre todo, pinar que no se regenera)',
  que_plantar: 'Qué especies plantar o sembrar y cómo, según el terreno',
};

// bloques comunes ----------------------------------------------------------------------------------------------
const EDAD = (ctx) => {
  if (!ctx) {
    return '1. Averigua cuánto tiempo ha pasado desde el incendio (resumen_incendio da las fechas; zonas_prioritarias indica el criterio que aplica).';
  }
  const reciente = ctx.meses < 12;
  const t = ctx.meses === 1 ? '1 mes' : `unos ${ctx.meses} meses`;
  const desfase = (ctx.modo === 'erosion') === reciente ? '' : ` Ojo: las zonas prioritarias de Fénix se calcularon con su última imagen (${ctx.fechas.ultima_imagen}) `
    + `con el criterio de ${ctx.modo === 'erosion' ? 'erosión (entonces era un incendio reciente)' : 'regeneración'}; hoy la situación puede haber cambiado: compruébalo en campo.`;
  return `1. Tiempo desde el incendio: ${ctx.nombre}; han pasado ${t} desde la imagen "después" (${ctx.fechas.despues}) hasta hoy (${ctx.hoy}); `
    + `la última imagen de satélite de Fénix es del ${ctx.fechas.ultima_imagen}. ${reciente
      ? 'Es un incendio RECIENTE (menos de un año): lo urgente es proteger el suelo; no se recomienda plantar de forma generalizada hasta ver qué rebrota en la primera primavera (salvo en el pinar reincendiado en poco tiempo).'
      : `Ha pasado MÁS DE UN AÑO: ya se puede ver dónde la regeneración no basta (cobertura por debajo del 30 %, criterio de la Fundación CEAM${ctx.fuera_ceam ? ', valenciano: aquí se usa como referencia' : ''}) y decidir siembras o plantaciones.`}${desfase}`;
};

const CRITERIOS = `Criterios (Fénix y fuentes de su pestaña Fuentes):
- Menos de un año: primero el suelo en laderas con severidad alta (fajinas o barreras de troncos quemados en curvas de nivel, albarradas en barrancos, acolchado de paja en lo más desnudo), sobre todo aguas arriba de pueblos y carreteras. Esperar a la primera primavera para ver el rebrote; la Fundación CEAM evalúa a 1–2 años.
- Un año o más: cobertura por debajo del 30 % (protocolo de la Fundación CEAM, pensado para la Comunitat Valenciana; fuera de ella, como referencia) con erosión alta → siembra o plantación en núcleos; por encima del 60 % → regeneración natural con seguimiento.
- Reincendio en menos de 15 años: el pino carrasco (P. halepensis) necesita años para acumular piñas serótinas; si vuelve a arder antes apenas se regenera ("riesgo de inmadurez", Keeley et al. 1999; en Cataluña, los pinares quemados dos veces en 16 años tenían un banco de semillas en copa un 80 % menor, Espelta et al. 2008). La serotinia del pino rodeno o resinero (P. pinaster) varía mucho según la población. Ese pinar no vuelve solo; las frondosas y el matorral que rebrotan, sí. En el pinar reincendiado, actuar cuanto antes.
- Pino laricio y silvestre (P. nigra, P. sylvestris) y pino piñonero no tienen piñas serótinas: tras un fuego de copas apenas se regeneran por semilla salvo cerca de bordes o rodales con árboles vivos (Retana et al. 2002; Ordóñez et al. 2005). Plantarlos en núcleos con planta de procedencia adecuada si se quieren recuperar.
- Alcornoque, carrasca y quejigo rebrotan: proteger los rebrotes, no cortar árboles que parezcan muertos hasta ver la primavera y, en el alcornoque, no descorchar durante varios años (hasta que recupere la copa), según la normativa autonómica de descorche.
- Especies: usa siempre las de la serie de Rivas-Martínez de cada punto (las dan consultar_punto y zonas_prioritarias); no las deduzcas solo del sustrato. La carrasca o encina vive tanto en caliza como en suelos silíceos; el alcornoque, solo donde lo indica su serie (silicícola y templada, no en las sierras altas). Mejor un mosaico de frondosas, matorral y claros que un pinar continuo.`;

const COMO = `Cómo plantar o sembrar:
- Núcleos de 20–50 plantas en los mejores micrositios, a mano en pendientes fuertes; junto a matas que den sombra (lado norte), cuando el rebrote ya tenga tamaño suficiente: los arbustos «nodriza» mejoran la supervivencia de las plantas (Castro et al. 2002; Gómez-Aparicio et al. 2004), sobre todo en solanas secas.
- Protección contra herbívoros (tubos, mallas) y contra jabalíes, ratones y arrendajos en las siembras.
- Bellotas maduras (noviembre–diciembre) de muchos árboles sanos de la zona (decenas, separados entre sí, para conservar la diversidad genética); tirar las que flotan; no dejarlas secar; 3–5 por hoyo a unos 5 cm; sembrar con las lluvias de otoño-invierno.
- Planta o semilla certificada de la región de procedencia adecuada (Real Decreto 289/2003, de materiales forestales de reproducción): en la Comunitat Valenciana, Banc de Llavors Forestals de la Generalitat; en otras comunidades, su servicio forestal.`;

const PERMISOS = `Permisos: propietario (en monte público, ayuntamiento o administración titular), administración forestal autonómica y, en espacios protegidos, su dirección. Fénix es divulgativo y no oficial (Joaquín García Nieto): recomienda siempre visita de campo y cita el enlace al mapa.`;

const cab = (titulo, ctx, municipio) => `GUÍA DE EXPERTO FÉNIX · ${titulo}${ctx ? ` · ${ctx.nombre}` : ''}${municipio ? ` · municipio: ${municipio}` : ''}
Sigue estos pasos con las herramientas de Fénix y responde en español, con cifras y enlaces, sin inventar datos que las herramientas no den.`;

const inc = (ctx) => (ctx ? `"${ctx.slug}"` : 'el incendio');
const mun = (m) => (m ? `"${m}"` : 'el municipio');

// guías ---------------------------------------------------------------------------------------------------------
export function guia(tema, ctx = null, municipio = null) {
  const m = municipio;
  const reb = ctx && ctx.reincendio_ha >= 1 ? ` En este incendio hay ${Math.round(ctx.reincendio_ha)} ha forestales que ya habían ardido hace menos de 15 años.` : '';
  switch (tema) {
    case 'plan_repoblacion':
      return `${cab(TEMAS[tema], ctx, m)}

${EDAD(ctx)}${reb}
2. resumen_incendio(${inc(ctx)}): contexto general, municipios y fechas.
3. zonas_prioritarias(${inc(ctx)}${m ? `, municipio=${mun(m)}` : ''}): las zonas más urgentes con coordenadas, monte, qué había, serie potencial con especies y avisos. Mira también el bloque de reincendio.
4. consultar_superficies(${inc(ctx)}, filtros={${m ? `municipio:[${mun(m)}]` : ''}}, agrupar_por=["actuacion","propiedad"]) y, si interesa, agrupar_por=["serie_potencial","sustrato"]: cuántas hectáreas de cada caso y cuántas son monte público.
5. consultar_punto en el centro de las 2–3 zonas principales para confirmar suelo, pendiente y especies.
6. plan_restauracion(${inc(ctx)}): textos de cómo actuar y calendario del plan de Fénix.

Estructura de la respuesta: (a) qué es urgente ahora y dónde; (b) qué plantar o sembrar y dónde, por series y sustrato; (c) cuándo; (d) quién debe autorizar o actuar (monte público frente a privado); (e) primeros pasos concretos.

${CRITERIOS}

${COMO}

${PERMISOS}`;
    case 'informe_ayuntamiento':
      return `${cab(TEMAS[tema], ctx, m)}

${EDAD(ctx)}${reb}
2. buscar_municipio(${mun(m)}): en qué incendios de Fénix aparece y cuántas hectáreas.
3. consultar_superficies(${inc(ctx)}, filtros={municipio:[${mun(m)}]}, agrupar_por=["severidad"]); repite con ["propiedad"], ["vegetacion_antes"] y ["actuacion"]; si hay reincendio, filtros reincendio_corto=true y forestal=true.
4. zonas_prioritarias(${inc(ctx)}, municipio=${mun(m)}): zonas urgentes, montes municipales y avisos.
5. plan_restauracion(${inc(ctx)}) para el calendario y el tipo de actuaciones.

Formato: informe de una página para un concejal, sin tecnicismos: superficie quemada y forestal; cuánto es monte público del ayuntamiento y cuánto privado; qué había y qué debería haber; las 2–3 zonas más urgentes con su monte y coordenadas; qué se recomienda hacer este año y el siguiente; a quién pedir permisos o ayuda (servicio forestal autonómico, dirección del espacio protegido si lo hay); enlace al mapa filtrado por el municipio (${ctx ? `${ctx.mapa}#municipio=` : 'URL del mapa + #municipio='}${m ? encodeURIComponent(m) : '<municipio>'}). Aclara que es un proyecto divulgativo, no oficial, y que requiere visita de campo.

${CRITERIOS}

${PERMISOS}`;
    case 'evaluar_punto':
      return `${cab(TEMAS[tema], ctx, m)}

1. consultar_punto(lat, lon) con las coordenadas que dé la persona (o el centro de su parcela): severidad, vegetación antes, propiedad y monte, sustrato, altitud y pendiente, incendios previos, serie potencial con especies, riesgo de erosión y actuación recomendada.
2. Si la persona da una dirección o referencia catastral y no coordenadas, pídele las coordenadas (por ejemplo, desde la Sede del Catastro o Google Maps); Fénix no busca por dirección.
3. ${ctx ? `Tiempo desde el incendio: ${ctx.meses === 1 ? '1 mes' : `unos ${ctx.meses} meses`} (${ctx.meses < 12 ? 'reciente: suelo primero' : 'más de un año: evaluar la regeneración'}).` : 'Mira la fecha del incendio con resumen_incendio para aplicar el criterio de tiempo.'}
4. Interpreta: si hubo incendio previo hace menos de 15 años y era pinar, el pino no volverá solo; si era alcornocal, carrascal o quejigar, protege el rebrote; si la pendiente es alta y la severidad alta, primero erosión.
5. Recomienda las especies de la serie que devuelve consultar_punto (el sustrato ayuda a elegir entre ellas) y cómo y cuándo plantar.

${CRITERIOS}

${COMO}

${PERMISOS}`;
    case 'reincendio':
      return `${cab(TEMAS[tema], ctx, m)}

${EDAD(ctx)}${reb}
2. zonas_prioritarias(${inc(ctx)}, tipo="reincendio"${m ? `, municipio=${mun(m)}` : ''}): superficie que ya había ardido hace menos de 15 años, año del incendio anterior, qué había, sustrato, serie potencial y zonas principales.
3. consultar_superficies(${inc(ctx)}, filtros={reincendio_corto:true, forestal:true${m ? `, municipio:[${mun(m)}]` : ''}}, agrupar_por=["municipio","incendio_previo"]) y con agrupar_por=["vegetacion_antes","sustrato"] (separa el pinar de lo que rebrota).
4. consultar_punto en el centro de las zonas principales.

Explica por qué es una prioridad propia (riesgo de inmadurez del pinar que solo se regenera por semilla; lo que rebrota no tiene ese problema) y qué hacer: control de erosión donde haga falta, y siembra de bellota y plantación en núcleos ya en el primer otoño-invierno, con especies rebrotadoras de la serie potencial para formar un mosaico menos inflamable; el pino, en todo caso, solo en bosquetes. Indica que la vegetación previa del Mapa Forestal describe la situación anterior al incendio anterior.

${CRITERIOS}

${COMO}

${PERMISOS}`;
    case 'que_plantar':
      return `${cab(TEMAS[tema], ctx, m)}

1. Si hay coordenadas, consultar_punto(lat, lon); si es un municipio, zonas_prioritarias(${inc(ctx)}${m ? `, municipio=${mun(m)}` : ''}) y consultar_superficies(${inc(ctx)}, filtros={${m ? `municipio:[${mun(m)}], ` : ''}forestal:true}, agrupar_por=["serie_potencial","sustrato"]).
2. Para cada serie que aparezca, usa sus especies (las da Fénix a partir del Mapa de Series de Vegetación de Rivas-Martínez y su revisión de 2011); el sustrato ayuda a interpretar la serie, pero no sustituye a sus especies (la carrasca vive en caliza y en suelos silíceos). Distingue árbol principal, acompañantes y arbustos con fruto.
3. ${ctx ? `Tiempo desde el incendio: ${ctx.meses === 1 ? '1 mes' : `unos ${ctx.meses} meses`}.` : 'Comprueba la fecha del incendio.'} En incendios de menos de un año, recomienda esperar a la primera primavera salvo en reincendios cortos.
4. Añade cómo y cuándo (núcleos, facilitación, protectores, época) y de dónde sacar semilla o planta local.

${CRITERIOS}

${COMO}

${PERMISOS}`;
    default:
      return `Temas disponibles: ${Object.entries(TEMAS).map(([k, v]) => `${k} (${v})`).join('; ')}.\n\n${PERMISOS}`;
  }
}
