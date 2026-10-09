// Presupuestos independientes: se crean, se numeran (N° de orden) y se comparten por enlace o WhatsApp.
// Un mismo presupuesto puede enviarse a varios clientes o casos.
const crypto = require('crypto');
const db = require('./db');
const auth = require('./auth');
const { ADICIONALES, horaValida, minutosEntre } = require('./eventos-datos');
const { renderPresupuesto, pagina } = require('./documentos');

const numeroDe = id => `PRE-${String(id).padStart(4, '0')}`;
const esFechaIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const esMes = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);

// Valida y normaliza los datos enviados por el administrador
function leerPresupuesto(b, tipoValido) {
  const tipo = String(b.tipo || '').trim();
  if (!tipoValido(tipo)) return { error: 'Elegí un tipo de evento de la lista' };

  let fecha = null;
  if (b.fecha) {
    if (!esFechaIso(b.fecha)) return { error: 'Fecha inválida' };
    fecha = b.fecha;
  }

  let horario_inicio = null, horario_fin = null;
  if (b.horario_inicio || b.horario_fin) {
    if (!horaValida(b.horario_inicio) || !horaValida(b.horario_fin)) return { error: 'El horario debe ser en punto o y media' };
    if (minutosEntre(b.horario_inicio, b.horario_fin) === 0) return { error: 'El inicio y el fin no pueden ser iguales' };
    horario_inicio = b.horario_inicio;
    horario_fin = b.horario_fin;
  }

  const adultos = b.adultos === '' || b.adultos == null ? null : Number(b.adultos);
  const ninos = b.ninos === '' || b.ninos == null ? null : Number(b.ninos);
  if (adultos !== null && !(Number.isInteger(adultos) && adultos >= 0)) return { error: 'Cantidad de adultos inválida' };
  if (ninos !== null && !(Number.isInteger(ninos) && ninos >= 0)) return { error: 'Cantidad de niños inválida' };

  const elegidos = Array.isArray(b.adicionales) ? b.adicionales : (b.adicionales ? [b.adicionales] : []);
  if (!elegidos.every(a => ADICIONALES.includes(a))) return { error: 'Hay un adicional que no está en la lista' };

  const valor = Number(b.valor_final);
  const sena = Number(b.sena || 0);
  if (b.valor_final === '' || b.valor_final == null || !(valor >= 0)) return { error: 'Indicá el valor final' };
  if (!(sena >= 0)) return { error: 'La seña no es válida' };

  const cuotas = Array.isArray(b.cuotas) ? b.cuotas : [];
  const cuotasNorm = [];
  for (const c of cuotas) {
    const monto = Number(c.monto);
    if (!(monto >= 0) || !esMes(c.mes)) return { error: 'Cada cuota necesita un monto y un mes (AAAA-MM)' };
    cuotasNorm.push({ monto, mes: c.mes });
  }

  return {
    datos: {
      cliente_nombre: String(b.cliente_nombre || '').trim().slice(0, 120) || null,
      tipo,
      fecha,
      horario_inicio,
      horario_fin,
      adultos,
      ninos,
      adicionales: elegidos.join(', '),
      sena,
      valor_final: valor,
      cuotas: JSON.stringify(cuotasNorm)
    }
  };
}

function presupuestoDesdeFila(f) {
  return {
    id: f.id,
    numero: numeroDe(f.id),
    token: f.token,
    cliente_nombre: f.cliente_nombre,
    tipo: f.tipo,
    fecha: f.fecha,
    horario_inicio: f.horario_inicio,
    horario_fin: f.horario_fin,
    adultos: f.adultos,
    ninos: f.ninos,
    adicionales: f.adicionales,
    sena: f.sena,
    valor_final: f.valor_final,
    cuotas: JSON.parse(f.cuotas || '[]'),
    creado_en: f.creado_en,
    actualizado_en: f.actualizado_en
  };
}

// HTML del presupuesto con los datos guardados
function htmlDePresupuesto(p) {
  const cuotas = p.cuotas.map((c, i) => ({ numero: i + 1, mes: c.mes, monto: c.monto }));
  return pagina(`Presupuesto ${p.numero}`, renderPresupuesto({
    numero: p.numero,
    cliente: p.cliente_nombre ? { nombre: p.cliente_nombre } : null,
    datos: p,
    cuotas
  }));
}

