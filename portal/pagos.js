const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const auth = require('./auth');

const DIR_COMPROBANTES = path.join(__dirname, 'data', 'comprobantes');
fs.mkdirSync(DIR_COMPROBANTES, { recursive: true });

const TIPOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};

const esFechaHora = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) && !isNaN(Date.parse(s.replace(' ', 'T')));
const hoyLocal = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

function cuotasDelCliente(dni, ids) {
  const marcas = ids.map(() => '?').join(',');
  return db.prepare(`
    SELECT c.*, e.dni, e.tipo, e.fecha AS evento_fecha
    FROM cuotas c JOIN eventos e ON e.id = c.evento_id
    WHERE c.id IN (${marcas}) AND e.dni = ?`).all(...ids, dni);
}

module.exports = function registrarPagos(app) {
  // ---------- Cliente: informar pago con comprobante ----------
  // El cuerpo es el archivo (imagen o PDF). Los datos van en el encabezado X-Pago-Datos (JSON).
  app.post('/api/pagos',
    auth.exigir('cliente'),
    express.raw({ type: Object.keys(TIPOS), limit: '6mb' }),
    (req, res) => {
      let datos;
      try { datos = JSON.parse(req.headers['x-pago-datos'] || '{}'); }
      catch { return res.status(400).json({ error: 'Datos del pago inválidos' }); }

      const ids = Array.isArray(datos.cuota_ids) ? datos.cuota_ids.map(Number).filter(Number.isInteger) : [];
      if (!ids.length) return res.status(400).json({ error: 'Elegí al menos una cuota' });
      if (!esFechaHora(datos.fecha_transferencia)) return res.status(400).json({ error: 'Indicá fecha y hora de la transferencia' });
      if (!TIPOS[req.headers['content-type']]) return res.status(400).json({ error: 'El comprobante debe ser JPG, PNG, WEBP o PDF' });
      if (!req.body || !req.body.length) return res.status(400).json({ error: 'Falta adjuntar el comprobante' });

      const cuotas = cuotasDelCliente(req.sesion.dni, ids);
      if (cuotas.length !== ids.length) return res.status(400).json({ error: 'Alguna cuota no existe' });
      if (cuotas.some(c => c.pagada)) return res.status(400).json({ error: 'Alguna cuota ya está pagada' });
      if (cuotas.some(c => c.pago_id)) return res.status(400).json({ error: 'Alguna cuota ya tiene un pago en revisión' });

      const total = Math.round(cuotas.reduce((s, c) => s + c.monto, 0) * 100) / 100;
      const declarado = Math.round(Number(datos.monto) * 100) / 100;
      if (Math.abs(total - declarado) > 0.01) {
        return res.status(400).json({ error: `El monto debe ser la suma de las cuotas elegidas ($ ${total})` });
      }

      const nombre = crypto.randomBytes(16).toString('hex') + '.' + TIPOS[req.headers['content-type']];
      fs.writeFileSync(path.join(DIR_COMPROBANTES, nombre), req.body);

      db.exec('BEGIN');
      try {
        const r = db.prepare(`INSERT INTO pagos (dni, monto, fecha_transferencia, comprobante, mime)
                              VALUES (?, ?, ?, ?, ?)`)
          .run(req.sesion.dni, total, datos.fecha_transferencia, nombre, req.headers['content-type']);
        const marcar = db.prepare('UPDATE cuotas SET pago_id = ? WHERE id = ?');
        ids.forEach(id => marcar.run(r.lastInsertRowid, id));
        db.exec('COMMIT');
        res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
      } catch (err) {
        db.exec('ROLLBACK');
        fs.unlinkSync(path.join(DIR_COMPROBANTES, nombre));
        console.error(err);
        res.status(500).json({ error: 'No se pudo registrar el pago' });
      }
    });

  // Comprobante: lo puede ver el administrador o el cliente dueño del pago
  function enviarComprobante(req, res, pago) {
    const archivo = path.join(DIR_COMPROBANTES, path.basename(pago.comprobante));
    if (!fs.existsSync(archivo)) return res.status(404).json({ error: 'Comprobante no encontrado' });
    res.setHeader('Content-Type', pago.mime);
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(archivo).pipe(res);
  }

  app.get('/api/pagos/:id/comprobante', auth.exigir('cliente'), (req, res) => {
    const pago = db.prepare('SELECT * FROM pagos WHERE id = ? AND dni = ?').get(Number(req.params.id), req.sesion.dni);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    enviarComprobante(req, res, pago);
  });

  // ---------- Administrador ----------
  app.get('/api/admin/pagos', auth.exigir('admin'), (req, res) => {
    const pagos = db.prepare(`SELECT p.*, c.nombre AS cliente_nombre
                              FROM pagos p LEFT JOIN clientes c ON c.dni = p.dni
                              ORDER BY p.estado = 'pendiente' DESC, p.id DESC LIMIT 200`).all();
    const cuotasStmt = db.prepare(`SELECT c.id, c.numero, c.monto, c.vencimiento, e.tipo, e.fecha AS evento_fecha
                                   FROM cuotas c JOIN eventos e ON e.id = c.evento_id
                                   WHERE c.pago_id = ? OR (c.pagada = 1 AND c.pago_id = ?) ORDER BY c.numero`);
    res.json(pagos.map(p => ({ ...p, cuotas: cuotasStmt.all(p.id, p.id) })));
  });

  app.get('/api/admin/pagos/:id/comprobante', auth.exigir('admin'), (req, res) => {
    const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(Number(req.params.id));
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    enviarComprobante(req, res, pago);
  });

  app.post('/api/admin/pagos/:id/aprobar', auth.exigir('admin'), (req, res) => {
    const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(Number(req.params.id));
    if (!pago || pago.estado !== 'pendiente') return res.status(400).json({ error: 'El pago no está pendiente' });
    const fechaPago = (req.body || {}).fecha_pago || pago.fecha_transferencia;
    if (!esFechaHora(fechaPago)) return res.status(400).json({ error: 'Fecha de pago inválida' });

    db.exec('BEGIN');
    try {
      db.prepare(`UPDATE cuotas SET pagada = 1, fecha_pago = ? WHERE pago_id = ?`).run(fechaPago, pago.id);
      db.prepare(`UPDATE pagos SET estado = 'aprobado', revisado_en = datetime('now','localtime') WHERE id = ?`).run(pago.id);
      db.exec('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      db.exec('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'No se pudo aprobar el pago' });
    }
  });

  app.post('/api/admin/pagos/:id/rechazar', auth.exigir('admin'), (req, res) => {
    const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(Number(req.params.id));
    if (!pago || pago.estado !== 'pendiente') return res.status(400).json({ error: 'El pago no está pendiente' });
    const motivo = String((req.body || {}).motivo || 'Comprobante no válido').slice(0, 300);
    db.exec('BEGIN');
    try {
      // Las cuotas vuelven a quedar disponibles para pagar de nuevo
      db.prepare('UPDATE cuotas SET pago_id = NULL WHERE pago_id = ?').run(pago.id);
      db.prepare(`UPDATE pagos SET estado = 'rechazado', motivo = ?, revisado_en = datetime('now','localtime') WHERE id = ?`).run(motivo, pago.id);
      db.exec('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      db.exec('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'No se pudo rechazar el pago' });
    }
  });
};

module.exports.hoyLocal = hoyLocal;
