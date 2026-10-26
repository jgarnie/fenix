// Textos y datos propios del incendio de Bejís (Alto Palancia, agosto 2022).
// app.js es común a todos los incendios; cada carpeta tiene su fire.js y su data/.

export const ACT_INFO = {
  1: {
    corto: 'Regeneración natural',
    que: 'La vegetación previa rebrota (carrasca, quejigo, coscoja, enebros…) o el pinar era maduro y sin incendios recientes, así que regenera por semilla.',
    como: [
      'Comprobar en campo que hay regeneración suficiente: 1.000–3.000 pies/ha, según el CEAM.',
      'Clarear el regenerado de pino donde haya nacido demasiado denso, entre 8 y 12 años después del incendio (2030–2034). Tras el incendio de Andilla de 2012 quedaron masas hiperdensas y estancadas.',
      'Proteger los rebrotes de carrasca y quejigo frente al ramoneo donde haya mucha presión de herbívoros.',
      'Seguimiento con parcelas de campo y NDVI (Sentinel-2) cada primavera.',
    ],
    coste: 17,
  },
  2: {
    corto: 'Regeneración asistida',
    que: 'Pinar quemado con daño alto o pinar joven, nacido tras un incendio reciente, que probablemente no tenía piñas suficientes para regenerar; o carrascal y matorral donde, dos años después, la cobertura vegetal sigue por debajo del 30 % (criterio CEAM). Se refuerza con siembras y núcleos de plantación.',
    como: [
      'Comprobar en campo dónde no ha nacido pino ni rebrotado nada (capa Criterio CEAM, por debajo del 30 %).',
      'Siembra de bellotas de carrasca o quejigo por puntos, protegidas.',
      'Plantación en bosquetes / núcleos de dispersión (400–600 plantas/ha) con protector, en otoño-invierno.',
      'Clareos del regenerado de pino a los 8–12 años para evitar masas densas muy inflamables.',
    ],
    coste: 3125,
  },
  3: {
    corto: 'Restauración activa',
    que: 'La zona ha ardido varias veces (muchas, en Andilla 2012 y en Bejís 2022) y el matorral ya no evoluciona solo, o el fuego fue muy intenso en terreno que ya había ardido. Hay que reintroducir las especies de la vegetación potencial.',
    como: [
      'Plantación de 800–1.100 plantas/ha de las especies de la serie potencial (ver pestaña Cómo).',
      'Planta de la región de procedencia local (Banc de Llavors Forestals de la GVA).',
      'Hoyos manuales en pendiente, protectores, riego de apoyo el primer verano y reposición de marras.',
      'Priorizar donde, cuatro años después, la cobertura sigue por debajo del 30 %.',
    ],
    coste: 6963,
  },
  4: {
    corto: 'Recuperar cultivo / mosaico',
    que: 'Terreno agrícola (almendros, olivos, cereal y frutales de secano, muchos abandonados) dentro del perímetro.',
    como: [
      'Recuperar cultivos de secano como discontinuidades cortafuegos (mosaico agroforestal).',
      'Ayudas a explotaciones afectadas (Generalitat / PAC) y pastoreo controlado en fajas.',
    ],
    coste: 0,
  },
  5: { corto: 'Sin actuación', que: 'No quemado o afectado levemente.', como: [], coste: 0 },
};

export const EMERG = {
  corto: 'Control de la erosión',
  que: 'Severidad alta en pendiente. Las obras de emergencia (fajinas, apeo de árboles) se hicieron en 2022–2023. Cuatro años después, conviene revisar las cárcavas y barrancos donde el suelo sigue desnudo.',
  como: [
    'Revisar y reponer fajinas en las laderas donde la vegetación aún no cubre el suelo.',
    'Albarradas o diques de mampostería en cárcavas y cabeceras de barranco.',
    'Evitar maquinaria pesada en pendientes fuertes.',
  ],
  coste: 2204,
};

