// Contrato y presupuesto de cada evento, generados con los datos cargados en el sistema.
// Cliente: solo sus propios eventos. Administrador: cualquier evento.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const auth = require('./auth');

const PLANTILLA = path.join(__dirname, 'contrato', 'CONTRATO_PLANTILLA.md');
const DATOS = path.join(__dirname, 'contrato', 'datos_salon.json');
const FALTA = '[completar]';
const { duracionTexto } = require('./eventos-datos');


const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const money = n => '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const fechaLarga = iso => { if (!iso) return '-'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const nombreMes = mes => { if (!mes) return '-'; const [a, m] = mes.split('-').map(Number); return `${MESES[m - 1]} de ${a}`; };
const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyLocal = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

function datosSalon() {
  return JSON.parse(fs.readFileSync(DATOS, 'utf8'));
}

// Evento con sus cuotas y pagos, o null si no existe
function cargarEvento(id) {
  const e = db.prepare(`SELECT e.*, c.nombre AS cliente_nombre, c.mail AS cliente_mail
                        FROM eventos e LEFT JOIN clientes c ON c.dni = e.dni WHERE e.id = ?`).get(id);
  if (!e) return null;
  e.cuotas = db.prepare('SELECT * FROM cuotas WHERE evento_id = ? ORDER BY numero').all(id);
  return e;
}

// Valor del campo del salón o marca visible si todavía no se completó
const valorSalon = (datos, clave) => (datos[clave] && String(datos[clave]).trim()) ? String(datos[clave]).trim() : null;

// Convierte la plantilla (markdown simple) en HTML, reemplazando los marcadores por los datos del evento
function contratoHtml(e) {
  const datos = datosSalon();
  const salon = k => valorSalon(datos, k);
  const sena = Number(e.sena || 0);
  const saldo = Number(e.valor_final || 0) - sena;
  const reemplazos = {
    RAZON_SOCIAL: salon('razon_social'),
    CUIT: salon('cuit'),
    DOMICILIO_SALON: salon('domicilio_salon'),
    NOMBRE_CLIENTE: e.cliente_nombre,
    DNI_CLIENTE: e.dni,
    MAIL_CLIENTE: e.cliente_mail,
    DOMICILIO_CLIENTE: '______________________________',
    NOMBRE_SALON: salon('nombre_salon'),
    TIPO_EVENTO: e.tipo,
    FECHA_EVENTO: fechaLarga(e.fecha),
    HORARIO_DESDE: e.horario_inicio,
    HORARIO_HASTA: e.horario_fin,
    ADICIONALES: e.adicionales || 'Ninguno',
    VALOR_FINAL: money(e.valor_final),
    SENA: money(sena),
    SALDO: money(saldo),
    INTERES_MORA: salon('interes_mora') && `${salon('interes_mora')}%`,
    DIAS_RESCISION: salon('dias_rescision'),
    DIAS_CANCELACION_DEVOLUCION: salon('dias_cancelacion'),
    PORCENTAJE_DEVOLUCION: salon('porcentaje_devolucion') && `${salon('porcentaje_devolucion')}%`,
    CAPACIDAD: salon('capacidad'),
    GARANTIA: salon('garantia') && money(salon('garantia')),
    DIAS_DEVOLUCION_GARANTIA: salon('dias_devolucion_garantia')
  };
  // Negritas de la plantilla (los datos ya van en negrita al reemplazarlos)
  const negritas = texto => texto.replace(/\*\*(\[[A-Z_]+\])\*\*/g, '$1').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const sustituir = texto => negritas(texto).replace(/\[([A-Z_]+)\]/g, (m, clave) => {
    if (!(clave in reemplazos)) return m;
    const v = reemplazos[clave];
    return v === null || v === undefined || v === '' ? `<span class="falta">${FALTA}</span>`
      : `<strong>${escapar(v)}</strong>`;
  });

  const md = fs.readFileSync(PLANTILLA, 'utf8');
  const [cuerpo] = md.split('**Anexo I');
  const bloques = [];
  let parrafo = [];
  const cerrarParrafo = () => { if (parrafo.length) { bloques.push(`<p>${parrafo.join('<br>')}</p>`); parrafo = []; } };

  for (const linea of cuerpo.split('\n')) {
    const t = linea.trim();
    if (t.startsWith('> ')) continue;                       // nota interna del borrador
    if (t === '') { cerrarParrafo(); continue; }
    if (t === '---') { cerrarParrafo(); bloques.push('<hr>'); continue; }
    if (t.startsWith('# ')) { cerrarParrafo(); bloques.push(`<h1>${sustituir(t.slice(2))}</h1>`); continue; }
    if (t.startsWith('## ')) { cerrarParrafo(); bloques.push(`<h2>${sustituir(t.slice(3))}</h2>`); continue; }
    if (t === '&nbsp;') { cerrarParrafo(); bloques.push('<div class="espacio"></div>'); continue; }
    parrafo.push(sustituir(t.replace(/&nbsp;/g, ' ')));
  }
  cerrarParrafo();

  return `${bloques.join('\n')}\n<h2>Anexo I – Cronograma de pagos</h2>\n${cronogramaHtml(e, sena, saldo)}`;
}

