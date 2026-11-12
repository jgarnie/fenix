// Textos y datos propios del incendio de Burgohondo y el valle del Tiétar (Ávila y oeste de Madrid, julio 2026).
// app.js es común a todos los incendios; cada carpeta tiene su fire.js y su data/.

export const ACT_INFO = {
  1: {
    corto: 'Regeneración natural',
    que: 'La vegetación previa rebrota (encina, melojo, castaño, enebro, jara, retama…) o el pinar de resinero era maduro, ardió con poca severidad y no había ardido hace poco, así que puede regenerar por semilla.',
    como: [
      'Esperar a la primavera de 2027 y comprobar en campo que hay regeneración suficiente (como referencia, 1.000–3.000 pies/ha).',
      'Proteger los rebrotes de encina y melojo frente al ganado y los herbívoros donde haya mucha presión.',
      'Clarear el regenerado de pino resinero donde nazca demasiado denso, entre 8 y 12 años después (2034–2038).',
      'Seguimiento con parcelas de campo y NDVI (Sentinel-2) cada primavera.',
    ],
    coste: 17,
  },
  2: {
    corto: 'Regeneración asistida',
    que: 'Pinar quemado con daño alto, pinar joven o pinar de pino piñonero, que regenera mal tras el fuego porque sus piñas no se abren con el calor. Se refuerza con siembras y núcleos de plantación, mejor con encina, melojo y otras frondosas de la serie potencial.',
    como: [
      'Esperar a ver qué nace en 2027 y reforzar solo donde no regenere.',
      'Siembra de bellotas de encina o melojo por puntos, protegidas.',
      'Plantación en bosquetes / núcleos de dispersión (400–600 plantas/ha) con protector, en otoño-invierno.',
      'Donde se repueble con pino, hacerlo en mosaico con frondosas y con densidades bajas.',
    ],
    coste: 3125,
  },
  3: {
    corto: 'Restauración activa',
    que: 'El fuego fue muy intenso en terreno que ya había ardido, o el matorral se ha quemado varias veces y ya no evoluciona solo. Hay que reintroducir las especies de la vegetación potencial.',
    como: [
      'Plantación de 800–1.100 plantas/ha de las especies de la serie potencial (ver pestaña Cómo).',
      'Planta de la región de procedencia local (viveros forestales de la Junta y de la Comunidad de Madrid).',
      'Hoyos manuales en pendiente, protectores, riego de apoyo el primer verano y reposición de marras.',
    ],
    coste: 6963,
  },
  4: {
    corto: 'Recuperar cultivo / mosaico',
    que: 'Terreno agrícola (viñedo de Cebreros y San Martín, olivar, huertas y prados) dentro del perímetro.',
    como: [
      'Recuperar viñedos, olivares y prados como discontinuidades cortafuegos (mosaico agroforestal).',
      'Ayudas a explotaciones afectadas (plan de la Junta, Comunidad de Madrid, PAC) y pastoreo controlado en fajas.',
    ],
    coste: 0,
  },
  5: { corto: 'Sin actuación', que: 'No quemado o afectado levemente.', como: [], coste: 0 },
};

export const EMERG = {
  corto: 'Control de la erosión',
  que: 'Severidad alta en pendiente. En los granitos de la Paramera, el Alberche y el Tiétar, el suelo es arenoso y poco profundo: con las lluvias de otoño se pierde rápido y acaba en los embalses del Burguillo y San Juan.',
  como: [
    'Fajinas y cordones de restos de corta siguiendo las curvas de nivel en las laderas más expuestas.',
    'Albarradas o diques en cárcavas y cabeceras de barranco que vierten a los embalses.',
    'Acolchado (mulching) de paja o astilla donde la severidad ha sido alta.',
    'Evitar maquinaria pesada y la saca de madera en pendientes fuertes.',
  ],
  coste: 2204,
};

