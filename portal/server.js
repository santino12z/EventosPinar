const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const auth = require('./auth');

const PORT = process.env.PORT || 3000;
const TZ = 'America/Argentina/Buenos_Aires';

// Contraseña del administrador: variable de entorno ADMIN_PASSWORD.
// Si no existe, se genera una al iniciar y se muestra en la consola.
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = crypto.randomBytes(9).toString('base64url');
  console.warn('\n⚠️  ADMIN_PASSWORD no definida. Contraseña temporal de administrador:', ADMIN_PASSWORD, '\n');
}

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache')
}));
app.get(['/', '/index.html'], (req, res) => res.redirect('/ingreso.html'));

// ---------- Utilidades ----------
const ahoraLocal = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date()).replace('T', ' ');

const hoyLocal = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());

const TIPOS_EVENTO = [
  'Baby Shower', 'Bautismo', 'Comunion', 'Primer Año', 'Evento Infantil (2 a 12 años)',
  'Quince Años', '18 Años', 'Casamiento', 'Cumpleaños', 'Egresados', 'Otro'
];
const tipoValido = t => TIPOS_EVENTO.includes(t) || (t.startsWith('Otro: ') && t.length > 7 && t.length <= 120);

// Último día del mes AAAA-MM: fecha límite para pagar la cuota de ese mes
function ultimoDiaDelMes(mes) {
  const [anio, m] = mes.split('-').map(Number);
  const dia = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return `${mes}-${String(dia).padStart(2, '0')}`;
}