function cronogramaHtml(e, sena, saldo) {
  const filas = e.cuotas.map(c => {
    const estado = c.pagada ? `Pagada el ${fechaLarga(c.fecha_pago)} ${(c.fecha_pago || '').slice(11, 16)} hs` : 'Pendiente';
    return `<tr><td>#${c.numero}</td><td>${escapar(nombreMes(c.mes))}</td><td>${money(c.monto)}</td><td>Hasta el ${fechaLarga(c.vencimiento)}</td><td>${escapar(estado)}</td></tr>`;
  });
  const sumaCuotas = e.cuotas.reduce((s, c) => s + Number(c.monto), 0);
  const aviso = Math.abs(sumaCuotas - saldo) > 0.01
    ? `<p class="falta">Atención: la suma de las cuotas (${money(sumaCuotas)}) no coincide con el saldo (${money(saldo)}).</p>` : '';
  return `<table>
    <thead><tr><th>Cuota</th><th>Mes</th><th>Monto</th><th>Vencimiento</th><th>Estado</th></tr></thead>
    <tbody>
      <tr><td>Seña</td><td>Firma del contrato</td><td>${money(sena)}</td><td>Al firmar</td><td>-</td></tr>
      ${filas.join('\n')}
    </tbody></table>${aviso}`;
}

// Presupuesto genérico. p = {
//   numero (texto), cliente ({nombre, dni, mail} | null),
//   datos ({tipo, fecha, horario_inicio, horario_fin, adultos, ninos, adicionales, sena, valor_final}),
//   cuotas ([{numero, mes, monto, estado?}]), resumen (opcional: {pagado, pendiente})
// }
function renderPresupuesto(p) {
  const d = p.datos;
  const sena = Number(d.sena || 0);
  const valor = Number(d.valor_final || 0);
  const saldo = valor - sena;
  const adicionales = String(d.adicionales || '').split(', ').filter(Boolean);
  const horario = d.horario_inicio && d.horario_fin
    ? `${d.horario_inicio} a ${d.horario_fin} (${duracionTexto(d.horario_inicio, d.horario_fin)})` : 'Sin cargar';
  const invitados = d.adultos != null
    ? `${Number(d.adultos) + Number(d.ninos || 0)} (${d.adultos} adultos, ${Number(d.ninos || 0)} niños)` : 'Sin cargar';
  const fila = (a, b) => `<tr><td>${a}</td><td class="num">${b}</td></tr>`;
  const conEstado = p.cuotas.some(c => c.estado);
  const cuotas = p.cuotas.length
    ? `<table><thead><tr><th>Cuota</th><th>Mes</th><th>Monto</th>${conEstado ? '<th>Estado</th>' : ''}</tr></thead><tbody>
       ${p.cuotas.map(c => `<tr><td>#${c.numero}</td><td>${escapar(nombreMes(c.mes))}</td><td>${money(c.monto)}</td>${conEstado ? `<td>${escapar(c.estado)}</td>` : ''}</tr>`).join('')}
       </tbody></table>`
    : '<p>Sin cuotas cargadas.</p>';
  const sumaCuotas = p.cuotas.reduce((s, c) => s + Number(c.monto), 0);
  const aviso = p.cuotas.length && Math.abs(sumaCuotas - saldo) > 0.01
    ? `<p class="falta">Atención: la suma de las cuotas (${money(sumaCuotas)}) no coincide con el saldo (${money(saldo)}).</p>` : '';
  const cliente = p.cliente
    ? `<div class="bloque"><p><strong>Cliente:</strong> ${escapar(p.cliente.nombre || '-')}${p.cliente.dni ? ' · DNI ' + escapar(p.cliente.dni) : ''}</p>
       ${p.cliente.mail ? `<p><strong>Mail:</strong> ${escapar(p.cliente.mail)}</p>` : ''}</div>` : '';
  const resumen = p.resumen
    ? `<h2>Resumen</h2><table><tbody>${fila('Pagado hasta hoy (seña y cuotas)', money(p.resumen.pagado))}${fila('Pendiente de pago', money(p.resumen.pendiente))}</tbody></table>` : '';

  return `
  <div class="cabecera">
    <div><h1>Presupuesto</h1><p>${escapar(datosSalon().nombre_salon || 'Salón')}${datosSalon().razon_social ? ' · ' + escapar(datosSalon().razon_social) : ''}</p></div>
    <div class="derecha"><p><strong>N° ${escapar(p.numero)}</strong></p><p>Emitido: ${fechaLarga(hoyLocal())}</p></div>
  </div>
  ${cliente}
  <h2>Evento</h2>
  <table><tbody>
    ${fila('Tipo de evento', escapar(d.tipo || '-'))}
    ${fila('Fecha', d.fecha ? escapar(diaFecha(d.fecha)) : 'Sin fecha')}
    ${fila('Horario', escapar(horario))}
    ${fila('Invitados', escapar(invitados))}
  </tbody></table>
  <h2>Adicionales</h2>
  ${adicionales.length ? `<ul>${adicionales.map(a => `<li>${escapar(a)}</li>`).join('')}</ul>` : '<p>Ninguno</p>'}
  <h2>Valores</h2>
  <table><tbody>
    ${fila('Valor total', money(valor))}
    ${fila('Seña (al firmar)', money(sena))}
    ${fila('Saldo a pagar en cuotas mensuales', money(saldo))}
  </tbody></table>
  <h2>Cuotas mensuales</h2>
  ${cuotas}
  ${aviso}
  ${resumen}
  <p class="nota">Este presupuesto resume las condiciones del evento. El contrato firmado rige la relación entre las partes.</p>`;
}

// Presupuesto de un evento cargado: se arma con sus datos y el estado de cada cuota
function presupuestoEventoHtml(e) {
  const sena = Number(e.sena || 0);
  const pagado = sena + e.cuotas.filter(c => c.pagada).reduce((s, c) => s + Number(c.monto), 0);
  return renderPresupuesto({
    numero: `EVT-${String(e.id).padStart(4, '0')}`,
    cliente: { nombre: e.cliente_nombre, dni: e.dni, mail: e.cliente_mail },
    datos: e,
    cuotas: e.cuotas.map(c => ({
      numero: c.numero, mes: c.mes, monto: c.monto,
      estado: c.pagada ? `Pagada el ${fechaLarga(c.fecha_pago)} ${(c.fecha_pago || '').slice(11, 16)} hs` : 'Pendiente'
    })),
    resumen: { pagado, pendiente: Number(e.valor_final || 0) - pagado }
  });
}

// Nombre del día con la fecha: "Sábado 8 de mayo de 2027"
function diaFecha(iso) {
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DIAS[dt.getUTCDay()]} ${d} de ${MESES[m - 1]} de ${y}`;
}

