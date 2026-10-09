// Datos compartidos de los eventos: adicionales disponibles y reglas de horario y cantidad de personas.

const ADICIONALES = [
  'Fotógrafo',
  'Disc Jockey',
  'Maquilladora',
  'Maquillaje artístico',
  'Cabina fotográfica',
  'Cabina 360°',
  'Robot',
  'Plaza blanda',
  'Glitter',
  'Barra',
  'Catering',
  'Menú Infantil',
  'Souvenirs (Velas)'
];

// Horas exactas o y media: 00:00, 00:30, ... 23:30
const horaValida = h => typeof h === 'string' && /^([01]\d|2[0-3]):(00|30)$/.test(h);

// Minutos entre inicio y fin. Si el fin es menor, el evento sigue después de medianoche.
function minutosEntre(inicio, fin) {
  const a = Number(inicio.slice(0, 2)) * 60 + Number(inicio.slice(3, 5));
  const b = Number(fin.slice(0, 2)) * 60 + Number(fin.slice(3, 5));
  return (b - a + 1440) % 1440;
}

// "6 horas", "2 horas y 30 minutos", "30 minutos"
function duracionTexto(inicio, fin) {
  if (!horaValida(inicio) || !horaValida(fin)) return '-';
  const m = minutosEntre(inicio, fin);
  if (!m) return '-';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const horas = h ? `${h} hora${h === 1 ? '' : 's'}` : '';
  const minutos = mm ? `${mm} minutos` : '';
  return [horas, minutos].filter(Boolean).join(' y ');
}

module.exports = { ADICIONALES, horaValida, minutosEntre, duracionTexto };
