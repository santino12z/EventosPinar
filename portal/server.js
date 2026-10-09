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
app.use(express.static(path.join(__dirname, 'public')));
app.get(['/', '/index.html'], (req, res) => res.redirect('/ingreso.html'));

// ---------- Utilidades ----------
const ahoraLocal = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date()).replace('T', ' ');

const hoyLocal = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());

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
  const cuotasStmt = db.prepare('SELECT * FROM cuotas WHERE evento_id = ? ORDER BY numero');
  return eventos.map(e => ({
    ...e,
    cuotas: cuotasStmt.all(e.id).map(c => ({ ...c, pagada: !!c.pagada }))
  }));
}

// ---------- Cliente ----------
app.post('/api/registro', (req, res) => {
  const { nombre, dni, mail, password } = req.body || {};
  if (!nombre || String(nombre).trim().length < 3) return res.status(400).json({ error: 'Ingresá tu nombre completo' });
  if (!esDni(String(dni || ''))) return res.status(400).json({ error: 'El DNI debe tener 7 u 8 números' });
  if (!esMail(String(mail || ''))) return res.status(400).json({ error: 'Mail inválido' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  const existe = db.prepare('SELECT id FROM clientes WHERE dni = ? OR mail = ?').get(String(dni), String(mail).toLowerCase());
  if (existe) return res.status(409).json({ error: 'Ya existe una cuenta con ese DNI o mail' });

  db.prepare('INSERT INTO clientes (nombre, dni, mail, password_hash) VALUES (?, ?, ?, ?)')
    .run(String(nombre).trim(), String(dni), String(mail).toLowerCase(), auth.hashPassword(String(password)));

  const token = auth.crearSesion('cliente', String(dni));
  auth.setCookie(res, token, req);
  res.status(201).json({ ok: true, token });
});

app.post('/api/login', (req, res) => {
  const { dni, password } = req.body || {};
  const cliente = db.prepare('SELECT * FROM clientes WHERE dni = ?').get(String(dni || '').trim());
  if (!cliente || !auth.verifyPassword(String(password || ''), cliente.password_hash)) {
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

app.get('/api/admin/sesion', auth.exigir('admin'), (req, res) => res.json({ ok: true }));

app.get('/api/admin/eventos', auth.exigir('admin'), (req, res) => {
  const nombreStmt = db.prepare('SELECT nombre FROM clientes WHERE dni = ?');
  const eventos = eventosConCuotas().map(e => {
    const c = nombreStmt.get(e.dni);
    return { ...e, cliente_nombre: c ? c.nombre : null };
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
  if (!b.tipo || !String(b.tipo).trim()) return res.status(400).json({ error: 'Falta el tipo de evento' });
  if (!esFecha(b.fecha)) return res.status(400).json({ error: 'Fecha del evento inválida' });
  if (sena === null || valor === null) return res.status(400).json({ error: 'Seña y valor final deben ser números válidos' });
  for (const c of cuotas) {
    if (numero(Number(c.monto)) === null || !esFecha(c.vencimiento)) {
      return res.status(400).json({ error: 'Cada cuota necesita monto y fecha de vencimiento válidos' });
    }
  }

  db.exec('BEGIN');
  try {
    const r = db.prepare(`INSERT INTO eventos (dni, tipo, fecha, sena, adicionales, valor_final)
                          VALUES (?, ?, ?, ?, ?, ?)`)
      .run(dni, String(b.tipo).trim(), b.fecha, sena, String(b.adicionales || ''), valor);
    const insCuota = db.prepare('INSERT INTO cuotas (evento_id, numero, monto, vencimiento) VALUES (?, ?, ?, ?)');
    cuotas.forEach((c, i) => insCuota.run(r.lastInsertRowid, i + 1, Number(c.monto), c.vencimiento));
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Portal de Eventos Pinar en http://0.0.0.0:${PORT}`);
});