export const FIRE = {
  dataDir: 'tietar', // carpeta en el repo fenix-data
  ems: 'EMSR900',
  emsUrl: 'https://rapidmapping.emergency.copernicus.eu/EMSR900',
  park: 'Valle de Iruelas',
  parkShort: 'Reserva Natural',
  parkIn: 'de la Reserva Natural del Valle de Iruelas',
  firesFrom: 2016,
  ifnProv: 'Ávila, Madrid y Toledo',
  admin: 'la Junta o la Comunidad de Madrid',
  organismos: 'la Junta de Castilla y León, la Comunidad de Madrid',
  ownerDesc: 'Catálogo de montes de utilidad pública (Junta de Castilla y León y Comunidad de Madrid)',
  attrib: '© Unión Europea, Copernicus EMS · JCyL · Comunidad de Madrid · IGN · IGME-CSIC · MITECO · EFFIS · Copernicus DEM',
  // sin tarifa de encargo propia: por defecto, contrato licitado
  sinVaersa: true,
  recargo: 'licita',
  recargoNota: '',
  jornalNota: 'Los jornales de Extremadura (peón 11,08 €/h) son parecidos a los de Ávila y algo más bajos que en Madrid.',
  reburnNota: '',
  // imágenes Sentinel-2 del comparador (clave de escena → etiqueta); las fechas salen de meta.json
  images: [['abril', 'Primavera'], ['antes', 'Antes'], ['despues', 'Después'], ['ahora', 'Ahora']],
  swir: ['antes', 'despues', 'ahora'],
  pnoa: 'Ortofoto PNOA (pre-incendio)',
  // vuelos PNOA históricos que cubren la zona (al acercar mucho sustituyen a Sentinel-2); aún no hay vuelo posterior al incendio
  ortos: [{ year: 2023, label: 'antes del incendio', pre: true }],
  presets: [['antes|despues', 'Antes vs después'], ['antes|ahora', 'Antes vs ahora'], ['despues_swir|ahora_swir', 'Rebrote (falso color)'], ['orto2023|despues', 'Ortofoto 2023 vs después']],
  official: { value: '37.800 ha', label: 'superficie afectada según la Junta de Castilla y León (agosto 2026, estimación por satélite), de ellas 33.900 forestales' },
  ceamRef: null,
  potential: '<b>encinar</b> silicícola en las zonas bajas y <b>melojar</b> (roble melojo) en las altas',
  calloutExtra: (S, ha) => `<br><br>Este mapa reúne todo lo que ardió junto en julio de 2026 entre Ávila y el oeste de Madrid: el incendio de Burgohondo,
    el foco de San Martín de Valdeiglesias (Navas del Rey, Robledo de Chavela…) y el incendio de Almorox – Villa del Prado, en los encinares del Alberche.
    Empezaron por separado, pero sus áreas quemadas acabaron tocándose y Copernicus los cartografió en la misma activación.`,
  munNota: 'Superficie vista quemada por satélite (Copernicus); el reparto oficial por municipio puede ser distinto.',
  arbolesNota: 'sobre todo pinos resineros y piñoneros; encinas y melojos rebrotan',
  metodoActuacion: 'rebrotadoras (encinar, melojar, castañar, matorral) → regeneración natural; pinar maduro poco dañado y sin incendios recientes → natural; resto de pinar, incluido todo el pino piñonero con daño alto → asistida; matorral que ha ardido dos o más veces, o severidad alta en zonas que ya habían ardido dos o más veces → restauración activa. Los incendios previos solo se conocen desde 2016 (EFFIS).',
  plan: {
    budget: 15e6,
    when: { emerg: 'oct 2026 – mar 2027', 1: '2027 – 2038', 2: '2027 – 2030', 3: '2027 – 2031', 4: '2027 –' },
    ref: 'Referencia: la Consejería de Medio Ambiente de la Junta destinó 15 M€ a recuperar las zonas forestales de todos los incendios de 2026 en Castilla y León (Ávilared, agosto 2026), dentro de un plan de unos 90 M€; los estudios y proyectos se encargaron a Somacyl. La Comunidad de Madrid actúa aparte en su parte del incendio.',
  },
  hideCeam: true, // el criterio del CEAM es valenciano: aquí no se muestra
  ceamNow: 'Solo han pasado tres meses: esa evaluación corresponde a 2027–2028.',
  timeline: `
      <div><b>22 jul – 6 ago 2026 · Incendio</b>Empieza el 22 de julio en Burgohondo (según la Guardia Civil, por una imprudencia con maquinaria pesada) y cruza la sierra hacia el Alberche y el valle del Tiétar. Esa misma tarde empieza otro incendio en Almorox (Toledo) que pasa a Villa del Prado, y hay otro foco en San Martín de Valdeiglesias; sus áreas quemadas acaban tocándose. Más de 30.000 personas desalojadas en Ávila y Madrid. Se da por estabilizado el 6 de agosto.</div>
      <div><b>Ahora – marzo 2027 · Emergencia</b>Estabilizar laderas antes y durante las lluvias de otoño, sobre todo las que vierten a los embalses del Burguillo y San Juan; retirar árboles peligrosos junto a caminos y casas. No plantar todavía.</div>
      <div><b>Primavera – verano 2027 · Diagnóstico</b>Ver qué rebrota (encina, melojo, castaño) y cuánto pino nace. Parcelas de campo + Sentinel-2. Plan comarcal de restauración de la Junta.</div>
      <div><b>Otoño 2027 – invierno 2030 · Restauración</b>Siembras y plantaciones con planta local donde la regeneración no basta, con frondosas en mosaico. Protección frente a herbívoros.</div>
      <div><b>2034 – 2040 · Clareos</b>Aclarar el regenerado de pino resinero donde salga muy denso, para no volver a crear masas continuas e inflamables.</div>
      <div><b>2040 – 2060 · Consolidación</b>Mosaico de pinar, encinar, melojar, viñedo y prado, menos inflamable.</div>`,
  ayuda: 'Apoyar a las asociaciones de custodia del territorio, a los viticultores de Cebreros y San Martín de Valdeiglesias y a la ganadería extensiva que mantiene los cortafuegos verdes.',
  fuentesDatos: () => `
    <li><b>Área quemada:</b> <a href="https://rapidmapping.emergency.copernicus.eu/EMSR900" target="_blank" rel="noopener">Copernicus EMS Rapid Mapping EMSR900</a>: delimitación final de la AOI03 La Atalaya (28 jul 2026) unida a las evaluaciones de daños de las AOI02 y AOI04–07 (Villa del Prado, Piedralaves, San Martín de Valdeiglesias, Navas del Rey, La Rinconada). La AOI02 corresponde al incendio de Almorox – Villa del Prado, que se incluye porque su área quemada toca la del resto.</li>`,
  fuentesMontes: `
    <li><b>Monte público:</b> montes de utilidad pública de la <a href="https://idecyl.jcyl.es" target="_blank" rel="noopener">Junta de Castilla y León (IDECyL)</a> y de la <a href="https://idem.comunidad.madrid" target="_blank" rel="noopener">Comunidad de Madrid (IDEM)</a>.</li>
    <li><b>Vegetación previa:</b> <a href="https://www.miteco.gob.es/es/biodiversidad/servicios/banco-datos-naturaleza/informacion-disponible/mfe50.html" target="_blank" rel="noopener">Mapa Forestal de España 1:50.000</a> de Ávila, Madrid y Toledo (MITECO).</li>`,
  fuentesOtras: `
    <li><b>Incendios 2016–2025:</b> <a href="https://forest-fire.emergency.copernicus.eu" target="_blank" rel="noopener">EFFIS</a> (Copernicus), áreas quemadas cartografiadas por satélite, en general de más de 30 ha.</li>
    <li><b>Reserva Natural del Valle de Iruelas:</b> <a href="https://www.miteco.gob.es/es/biodiversidad/servicios/banco-datos-naturaleza/informacion-disponible/enp_descargas.html" target="_blank" rel="noopener">Espacios Naturales Protegidos</a> (MITECO, 2025).</li>
    <li><b>Términos municipales:</b> Instituto Geográfico Nacional (unidades administrativas).</li>`,
  licencias: `<li>Montes de utilidad pública: Junta de Castilla y León y Comunidad de Madrid. Mapa Forestal de España y Espacios Naturales Protegidos: MITECO. Términos municipales: IGN, CC BY 4.0 scne.es. Incendios previos: EFFIS, © Unión Europea.</li>`,
  limitMontes: 'La capa de montes públicos incluye los catálogos de utilidad pública de Castilla y León y Madrid; la pequeña parte quemada en Toledo (unas 750 ha) no se ha cruzado con el catálogo de Castilla-La Mancha. Puede haber otras fincas públicas no catalogadas. Los incendios previos solo se conocen desde 2016.',
  fuentesOficial: `<li><b>Superficie, fechas, causa y desalojos:</b> Junta de Castilla y León según
    <a href="https://www.eldiario.es/castilla-y-leon/sociedad/junta-castilla-leon-rebaja-37-800-hectareas-superficie-afectada-incendio-avila_1_13459661.html" target="_blank" rel="noopener">elDiario.es</a>,
    <a href="https://www.infobae.com/espana/2026/08/06/estabilizado-el-incendio-de-burgohondo-avila-tras-quince-dias-activos-y-mas-de-50000-hectareas-afectadas/" target="_blank" rel="noopener">Infobae</a> y
    <a href="https://www.eldebate.com/espana/castilla-y-leon/20260902/justicia-investiga-origen-posibles-responsabilidades-incendio-burgohondo-avila_454495.html" target="_blank" rel="noopener">El Debate</a>.
    Plan de recuperación: <a href="https://avilared.com/art/94019/medio-ambiente-destina-15-millones-recuperar-zonas-forestales-incendios-castilla-leon" target="_blank" rel="noopener">Ávilared</a> y
    <a href="https://www.eldiario.es/castilla-y-leon/politica/manueco-anuncia-plan-90-millones-recuperacion-zonas-arrasadas-incendios-castilla-leon_1_13417281.html" target="_blank" rel="noopener">elDiario.es</a>.</li>`,
  fuentesCeam: '',
  officialLimit: 'la Junta estima 37.800 ha y en los primeros días se llegó a hablar de más de 50.000. Las diferencias vienen de cómo se traza el perímetro, de qué se cuenta como quemado y de que este mapa incluye también los focos de San Martín de Valdeiglesias y Almorox – Villa del Prado',
  otherFire: [{ href: '../', label: 'Incendio de Espadà (2026)' }, { href: '../bejis/', label: 'Incendio de Bejís (2022)' }, { href: '../villanueva-de-viver/', label: 'Incendio del Alto Mijares (2023)' }],
};