const ESTILOS = `
  body{font-family:Georgia,'Times New Roman',serif;color:#222;max-width:820px;margin:0 auto;padding:28px;line-height:1.5;font-size:15px}
  h1{font-size:24px;margin:8px 0 6px} h2{font-size:17px;margin:22px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  p{margin:8px 0;text-align:justify} hr{border:0;border-top:1px solid #ccc;margin:18px 0}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:14px}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#e8f5e9} td.num{text-align:right;white-space:nowrap}
  .cabecera{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
  .derecha{text-align:right} .bloque{background:#f4faf4;padding:10px 14px;border-radius:6px;margin-top:12px}
  .falta{color:#b00020;background:#fdecef;padding:0 3px;border-radius:3px}
  .espacio{height:18px} .nota{font-size:12px;color:#666;margin-top:24px}
  @media print{ body{padding:0} .noimprimir{display:none} }`;

function pagina(titulo, cuerpo) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(titulo)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"><style>${ESTILOS}</style></head>
  <body><div class="noimprimir" style="text-align:right"><button onclick="window.print()">Imprimir / guardar PDF</button></div>
  ${cuerpo}</body></html>`;
}

function enviarDocumento(res, evento, tipo) {
  const titulo = tipo === 'contrato' ? 'Contrato' : 'Presupuesto';
  const cuerpo = tipo === 'contrato' ? contratoHtml(evento) : presupuestoEventoHtml(evento);
  res.type('html').send(pagina(`${titulo} · ${evento.tipo} ${fechaLarga(evento.fecha)}`, cuerpo));
}

module.exports = function registrarDocumentos(app) {
  // (las rutas de documentos de eventos)
  // Cliente: solo sus eventos
  for (const tipo of ['contrato', 'presupuesto']) {
    app.get(`/api/mis-eventos/:id/${tipo}`, auth.exigir('cliente'), (req, res) => {
      const evento = cargarEvento(Number(req.params.id));
      if (!evento || evento.dni !== req.sesion.dni) return res.status(404).json({ error: 'Evento no encontrado' });
      enviarDocumento(res, evento, tipo);
    });
    // Administrador: cualquier evento
    app.get(`/api/admin/eventos/:id/${tipo}`, auth.exigir('admin'), (req, res) => {
      const evento = cargarEvento(Number(req.params.id));
      if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });
      enviarDocumento(res, evento, tipo);
    });
  }
};

module.exports.pagina = pagina;
module.exports.renderPresupuesto = renderPresupuesto;
module.exports.diaFecha = diaFecha;
