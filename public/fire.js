// Textos y datos propios del incendio de la Vall d'Uixó / Serra d'Espadà (julio 2026).
// app.js es común a todos los incendios; cada carpeta tiene su fire.js y su data/.

export const ACT_INFO = {
  1: {
    corto: 'Regeneración natural',
    que: 'La vegetación previa rebrota (alcornoque, carrasca, coscoja, lentisco, madroño, palmito…) o el pinar era maduro y sin incendios recientes, por lo que regenera por semilla.',
    como: [
      'No cortar ni desbrozar los rebrotes; no descorchar alcornoques en al menos 5 años.',
      'Esperar a la brotación de la primavera de 2027 antes de declarar muertos alcornoques y carrascas.',
      'Excluir pastoreo y proteger frente a herbívoros 3–5 años donde haya presión.',
      'Seguimiento con parcelas de campo y NDVI (Sentinel-2) cada primavera.',
    ],
    coste: 17,
  },
  2: {
    corto: 'Regeneración asistida',
    que: 'Pinar con daño alto o pinar joven: probablemente no hay banco de piñas serótinas suficiente. Se ayuda con siembras y núcleos de plantación que aceleren la entrada de frondosas.',
    como: [
      'Medir el regenerado de pino en primavera-verano 2027; actuar donde haya <1.000 plántulas/ha.',
      'Siembra de bellotas (alcornoque o carrasca, según la vegetación potencial) por puntos, protegidas.',
      'Plantación en bosquetes / núcleos de dispersión (400–600 plantas/ha) con protector, en otoño-invierno.',
      'Clareos del regenerado de pino a los 8–12 años para evitar masas densas muy inflamables.',
    ],
    coste: 3125,
  },
  3: {
    corto: 'Restauración activa',
    que: 'El pinar ocupaba suelos donde debería haber alcornocal o carrascal, o la zona ha ardido repetidamente y el matorral ya no evoluciona solo. Hay que reintroducir las especies de la vegetación potencial.',
    como: [
      'Plantación de 800–1.100 plantas/ha de las especies de la serie potencial (ver pestaña Cómo).',
      'Planta de la región de procedencia local (Banc de Llavors Forestals de la GVA).',
      'Hoyos manuales en pendiente, protectores, riego de apoyo el primer verano y reposición de marras.',
      'Ejecutar tras la estabilización del suelo, en la ventana de plantación de otoño-invierno 2027–28.',
    ],
    coste: 6963,
  },
  4: {
    corto: 'Recuperar cultivo / mosaico',
    que: 'Terreno agrícola (sobre todo algarrobos, olivos y almendros de secano) dentro del perímetro.',
    como: [
      'Recuperar cultivos de secano como discontinuidades cortafuegos (mosaico agroforestal).',
      'Ayudas a explotaciones afectadas (Generalitat / PAC) y pastoreo controlado en fajas.',
    ],
    coste: 0,
  },
  5: { corto: 'Sin actuación', que: 'No quemado o afectado levemente.', como: [], coste: 0 },
};

export const EMERG = {
  corto: 'Estabilización urgente del suelo',
  que: 'Severidad alta en pendiente: alto riesgo de erosión y arrastres con las primeras lluvias fuertes de otoño.',
  como: [
    'Fajinas y barreras con troncos quemados siguiendo las curvas de nivel.',
    'Albarradas o diques de mampostería en cárcavas y cabeceras de barranco.',
    'Acolchado (mulching) de paja o astilla en las laderas más expuestas.',
    'Evitar maquinaria pesada y la saca de madera en pendientes fuertes.',
  ],
  coste: 2204,
};