const esFecha = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const esDni = s => /^\d{7,8}$/.test(s);
const esMail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const numero = v => (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null;

function compararSecreto(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function eventosConCuotas(where = '', params = []) {
  const eventos = db.prepare(`SELECT * FROM eventos ${where} ORDER BY fecha DESC, id DESC`).all(...params);
  const cuotasStmt = db.prepare(`SELECT c.*, p.estado AS pago_estado, p.motivo AS pago_motivo
                                 FROM cuotas c LEFT JOIN pagos p ON p.id = c.pago_id
                                 WHERE c.evento_id = ? ORDER BY c.numero`);
  return eventos.map(e => ({
    ...e,
    cuotas: cuotasStmt.all(e.id).map(c => ({ ...c, pagada: !!c.pagada }))
  }));
}

// ---------- Cliente ----------
app.post('/api/registro', (req, res) => {
  const { nombre, dni, mail } = req.body || {};
  if (!nombre || String(nombre).trim().length < 3) return res.status(400).json({ error: 'Ingresá tu nombre completo' });
  if (!esDni(String(dni || ''))) return res.status(400).json({ error: 'El DNI debe tener 7 u 8 números' });
  if (!esMail(String(mail || ''))) return res.status(400).json({ error: 'Mail inválido' });
  const telefono = String(req.body.telefono || '').replace(/[\s+\-()]/g, '');
  if (!/^54\d{10,13}$/.test(telefono)) return res.status(400).json({ error: 'Teléfono inválido. Usá el formato 54 + código de área + número, por ejemplo 5491134334894' });

  const existe = db.prepare('SELECT id FROM clientes WHERE dni = ? OR mail = ?').get(String(dni), String(mail).toLowerCase());
  if (existe) return res.status(409).json({ error: 'Ya existe una cuenta con ese DNI o mail' });

  db.prepare('INSERT INTO clientes (nombre, dni, mail, password_hash, telefono) VALUES (?, ?, ?, ?, ?)')
    .run(String(nombre).trim(), String(dni), String(mail).toLowerCase(), auth.hashPassword(String(dni)), telefono);

  const token = auth.crearSesion('cliente', String(dni));
  auth.setCookie(res, token, req);
  res.status(201).json({ ok: true, token });
});

app.post('/api/login', (req, res) => {
  const { dni, password } = req.body || {};
  // Ingreso de clientes: usuario = DNI y contraseña = DNI
  const cliente = db.prepare('SELECT * FROM clientes WHERE dni = ?').get(String(dni || '').trim());
  if (!cliente || String(password || '').trim() !== cliente.dni) {
    return res.status(401).json({ error: 'DNI o contraseña incorrectos' });
  }
  const token = auth.crearSesion('cliente', cliente.dni);
  auth.setCookie(res, token, req);
  res.json({ ok: true, token });
});

app.post('/api/logout', (req, res) => {
  auth.borrarSesion(auth.leerToken(req));
  auth.clearCookie(res, req);
  res.json({ ok: true });
});

app.get('/api/me', auth.exigir('cliente'), (req, res) => {
  const c = db.prepare('SELECT nombre, dni, mail FROM clientes WHERE dni = ?').get(req.sesion.dni);
  if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(c);
});

app.get('/api/mis-eventos', auth.exigir('cliente'), (req, res) => {
  const eventos = eventosConCuotas('WHERE dni = ?', [req.sesion.dni]);
  const hoy = hoyLocal();
  res.json({
    hoy,
    proximos: eventos.filter(e => e.fecha >= hoy),
    historial: eventos.filter(e => e.fecha < hoy)
  });
});

// ---------- Administrador ----------
app.post('/api/admin/login', (req, res) => {
  const pass = String((req.body || {}).password || '');
  if (!compararSecreto(pass, ADMIN_PASSWORD)) return res.status(401).json({ error: 'Contraseña incorrecta' });
  const token = auth.crearSesion('admin');
  auth.setCookie(res, token, req);
  res.json({ ok: true, token });
});

app.get('/api/admin/tipos-evento', auth.exigir('admin'), (req, res) => res.json(TIPOS_EVENTO));
app.get('/api/admin/adicionales', auth.exigir('admin'), (req, res) => res.json(ADICIONALES));

app.get('/api/admin/sesion', auth.exigir('admin'), (req, res) => res.json({ ok: true }));

app.get('/api/admin/eventos', auth.exigir('admin'), (req, res) => {
  const nombreStmt = db.prepare('SELECT nombre, mail, telefono FROM clientes WHERE dni = ?');
  const eventos = eventosConCuotas().map(e => {
    const c = nombreStmt.get(e.dni);
    return { ...e, cliente_nombre: c ? c.nombre : null, cliente_mail: c ? c.mail : null, cliente_telefono: c ? c.telefono : null };
  });
  res.json(eventos);
});

app.post('/api/admin/eventos', auth.exigir('admin'), (req, res) => {
  const b = req.body || {};
  const dni = String(b.dni || '');
  const sena = numero(Number(b.sena));
  const valor = numero(Number(b.valor_final));
  const cuotas = Array.isArray(b.cuotas) ? b.cuotas : [];

  if (!esDni(dni)) return res.status(400).json({ error: 'DNI inválido' });
  const tipo = String(b.tipo || '').trim();
  if (!tipoValido(tipo)) return res.status(400).json({ error: 'Elegí un tipo de evento de la lista' });
  if (!esFecha(b.fecha)) return res.status(400).json({ error: 'Fecha del evento inválida' });
  if (sena === null || valor === null) return res.status(400).json({ error: 'Seña y valor final deben ser números válidos' });
  if (!horaValida(b.horario_inicio) || !horaValida(b.horario_fin)) return res.status(400).json({ error: 'El horario debe ser en punto o y media (ej: 20:00 o 20:30)' });
  if (minutosEntre(b.horario_inicio, b.horario_fin) === 0) return res.status(400).json({ error: 'El horario de inicio y fin no pueden ser iguales' });
  const adultos = Number.isInteger(Number(b.adultos)) && Number(b.adultos) >= 0 ? Number(b.adultos) : null;
  const ninos = Number.isInteger(Number(b.ninos)) && Number(b.ninos) >= 0 ? Number(b.ninos) : null;
  if (adultos === null || ninos === null) return res.status(400).json({ error: 'Cantidad de adultos y niños inválida' });
  const elegidos = Array.isArray(b.adicionales) ? b.adicionales : (b.adicionales ? [b.adicionales] : []);
  if (!elegidos.every(a => ADICIONALES.includes(a))) return res.status(400).json({ error: 'Hay un adicional que no está en la lista' });
  const adicionales = elegidos.join(', ');
  const cuotasNorm = [];
  for (const c of cuotas) {
    const mes = typeof c.mes === 'string' && /^\d{4}-\d{2}$/.test(c.mes) ? c.mes : null;
    if (numero(Number(c.monto)) === null || !mes) {
      return res.status(400).json({ error: 'Cada cuota necesita un monto y un mes (AAAA-MM)' });
    }
    cuotasNorm.push({ monto: Number(c.monto), mes, vencimiento: ultimoDiaDelMes(mes) });
  }

  db.exec('BEGIN');
  try {
    const r = db.prepare(`INSERT INTO eventos (dni, tipo, fecha, sena, adicionales, valor_final,
                                               horario_inicio, horario_fin, adultos, ninos)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(dni, tipo, b.fecha, sena, adicionales, valor, b.horario_inicio, b.horario_fin, adultos, ninos);
        const insCuotaMes = db.prepare('INSERT INTO cuotas (evento_id, numero, monto, vencimiento, mes) VALUES (?, ?, ?, ?, ?)');
    cuotasNorm.forEach((c, i) => insCuotaMes.run(r.lastInsertRowid, i + 1, c.monto, c.vencimiento, c.mes));
    db.exec('COMMIT');
    res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar el evento' });
  }
});

app.delete('/api/admin/eventos/:id', auth.exigir('admin'), (req, res) => {
  db.prepare('DELETE FROM eventos WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/cuotas/:id/pagar', auth.exigir('admin'), (req, res) => {
  const enviada = (req.body || {}).fecha_pago;
  const fechaPago = enviada
    ? String(enviada).replace('T', ' ').slice(0, 16)
    : ahoraLocal().slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fechaPago) || isNaN(Date.parse(fechaPago.replace(' ', 'T')))) {
    return res.status(400).json({ error: 'Fecha de pago inválida (usá AAAA-MM-DD HH:MM)' });
  }
  const r = db.prepare('UPDATE cuotas SET pagada = 1, fecha_pago = ? WHERE id = ?').run(fechaPago, Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'Cuota no encontrada' });
  res.json({ ok: true, fecha_pago: fechaPago });
});

app.post('/api/admin/cuotas/:id/desmarcar', auth.exigir('admin'), (req, res) => {
  db.prepare('UPDATE cuotas SET pagada = 0, fecha_pago = NULL WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

require('./pagos')(app);

const whatsapp = require('./whatsapp');
const { ADICIONALES, horaValida, minutosEntre } = require('./eventos-datos');
require('./documentos')(app);
require('./presupuestos')(app, { tipoValido });

// Buscador de clientes (todos, o filtrados por nombre, DNI, mail o teléfono)
app.get('/api/admin/clientes', auth.exigir('admin'), (req, res) => {
  const q = String(req.query.q || '').trim();
  const like = `%${q}%`;
  res.json(db.prepare(`
    SELECT c.nombre, c.dni, c.mail, c.telefono,
           (SELECT COUNT(*) FROM eventos e WHERE e.dni = c.dni) AS eventos
    FROM clientes c
    WHERE ? = '' OR c.nombre LIKE ? OR c.dni LIKE ? OR c.mail LIKE ? OR c.telefono LIKE ?
    ORDER BY c.nombre LIMIT 300`).all(q, like, like, like, like));
});

// Ficha completa de un cliente: datos, eventos con cuotas, pagos y mensajes
app.get('/api/admin/clientes/:dni', auth.exigir('admin'), (req, res) => {
  const dni = String(req.params.dni);
  const cliente = db.prepare('SELECT nombre, dni, mail, telefono, creado_en FROM clientes WHERE dni = ?').get(dni);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({
    cliente,
    eventos: eventosConCuotas('WHERE dni = ?', [dni]),
    pagos: db.prepare(`SELECT id, monto, fecha_transferencia, estado, motivo, creado_en, mime
                       FROM pagos WHERE dni = ? ORDER BY id DESC`).all(dni),
    mensajes: db.prepare(`SELECT m.id, m.tipo, m.estado, m.error, m.enviado_en, c.mes, c.monto
                          FROM mensajes m LEFT JOIN cuotas c ON c.id = m.cuota_id
                          WHERE m.dni = ? ORDER BY m.id DESC`).all(dni)
  });
});

app.post('/api/admin/atrasos/revisar', auth.exigir('admin'), async (req, res) => {
  const a = await whatsapp.revisarAtrasos();
  const b = await whatsapp.reintentarPendientes();
  res.json({ ok: true, ...a, reintentos: b });
});

app.get('/api/admin/mensajes', auth.exigir('admin'), (req, res) => {
  res.json(db.prepare(`SELECT m.*, c.numero, c.mes, c.monto, cl.nombre
                       FROM mensajes m
                       LEFT JOIN cuotas c ON c.id = m.cuota_id
                       LEFT JOIN clientes cl ON cl.dni = m.dni
                       ORDER BY m.id DESC LIMIT 200`).all());
});

app.put('/api/admin/clientes/:dni/telefono', auth.exigir('admin'), (req, res) => {
  const telefono = String((req.body || {}).telefono || '').replace(/[\s+\-()]/g, '');
  if (!/^54\d{10,13}$/.test(telefono)) return res.status(400).json({ error: 'Teléfono inválido. Formato: 54 + código de área + número' });
  const r = db.prepare('UPDATE clientes SET telefono = ? WHERE dni = ?').run(telefono, String(req.params.dni));
  if (!r.changes) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ ok: true });
});

// Revisión automática cada hora
setTimeout(() => {
  whatsapp.revisarAtrasos().catch(console.error);
}, 5000);
setInterval(() => {
  whatsapp.revisarAtrasos().then(() => whatsapp.reintentarPendientes()).catch(console.error);
}, 60 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Portal de Eventos Pinar en http://0.0.0.0:${PORT}`);
});