export const FIRE = {
  dataDir: 'bejis', // carpeta en el repo fenix-data
  ems: 'EMSR625',
  emsUrl: 'https://mapping.emergency.copernicus.eu/activations/EMSR625',
  park: null,
  firesFrom: 1993,
  ifnProv: 'Castellón y Valencia',
  // imágenes Sentinel-2 del comparador (clave de escena → etiqueta); las fechas salen de meta.json
  images: [['abril', 'Primavera'], ['antes', 'Antes'], ['despues', 'Después'], ['y2023', '1 año'], ['y2024', '2 años'], ['y2025', '3 años'], ['ahora', 'Ahora']],
  swir: ['antes', 'despues', 'y2024', 'ahora'],
  pnoa: 'Ortofoto PNOA (vuelo más reciente)',
  // vuelos PNOA históricos que cubren la zona (al acercar mucho sustituyen a Sentinel-2)
  ortos: [{ year: 2021, label: 'antes del incendio', pre: true }, { year: 2024, label: 'dos años después', pre: false }],
  presets: [['antes|despues', 'Antes vs después'], ['despues|ahora', 'Después vs ahora'], ['antes|ahora', 'Antes vs ahora'], ['despues_swir|ahora_swir', 'Rebrote (falso color)'], ['orto2021|orto2024', 'Ortofotos 2021 vs 2024']],
  official: { value: '16.824 ha', label: 'superficie oficial (estadística de incendios de la Generalitat), de ellas 11.644 no arboladas' },
  ceamRef: null,
  potential: '<b>carrascal</b>: mesomediterráneo en las zonas bajas y, en las altas, supramediterráneo con sabina albar',
  calloutExtra: (S, ha) => `<br><br>Más de la mitad (${ha(S.recurrent_ha)}) ya había ardido antes, sobre todo en el incendio de Andilla de 2012.
    Allí el pinar tenía unos diez años y apenas había dado piñas, por eso buena parte necesita ayuda para regenerar.`,
  munNota: 'Superficie vista quemada por satélite (Copernicus); el reparto oficial por municipio puede ser distinto.',
  arbolesNota: 'sobre todo pinos; carrascas y quejigos rebrotan',
  metodoActuacion: 'rebrotadoras → regeneración natural, salvo donde dos años después (julio de 2024) la cobertura sigue por debajo del 30 % (criterio CEAM) → asistida; pinar maduro poco dañado y sin incendios desde 2007 → natural; resto de pinar → asistida; matorral que ha ardido dos o más veces, o severidad alta en zonas que ya habían ardido dos o más veces → restauración activa. La regla de Espadà para el pinar quemado donde la serie potencial es el alcornocal no se aplica: en Bejís el mapa oficial no tiene alcornocal.',
  plan: {
    budget: 1835439,
    when: { emerg: 'revisión 2026–2027', 1: '2026 – 2034', 2: '2026 – 2029', 3: '2026 – 2030', 4: '2026 –' },
    ref: 'Referencia: la Generalitat presupuestó 1,3 M€ en 2024 para la regeneración ambiental de la zona, más 535.439 € de la subasta de la madera quemada (Valencia Plaza, diciembre de 2023). Las obras de emergencia de 2022–2023 se pagaron aparte.',
  },
  ceamNow: (S, ha) => {
    const c = Object.values(S.ceam);
    const tot = c.reduce((a, x) => a + x.total, 0);
    return `Aquí sí es el momento: la imagen es de dos años después del incendio. Aun así, en el ${Math.round((c[0].total / tot) * 100)} % del área
    forestal quemada (${ha(c[0].total)}) la cobertura sigue por debajo del 30 %. Es una aproximación en los dos sentidos: el NDVI de pleno verano
    se queda corto con el matorral bajo (coscoja, romero) y, a la vez, cuenta la hierba como si fuera leñosa. Conviene confirmarlo en campo antes de plantar.`;
  },
  timeline: `
      <div><b>15 ago – 13 sep 2022 · Incendio</b>Empieza el 15 de agosto en Bejís (la estadística de la Generalitat lo atribuye a un rayo) y obliga a desalojar a más de 1.500 vecinos de Bejís, El Toro, Teresa, Sacañet y Torás. Se da por extinguido el 13 de septiembre, con 16.824 ha.</div>
      <div><b>Oct 2022 – 2023 · Emergencia</b>Apeo de árboles junto a caminos y pistas, fajinas contra la erosión y retirada de la madera quemada donde era viable (subasta: 535.439 €).</div>
      <div><b>2024 · Regeneración ambiental</b>1,3 M€: desbroce del matorral sobrante, mejora de pistas, mampostería contra la erosión, balsas y bebederos para fauna y cajas nido.</div>
      <div><b>2024 – 2025 · Evaluación</b>Uno o dos años después del incendio, el momento en que el CEAM propone decidir dónde reforzar la regeneración (capa Criterio CEAM).</div>
      <div><b>2026 – 2029 · Refuerzo</b>Siembras y plantaciones con planta local donde, cuatro años después, la regeneración sigue sin bastar.</div>
      <div><b>2030 – 2034 · Clareos</b>Aclarar el regenerado de pino donde haya salido muy denso, para no repetir las masas estancadas e inflamables que dejó el incendio de Andilla de 2012.</div>
      <div><b>2035 – 2060 · Consolidación</b>Mosaico de pinar, carrascal y cultivos menos inflamable; entrada progresiva de frondosas.</div>`,
  ayuda: 'Apoyar a las asociaciones de custodia del territorio y la recuperación de cultivos de secano en el Alto Palancia.',
  fuentesDatos: () => `
    <li><b>Área quemada:</b> <a href="https://mapping.emergency.copernicus.eu/activations/EMSR625" target="_blank" rel="noopener">Copernicus EMS Rapid Mapping EMSR625</a>, producto de evaluación (GRA, AOI01 Bejís, 20 ago 2022).</li>`,
  fuentesOficial: `<li><b>Superficie oficial, fechas y causa:</b> estadística de incendios forestales de la Generalitat (capa de incendios de 2022 del ICV, parte 2022CS0060).</li>
    <li><b>Actuaciones e inversiones:</b> Generalitat Valenciana, según
    <a href="https://valenciaplaza.com/valenciaplaza/generalitat-destina-1-3-millones-a-regenerar-zona-afectada-incendio-bejis" target="_blank" rel="noopener">Valencia Plaza (dic. 2023)</a> y
    <a href="https://valenciaplaza.com/valenciaplaza/arrancalarestauracionambientalenbejismejoradelsueloyrecuperaciondefaunayflora" target="_blank" rel="noopener">Valencia Plaza (nov. 2022)</a>.
    Antecedentes del incendio de Andilla de 2012: <a href="https://mediambient.gva.es/documents/20551003/171599438/RESUMEN_PROYECTO.pdf/f48e19e3-a82f-42ec-a24b-bc12510deb9c" target="_blank" rel="noopener">resumen del proyecto de restauración</a> (GVA).</li>`,
  fuentesCeam: `
  <h2>Criterio del CEAM</h2>
  <ul>
    <li>Umbrales y plazos del manual <i>Postfire-DSS</i> de la Fundación CEAM, según El Periòdic (los publicó a raíz del incendio de Espadà de 2026). El CEAM no ha publicado una evaluación del incendio de Bejís: la capa es una aproximación propia con datos abiertos.</li>
  </ul>`,
  officialLimit: 'la estadística oficial de la Generalitat da 16.824 ha (en prensa se llegó a hablar de casi 20.000). Las diferencias vienen de cómo se traza el perímetro y de qué se cuenta como quemado',
  otherFire: { href: '../', label: "Incendio de Espadà (2026)" },
};