export const FIRE = {
  dataDir: 'vallduixo', // carpeta en el repo fenix-data
  ems: 'EMSR905',
  emsUrl: 'https://rapidmapping.emergency.copernicus.eu/EMSR905',
  park: "Serra d'Espadà",
  firesFrom: 1993,
  ifnProv: 'Castellón',
  fechasSequedad: '4 de abril y del 3 de julio',
  // imágenes Sentinel-2 del comparador (clave de escena → etiqueta); las fechas salen de meta.json
  images: [['abril', 'Primavera'], ['antes', 'Antes'], ['despues', 'Después'], ['ahora', 'Ahora']],
  swir: ['antes', 'despues', 'ahora'],
  pnoa: 'Ortofoto PNOA (pre-incendio)',
  presets: [['antes|despues', 'Antes vs después'], ['antes|ahora', 'Antes vs ahora'], ['despues_swir|ahora_swir', 'Rebrote (falso color)'], ['pnoa|despues', 'Ortofoto vs después']],
  official: { value: '9.568 ha', label: 'superficie oficial (CCE Generalitat)' },
  // Cifras publicadas por la Fundación CEAM (agosto 2026, provisionales)
  ceamRef: { ha: 9600, pn: 43, parque: 12, muyAlta: 16, pinar: 40, matorral: 30, alcornocal: 10, ndmi: -51, ndvi: -38 },
  potential: '<b>alcornocal</b> sobre el rodeno y <b>carrascal</b> sobre la caliza',
  arbolesNota: 'sobre todo pinos; la mayoría de alcornoques y carrascas rebrotará',
  plan: {
    budget: 2.7e6,
    when: { emerg: 'oct 2026 – mar 2027', 1: '2027 – 2032', 2: '2027 – 2030', 3: '2027 – 2031', 4: '2027 –' },
    ref: 'Referencia: la Generalitat anunció 4,2 M€ (oct 2026), de los que 2,7 M€ van a recuperación forestal y caminos.',
  },
  ceamNow: 'Es normal que casi todo salga por debajo del 30 %: solo han pasado unas semanas. La evaluación que propone el CEAM corresponde a 2027–2028.',
  timeline: `
      <div><b>Ahora – marzo 2027 · Emergencia</b>Estabilizar laderas antes y durante las lluvias de otoño (fajinas, albarradas, acolchado), retirar árboles peligrosos junto a caminos y casas. No plantar todavía.</div>
      <div><b>Primavera – verano 2027 · Diagnóstico</b>Ver qué rebrota y cuánto pino nace. Parcelas de campo + imágenes Sentinel-2. Ajustar el mapa de actuaciones.</div>
      <div><b>Otoño 2027 – invierno 2029 · Restauración</b>Siembras y plantaciones con planta local donde la regeneración no basta. Protección frente a herbívoros.</div>
      <div><b>2030 – 2040 · Consolidación</b>Reposición de marras, clareos del regenerado denso de pino, creación de un mosaico menos inflamable.</div>
      <div><b>2040 – 2060 · Bosque maduro</b>Primer descorche de los alcornoques nuevos (~25–30 años), dominancia de frondosas.</div>`,
  ayuda: 'Apoyar a las asociaciones de custodia del territorio y a la economía local del corcho.',
  // datos y método propios de este incendio en la pestaña Fuentes
  fuentesDatos: (S) => `
    <li><b>Área quemada:</b> <a href="https://rapidmapping.emergency.copernicus.eu/EMSR905" target="_blank" rel="noopener">Copernicus EMS Rapid Mapping EMSR905</a>, producto de evaluación (GRA v2, imagen del 31 jul 2026).</li>`,
  fuentesOficial: '<li><b>Cifras oficiales</b> (9.568 ha, 89 km de perímetro, 4,2 M€): Centro de Coordinación de Emergencias y Generalitat, según prensa.</li>',
  fuentesCeam: `
  <h2>Fundación CEAM</h2>
  <ul>
    <li>Cifras y conclusiones: <a href="https://comunica.gva.es/es/detalle?id=413511022&site=373428693" target="_blank" rel="noopener">nota de la Generalitat sobre el análisis del CEAM</a>,
    <a href="https://www.elperiodic.com/pcastellon/fuego-quema-parque-natural-serra-despada-pero-todo-ardido-igual-zonas-arrasadas-menos_1087008" target="_blank" rel="noopener">zonas por severidad</a> y
    <a href="https://www.elperiodic.com/pcastellon/cuando-podra-reforestar-serra-despada-esto-debe-ocurrir-primero_1086815" target="_blank" rel="noopener">protocolo de restauración</a> (El Periòdic) y
    <a href="https://castellonplaza.com/castellonplaza/comarcas/informe-del-ceam-sobre-el-incendio-de-la-vall-duixo-la-vegetacion-perdio-el-51-de-humedad-en-los-meses-previos" target="_blank" rel="noopener">pérdida de humedad previa</a> (Castellón Plaza).</li>
    <li>Protocolo y umbrales: manual <i>Postfire-DSS</i> de la Fundación CEAM, según El Periòdic.</li>
    <li>El CEAM no ha publicado sus mapas: las capas de sequedad y de criterio CEAM de esta app reproducen sus análisis con datos abiertos y pueden no coincidir exactamente con los suyos.</li>
    <li>Coordenadas de los parajes: Nomenclátor Geográfico Básico de España (IGN), vía CartoCiudad. El Puntal de Nules es el Pic de la Font de Cabres (639 m), según <a href="https://de.wikiloc.com/routen-wandern/ume1963-el-puntal-de-nules-pic-de-la-font-de-cabres-639-m-80185664" target="_blank" rel="noopener">esta ruta de Wikiloc</a>.</li>
  </ul>`,
  officialLimit: 'la cifra oficial (9.568 ha) usa el perímetro exterior e incluye islas no quemadas',
  otherFire: { href: 'bejis/', label: 'Incendio de Bejís (2022)' },
};