module.exports = function registrarPresupuestos(app, { tipoValido }) {
  app.get('/api/admin/presupuestos', auth.exigir('admin'), (req, res) => {
    const q = String(req.query.q || '').trim().toUpperCase().replace(/^PRE-?/, '').replace(/^0+/, '');
    const filas = db.prepare('SELECT * FROM presupuestos ORDER BY id DESC').all().map(presupuestoDesdeFila);
    const filtradas = q
      ? filas.filter(p => String(p.id) === q || (p.cliente_nombre || '').toUpperCase().includes(q) || p.tipo.toUpperCase().includes(q))
      : filas;
    res.json(filtradas.map(p => ({
      id: p.id, numero: p.numero, cliente_nombre: p.cliente_nombre, tipo: p.tipo, fecha: p.fecha,
      valor_final: p.valor_final, actualizado_en: p.actualizado_en
    })));
  });

  app.get('/api/admin/presupuestos/:id', auth.exigir('admin'), (req, res) => {
    const f = db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(Number(req.params.id));
    if (!f) return res.status(404).json({ error: 'Presupuesto no encontrado' });
    res.json(presupuestoDesdeFila(f));
  });

  app.post('/api/admin/presupuestos', auth.exigir('admin'), (req, res) => {
    const { datos, error } = leerPresupuesto(req.body || {}, tipoValido);
    if (error) return res.status(400).json({ error });
    const token = crypto.randomBytes(12).toString('hex');
    const r = db.prepare(`INSERT INTO presupuestos (token, cliente_nombre, tipo, fecha, horario_inicio, horario_fin,
                            adultos, ninos, adicionales, sena, valor_final, cuotas)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(token, datos.cliente_nombre, datos.tipo, datos.fecha, datos.horario_inicio, datos.horario_fin,
        datos.adultos, datos.ninos, datos.adicionales, datos.sena, datos.valor_final, datos.cuotas);
    const id = Number(r.lastInsertRowid);
    res.status(201).json({ ok: true, id, numero: numeroDe(id), token });
  });

  app.put('/api/admin/presupuestos/:id', auth.exigir('admin'), (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM presupuestos WHERE id = ?').get(id)) return res.status(404).json({ error: 'Presupuesto no encontrado' });
    const { datos, error } = leerPresupuesto(req.body || {}, tipoValido);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE presupuestos SET cliente_nombre = ?, tipo = ?, fecha = ?, horario_inicio = ?, horario_fin = ?,
                  adultos = ?, ninos = ?, adicionales = ?, sena = ?, valor_final = ?, cuotas = ?,
                  actualizado_en = datetime('now','localtime')
                WHERE id = ?`)
      .run(datos.cliente_nombre, datos.tipo, datos.fecha, datos.horario_inicio, datos.horario_fin,
        datos.adultos, datos.ninos, datos.adicionales, datos.sena, datos.valor_final, datos.cuotas, id);
    res.json({ ok: true });
  });

  app.delete('/api/admin/presupuestos/:id', auth.exigir('admin'), (req, res) => {
    db.prepare('DELETE FROM presupuestos WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Vista del presupuesto para el administrador (mismo documento que ve el cliente)
  app.get('/api/admin/presupuestos/:id/html', auth.exigir('admin'), (req, res) => {
    const f = db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(Number(req.params.id));
    if (!f) return res.status(404).json({ error: 'Presupuesto no encontrado' });
    res.type('html').send(htmlDePresupuesto(presupuestoDesdeFila(f)));
  });

  // Enlace público para compartir: no pide ingreso; sólo se llega con el enlace completo
  app.get('/api/presupuestos/publico/:token', (req, res) => {
    const f = db.prepare('SELECT * FROM presupuestos WHERE token = ?').get(String(req.params.token));
    if (!f) return res.status(404).type('html').send(pagina('Presupuesto no encontrado', '<p>Este enlace no es válido o el presupuesto ya no existe.</p>'));
    res.type('html').send(htmlDePresupuesto(presupuestoDesdeFila(f)));
  });
};
