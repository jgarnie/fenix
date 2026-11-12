// Textos y datos propios del incendio de Villanueva de Viver – Alto Mijares (Castellón y Teruel, marzo 2023).
// app.js es común a todos los incendios; cada carpeta tiene su fire.js y su data/.
// El incendio cruzó a Aragón: todas las capas continúan entre comunidades.

export const ACT_INFO = {
  1: {
    corto: 'Regeneración natural',
    que: 'El pinar de pino carrasco era adulto y tenía piñas serótinas: el CEAM estimó entre 9 y 10 piñones por m² en el suelo tras el incendio, así que regenera por semilla. Carrasca, quejigo, coscoja y enebros rebrotan de cepa.',
    como: [
      'Comprobar en campo que hay regeneración suficiente: 1.000–3.000 pies/ha, según el CEAM.',
      'Clarear el regenerado de pino donde haya nacido demasiado denso, entre 8 y 12 años después del incendio (2031–2035). Tras el incendio de Espadilla de 1994 quedaron rodales de 2.000 a 10.000 pies/ha.',
      'Proteger los rebrotes de carrasca y quejigo frente al ramoneo donde haya mucha presión de herbívoros.',
      'Seguimiento con parcelas de campo y NDVI (Sentinel-2) cada primavera.',
    ],
    coste: 17,
  },
  2: {
    corto: 'Regeneración asistida',
    que: 'Pinar quemado con daño alto o pinar joven, nacido tras un incendio reciente, que probablemente no tenía piñas suficientes; o carrascal y matorral donde, dos años después, la cobertura vegetal sigue por debajo del 30 % (criterio CEAM). Se refuerza con siembras y núcleos de plantación de frondosas.',
    como: [
      'Comprobar en campo dónde no ha nacido pino ni rebrotado nada (capa Criterio CEAM, por debajo del 30 %).',
      'Siembra de bellotas de carrasca o quejigo por puntos, protegidas.',
      'Plantación en bosquetes / núcleos de dispersión (400–600 plantas/ha) con protector, en otoño-invierno: carrasca, quejigo, madroño, mostajo.',
      'Clareos del regenerado de pino a los 8–12 años para evitar masas densas muy inflamables.',
    ],
    coste: 3125,
  },
  3: {
    corto: 'Restauración activa',
    que: 'La zona ya había ardido (Espadilla 1994) y el matorral ya no evoluciona solo, o el fuego fue muy intenso en terreno que ya había ardido. Hay que reintroducir las especies de la vegetación potencial.',
    como: [
      'Plantación de 800–1.100 plantas/ha de las especies de la serie potencial (ver pestaña Cómo).',
      'Planta de la región de procedencia local (Banc de Llavors Forestals de la GVA; en Aragón, viveros del Gobierno de Aragón).',
      'Hoyos manuales en pendiente, protectores, riego de apoyo el primer verano y reposición de marras.',
      'Priorizar donde, tres años después, la cobertura sigue por debajo del 30 %.',
    ],
    coste: 6963,
  },
  4: {
    corto: 'Recuperar cultivo / mosaico',
    que: 'Terreno agrícola (bancales de almendro, olivo y cereal de secano, muchos abandonados) dentro del perímetro. Buena parte del pinar quemado nació sobre bancales abandonados desde mediados del siglo XX.',
    como: [
      'Recuperar cultivos de secano y pastos como discontinuidades cortafuegos (mosaico agroforestal).',
      'Ayudas a explotaciones afectadas y pastoreo controlado en fajas.',
    ],
    coste: 0,
  },
  5: { corto: 'Sin actuación', que: 'No quemado o afectado levemente.', como: [], coste: 0 },
};

export const EMERG = {
  corto: 'Control de la erosión',
  que: 'Severidad alta en pendiente. El CEAM señaló riesgo de erosión alto o muy alto en las zonas de severidad alta, sobre todo en las laderas del barranco de la Maimona y del Mijares: las cenizas ya bajaron hasta el río en 2023. Tres años después conviene revisar las cárcavas y barrancos donde el suelo sigue desnudo.',
  como: [
    'Revisar y reponer fajinas y troncos en curva de nivel en las laderas donde la vegetación aún no cubre el suelo.',
    'Albarradas o diques de mampostería en cárcavas y cabeceras de barranco (el CEAM propuso estudiarlos en el barranco de La Boscaja y junto a la ermita de Los Ángeles).',
    'Apear los pinos muertos que aún pueden caer sobre caminos y carreteras (CV-20, CV-195, CV-107).',
    'Evitar maquinaria pesada en pendientes fuertes.',
  ],
  coste: 2204,
};

