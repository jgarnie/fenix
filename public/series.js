// Vegetación potencial: clases comunes a todos los incendios (mismas claves que POT en scripts/build_data.py).
// Qué serie toca en cada píxel: Mapa de Series de Vegetación de España (Rivas-Martínez 1987), MITECO.
// Especies: las que nombra la descripción oficial de cada serie en la revisión de 2011
// (Rivas-Martínez et al., Itinera Geobotanica 18(1): 5-424). La memoria no da listas de plantación.

export const POT_INFO = {
  1: {
    corto: 'Alcornocal',
    codigo: '23b',
    serie: 'Meso-termomediterránea valenciano-castellonense subhúmeda del alcornoque (Asplenio onopteridis–Querceto suberis sigmetum)',
    piso: 'Mesomediterráneo, sobre suelos silíceos (rodeno)',
    especies: 'Quercus suber, Asplenium onopteris, Quercus rotundifolia, Calicotome spinosa',
    revision: 'En la revisión de 2011 sigue siendo la serie 23b, silicícola, con una faciación mesomediterránea típica y otra termomediterránea con Chamaerops humilis.',
    color: '#d95f02',
  },
  2: {
    corto: 'Carrascal termomediterráneo',
    codigo: '27c',
    serie: 'Termomediterránea valenciano-tarraconense, murciano-almeriense e ibicenca basófila de la encina (Rubio longifoliae–Querceto rotundifoliae sigmetum)',
    piso: 'Termomediterráneo, sobre calizas',
    especies: 'Quercus rotundifolia, Rubia longifolia, Pistacia lentiscus, Erica multiflora',
    revision: 'En 2011 se amplía al mesomediterráneo inferior, con faciaciones de Chamaerops humilis (termomediterránea), de Pistacia lentiscus (mesomediterránea termófila) y de Calicotome spinosa (sobre areniscas del rodeno).',
    color: '#e6ab02',
  },
  3: {
    corto: 'Carrascal mesomediterráneo',
    codigo: '22b',
    serie: 'Mesomediterránea manchega y aragonesa basófila de la encina (Bupleuro rigidi–Querceto rotundifoliae sigmetum)',
    piso: 'Mesomediterráneo, sobre calizas',
    especies: 'Quercus rotundifolia, Hedera helix, Teline patens, Genista hispanica',
    especiesNota: 'de la serie 22d de la revisión de 2011',
    revision: 'El mapa de 1987 asigna esta zona a la serie manchega y aragonesa (22b). La revisión de 2011 describe los carrascales valencianos de este piso como una serie propia, la 22d (Hedero helicis–Querco rotundifoliae sigmetum), con faciaciones altopalanciana y turiana septentrional silicícola. Las especies indicadas son las de esa serie 22d.',
    color: '#00582a',
  },
  4: {
    corto: 'Carrascal supramediterráneo con sabina albar',
    codigo: '22a',
    serie: 'Supramediterránea castellano-maestrazgo-manchega basófila de la encina (Junipero thuriferae–Querceto rotundifoliae sigmetum)',
    piso: 'Supramediterráneo, sobre calizas',
    especies: 'Quercus rotundifolia, Juniperus thurifera, Rhamnus infectoria, Satureja gracilis',
    revision: 'Se mantiene en 2011 (22a), con faciaciones ibérico-maestracenses de Juniperus sabina y otra termófila con Quercus coccifera.',
    color: '#7570b3',
  },
  5: {
    corto: 'Sabinar albar',
    codigo: '15b',
    serie: 'Supramediterránea maestracense y celtibérico-alcarreña de la sabina albar (Junipereto hemisphaerico-thuriferae sigmetum)',
    piso: 'Supramediterráneo',
    especies: 'Juniperus thurifera, Juniperus hemisphaerica, Artemisia assoana, Festuca asperifolia',
    revision: 'Se mantiene en 2011 (15b), con una faciación típica calcícola de Juniperus hemisphaerica.',
    color: '#a6761d',
  },
  6: {
    corto: 'Vegetación de ribera',
    codigo: 'I',
    serie: 'Geomegaseries riparias mediterráneas',
    piso: 'Fondos de valle y cauces (también donde el Mapa Forestal indica bosque de ribera)',
    especies: '',
    revision: 'El mapa de 1987 no detalla las especies de las riberas.',
    color: '#1f78b4',
  },
  7: { corto: 'Uso no forestal', codigo: '', serie: 'Cultivos, núcleos urbanos, infraestructuras o agua (según el Mapa Forestal)', piso: '', especies: '', revision: '', color: '#d9d9d9' },
  8: {
    corto: 'Coscojar semiárido',
    codigo: '29b',
    serie: 'Mesomediterránea semiárida de la coscoja (Rhamno lycioidis–Querceto cocciferae sigmetum)',
    piso: 'Mesomediterráneo semiárido',
    especies: 'Quercus coccifera, Rhamnus lycioides',
    revision: '',
    color: '#c51b7d',
  },
};