export const FIRE = {
  dataDir: 'viver', // carpeta en el repo fenix-data
  ems: 'EMSR656',
  emsUrl: 'https://rapidmapping.emergency.copernicus.eu/EMSR656',
  park: null,
  firesFrom: 1993,
  ifnProv: 'Castellón y Teruel',
  admin: 'la Generalitat o el Gobierno de Aragón',
  organismos: 'la Generalitat Valenciana, el Gobierno de Aragón',
  ownerDesc: 'Montes públicos: catálogo de la Generalitat Valenciana y del Gobierno de Aragón',
  attrib: '© Unión Europea, Copernicus EMS · ICV/GVA · Gobierno de Aragón · IGN · IGME-CSIC · MITECO · EFFIS · Copernicus DEM',
  fechasSequedad: '4 de febrero y del 16 de marzo de 2023',
  reburnNota: '',
  jornalNota: 'Los jornales de Extremadura (peón 11,08 €/h) pueden ser algo más bajos que en Castellón y Teruel.',
  // imágenes Sentinel-2 del comparador (clave de escena → etiqueta); las fechas salen de meta.json
  images: [['abril', 'Invierno'], ['antes', 'Antes'], ['despues', 'Después'], ['y2024', '1 año'], ['y2025', '2 años'], ['y2026', '3 años'], ['ahora', 'Ahora']],
  swir: ['antes', 'despues', 'y2025', 'y2026'],
  pnoa: 'Ortofoto PNOA (vuelo más reciente)',
  // vuelos PNOA históricos que cubren la zona (al acercar mucho sustituyen a Sentinel-2)
  ortos: [{ year: 2021, label: 'antes del incendio', pre: true }, { year: 2024, label: 'un año después', pre: false }],
  presets: [['antes|despues', 'Antes vs después'], ['despues|y2026', 'Después vs 3 años'], ['antes|y2026', 'Antes vs 3 años'], ['despues_swir|y2026_swir', 'Rebrote (falso color)'], ['orto2021|orto2024', 'Ortofotos 2021 vs 2024']],
  official: { value: '4.723 ha', label: 'superficie provisional según la Generalitat (abril 2023), unas 840 de ellas en Aragón según el Gobierno de Aragón' },
  ceamRef: null,
  potential: '<b>carrascal</b> y, en las umbrías y zonas altas, <b>quejigar</b>',
  calloutExtra: (S, ha) => `<br><br>El fuego empezó en Villanueva de Viver, pero casi todo lo que ardió está en Puebla de Arenoso, Montanejos y Montán, y unas 850 ha en
    San Agustín y Olba (Teruel). Era sobre todo pinar adulto de pino carrasco nacido en bancales abandonados, que regenera bien por semilla:
    el reto es más evitar masas demasiado densas que reforestar.`,
  munNota: 'Superficie vista quemada por satélite (Copernicus); el reparto oficial por municipio puede ser distinto. Incluye los términos de Aragón.',
  arbolesNota: 'casi todos pinos carrascos; carrascas y quejigos rebrotan',
  metodoActuacion: 'rebrotadoras → regeneración natural, salvo donde dos años después (marzo de 2025) la cobertura sigue por debajo del 30 % (criterio CEAM) → asistida; pinar maduro poco dañado y sin incendios recientes → natural; resto de pinar → asistida; matorral que ha ardido dos o más veces, o severidad alta en zonas que ya habían ardido dos o más veces → restauración activa. Mismo modelo a los dos lados del límite entre comunidades; en la parte aragonesa los incendios previos solo se conocen desde 2016 (EFFIS).',
  plan: {
    budget: 1200000,
    when: { emerg: 'revisión 2026–2027', 1: '2026 – 2035', 2: '2026 – 2029', 3: '2026 – 2030', 4: '2026 –' },
    ref: 'Referencia: la Generalitat y el Ministerio anunciaron 1 M€ para los trabajos urgentes del primer año (abril 2023), y el Gobierno de Aragón, casi 200.000 € para restaurar unas 200 ha de montes de utilidad pública en San Agustín y Olba (2023). No hemos encontrado proyectos de restauración publicados para 2024–2026.',
  },
  ceamNow: (S, ha) => {
    const c = Object.values(S.ceam);
    const tot = c.reduce((a, x) => a + x.total, 0);
    return `La imagen de referencia es de dos años después del incendio (marzo de 2025), el plazo que propone el CEAM. En el ${Math.round((c[0].total / tot) * 100)} % del área
    forestal quemada (${ha(c[0].total)}) la cobertura sigue por debajo del 30 %. Es una aproximación: en primavera el NDVI cuenta la hierba como si fuera leñosa
    y se queda corto con el regenerado de pino muy pequeño. Conviene confirmarlo en campo antes de plantar.`;
  },
  timeline: `
      <div><b>23 mar 2023 · Inicio</b>A las 12:50 se declara en el barranco de Sentenal (Villanueva de Viver). Se desaloja Montanejos, Fuente la Reina, Puebla de Arenoso, Arañuel y sus pedanías, y masías de San Agustín y Olba en Teruel. Protección Civil cifra los desalojados en 2.357 en la Comunitat Valenciana y 285 en Aragón.</div>
      <div><b>26–27 mar · Reactivación</b>El fuego se reaviva en el barranco de la Maimona (Montán) y obliga a desalojar Torralba del Pinar, Pavías e Higueras. En San Agustín arden casas del barrio de La García.</div>
      <div><b>31 mar · Estabilizado y controlado</b>Unas 4.700 ha: 4.723 según la Generalitat, unas 840 de ellas en Aragón. Se da por extinguido el 11 de abril.</div>
      <div><b>Abr – may 2023 · Emergencia</b>Oficina técnica en Montanejos, informe de impacto del CEAM (3 de mayo) y 1 M€ anunciado por la Generalitat y el Ministerio para apeo de árboles peligrosos, control de la erosión y caminos.</div>
      <div><b>Jun – dic 2023 · Aragón</b>Restauración de unas 200 ha de montes públicos de San Agustín y Olba: retirada de madera quemada, fajinas, albarradas y poda de carrascas y quejigos.</div>
      <div><b>2024 – 2026 · Seguimiento</b>Ayudas por daños a los ayuntamientos (325.350 €, 2024) y plantaciones de asociaciones, como la de la Fundación Desert Leaves en Fuente la Reina. El CEAM propone evaluar la regeneración uno o dos años después (capa Criterio CEAM).</div>
      <div><b>2031 – 2035 · Clareos</b>Aclarar el regenerado de pino donde haya salido muy denso, para no repetir los rodales hiperdensos que dejó el incendio de Espadilla de 1994.</div>
      <div><b>2035 – 2060 · Consolidación</b>Mosaico de pinar, carrascal, quejigar y cultivos menos inflamable.</div>`,
  ayuda: 'Apoyar a los ayuntamientos del Alto Mijares y de Gúdar-Javalambre, a las asociaciones que replantan (como la Fundación Desert Leaves) y la recuperación de cultivos y pastos.',
  fuentesDatos: () => `
    <li><b>Área quemada:</b> <a href="https://rapidmapping.emergency.copernicus.eu/EMSR656" target="_blank" rel="noopener">Copernicus EMS Rapid Mapping EMSR656</a>, producto de evaluación (GRA, AOI01 Villanueva de Viver, v2, 30 mar 2023).</li>`,
  fuentesMontes: `<li><b>Monte público:</b> <a href="https://dadesobertes.gva.es/es/dataset/montes-gestionados-por-la-administracion-autonomica1" target="_blank" rel="noopener">montes gestionados por la Generalitat</a> (ICV/GVA) y
    <a href="https://idearagon.aragon.es/" target="_blank" rel="noopener">montes públicos de Aragón</a> (IDEAragon, Gobierno de Aragón). El catálogo aragonés no indica el titular.</li>
    <li><b>Vegetación previa:</b> Mapa Forestal de España 1:50.000 de Castellón y Teruel (MITECO, Banco de Datos de la Naturaleza).</li>`,
  fuentesOtras: `<li><b>Incendios previos:</b> estadística de la Generalitat desde 1993 (parte valenciana) y EFFIS, Copernicus, desde 2016 (las dos comunidades).
    <b>Espacios Naturales Protegidos:</b> MITECO. <b>Términos municipales:</b> IGN.</li>`,
  fuentesOficial: `<li><b>Superficie, fechas y desalojos:</b>
    <a href="https://www.112cv.gva.es/es/inicio/-/asset_publisher/OriTjHiopH9w/content/bravo-informa-a-los-municipios-afectados-por-el-incendio-de-villanueva-de-viver-de-la-inmediata-puesta-en-marcha-de-la-oficina-t%C3%A9cnica-post-emergencia" target="_blank" rel="noopener">112 Comunitat Valenciana (abr. 2023)</a>,
    <a href="https://www.aragonhoy.es/medio-ambiente-turismo/gobierno-aragon-restauracion-zonas-afectadas-incendio-san-agustin-olba-93163" target="_blank" rel="noopener">Gobierno de Aragón</a> y
    <a href="https://www.proteccioncivil.es/documents/20121/0/Informe+de+Seguimiento+de+IIFF+20230604+(1).pdf/34e72c8c-3517-fc5e-bf9d-9e55e2a5e6e6?t=1686132668547&download=true" target="_blank" rel="noopener">informe de seguimiento de Protección Civil (jun. 2023)</a>.
    La causa sigue en el juzgado: no hay causa oficial publicada.</li>
    <li><b>Actuaciones e inversiones:</b>
    <a href="https://valenciaplaza.com/valenciaplaza/lageneralitatytransicionecologicainvertiranunmillonenlazonaquemadadevillanuevadeviver1" target="_blank" rel="noopener">Valencia Plaza (abr. 2023)</a>,
    <a href="https://www.diariodeteruel.es/comarcas/comienzan-los-trabajos-de-restauracion-en-200-hectareas-de-las-zonas-afectadas-por-el-incendio-de-san-agustin-y-olba" target="_blank" rel="noopener">Diario de Teruel (sep. 2023)</a>,
    <a href="https://www.112cv.gva.es/es/inicio/-/asset_publisher/OriTjHiopH9w/content/el-consell-aprova-les-bases-per-a-concedir-les-ajudes-pels-danys-produ%C3%AFts-per-l-incendi-forestal-de-villanueva-de-viver?_com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_OriTjHiopH9w_assetEntryId=385358979" target="_blank" rel="noopener">ayudas por daños (112 CV, jul. 2024)</a> y
    <a href="https://www.desertleaves.org/en/our-work/alto-mijares" target="_blank" rel="noopener">Fundación Desert Leaves</a>.</li>`,
  fuentesCeam: `
  <h2>Criterio del CEAM</h2>
  <ul>
    <li><a href="https://postfire.es/informes/impacto/informe_villanueva_viver.pdf" target="_blank" rel="noopener">Informe de impacto del incendio de Villanueva de Viver</a> (Fundación CEAM para la Generalitat, 3 de mayo de 2023):
    vegetación quemada, severidad, regeneración esperada del pino carrasco, riesgo de erosión, incendios previos (Espadilla 1994) y propuestas de emergencia.
    Umbrales y plazos del manual <i>Postfire-DSS</i>. La capa de cobertura a dos años es una aproximación propia con datos abiertos, no una evaluación del CEAM.</li>
  </ul>`,
  licencias: `<li>Montes, incendios históricos de la parte valenciana: Institut Cartogràfic Valencià / Generalitat Valenciana, CC BY 4.0. Montes públicos de Aragón: Gobierno de Aragón (IDEAragon), datos abiertos.
    Mapa Forestal de España y Espacios Naturales Protegidos: MITECO. Términos municipales: IGN, CC BY 4.0 scne.es. Incendios previos desde 2016: EFFIS, © Unión Europea.</li>`,
  limitMontes: 'La capa de montes públicos une el catálogo de la Generalitat y el de Aragón; el aragonés no indica el titular (ayuntamiento o comunidad). Puede haber otras fincas públicas no catalogadas. En la parte aragonesa, los incendios previos solo se conocen desde 2016. El sustrato geológico se ha reconstruido a partir de las imágenes del mapa GEODE del IGME (en noviembre de 2026 el IGME desactivó la descarga de datos): el método reproduce el 99 % de los píxeles en Espadà y Bejís, donde sí teníamos los datos originales.',
  officialLimit: 'la Generalitat dio 4.723 ha provisionales y el informe de Protección Civil, 4.220; en prensa circulan cifras entre 4.500 y 4.781. El Gobierno de Aragón situó en unas 840 ha la parte aragonesa. Las diferencias vienen de cómo se traza el perímetro y de qué se cuenta como quemado',
  otherFire: [{ href: '../', label: 'Incendio de Espadà (2026)' }, { href: '../bejis/', label: 'Incendio de Bejís (2022)' }, { href: '../tietar/', label: 'Incendio del valle del Tiétar (2026)' }],
};
