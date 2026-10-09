// Recordatorios de cuotas atrasadas por WhatsApp (WhatsApp Cloud API de Meta).
//
// Configuración (variables de entorno):
//   WA_TOKEN            token de acceso de la app de Meta
//   WA_PHONE_NUMBER_ID  ID del número de WhatsApp Business
//   WA_TEMPLATE         nombre de la plantilla aprobada por Meta (por defecto "cuota_atrasada")
//   WA_LANGUAGE         idioma de la plantilla (por defecto "es_AR")
//
// La plantilla debe tener 4 variables, en este orden:
//   {{1}} nombre del cliente, {{2}} mes de la cuota, {{3}} monto, {{4}} mes de la cuota (texto corto)
//
// Sin credenciales, los mensajes quedan registrados como "pendiente" con el motivo.

const db = require('./db');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const hoyISO = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

function nombreMes(mes) {
  const [anio, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${anio}`;
}

function textoRecordatorio(nombre, mes, monto) {
  return `Hola ${nombre}, te recordamos que la cuota de ${nombreMes(mes)} por $ ${Number(monto).toLocaleString('es-AR')} figura sin pagar en Eventos Pinar. Por favor regularizala cuanto antes. Gracias.`;
}

async function enviarWhatsApp(telefono, nombre, mes, monto) {
  const token = process.env.WA_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  const plantilla = process.env.WA_TEMPLATE || 'cuota_atrasada';
  const idioma = process.env.WA_LANGUAGE || 'es_AR';
  if (!token || !phoneId) {
    throw new Error('WhatsApp no configurado (faltan WA_TOKEN y WA_PHONE_NUMBER_ID)');
  }
  const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'template',
      template: {
        name: plantilla,
        language: { code: idioma },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: nombre },
            { type: 'text', text: nombreMes(mes) },
            { type: 'text', text: `$ ${Number(monto).toLocaleString('es-AR')}` },
            { type: 'text', text: mes }
          ]
        }]
      }
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `Error ${r.status} de WhatsApp`);
  return data;
}

// Cuotas atrasadas: mes ya cerrado, sin pagar y sin pago en revisión
function cuotasAtrasadas() {
  const hoy = hoyISO();
  return db.prepare(`
    SELECT c.id, c.numero, c.monto, c.mes, c.vencimiento, e.dni, cl.nombre, cl.telefono
    FROM cuotas c
    JOIN eventos e ON e.id = c.evento_id
    JOIN clientes cl ON cl.dni = e.dni
    LEFT JOIN pagos p ON p.id = c.pago_id
    WHERE c.pagada = 0
      AND c.vencimiento < ?
      AND (p.id IS NULL OR p.estado != 'pendiente')
  `).all(hoy);
}

// Crea los avisos pendientes (uno por cuota) y los intenta enviar.
async function revisarAtrasos() {
  const atrasadas = cuotasAtrasadas();
  const insertar = db.prepare(`INSERT OR IGNORE INTO mensajes (dni, cuota_id, tipo, telefono, texto)
                               VALUES (?, ?, 'atraso', ?, ?)`);
  const nuevos = [];
  for (const c of atrasadas) {
    const r = insertar.run(c.dni, c.id, c.telefono || null, textoRecordatorio(c.nombre, c.mes, c.monto));
    if (r.changes) nuevos.push(c);
  }

  let enviados = 0;
  for (const c of nuevos) {
    const msg = db.prepare("SELECT * FROM mensajes WHERE cuota_id = ? AND tipo = 'atraso'").get(c.id);
    if (!c.telefono) {
      db.prepare("UPDATE mensajes SET estado = 'error', error = 'El cliente no tiene teléfono cargado' WHERE id = ?").run(msg.id);
      continue;
    }
    try {
      await enviarWhatsApp(c.telefono, c.nombre, c.mes, c.monto);
      db.prepare("UPDATE mensajes SET estado = 'enviado', enviado_en = datetime('now','localtime'), error = NULL WHERE id = ?").run(msg.id);
      enviados++;
    } catch (err) {
      db.prepare("UPDATE mensajes SET estado = 'error', error = ? WHERE id = ?").run(String(err.message).slice(0, 300), msg.id);
    }
  }
  return { atrasadas: atrasadas.length, nuevos: nuevos.length, enviados };
}

// Reintenta los mensajes que quedaron pendientes o con error (por ejemplo, sin credenciales al principio)
async function reintentarPendientes() {
  const pendientes = db.prepare(`
    SELECT m.*, c.monto, c.mes, cl.nombre
    FROM mensajes m
    JOIN cuotas c ON c.id = m.cuota_id
    JOIN clientes cl ON cl.dni = m.dni
    WHERE m.estado IN ('pendiente', 'error') AND c.pagada = 0`).all();
  let enviados = 0;
  for (const m of pendientes) {
    if (!m.telefono) continue;
    try {
      await enviarWhatsApp(m.telefono, m.nombre, m.mes, m.monto);
      db.prepare("UPDATE mensajes SET estado = 'enviado', enviado_en = datetime('now','localtime'), error = NULL WHERE id = ?").run(m.id);
      enviados++;
    } catch (err) {
      db.prepare("UPDATE mensajes SET estado = 'error', error = ? WHERE id = ?").run(String(err.message).slice(0, 300), m.id);
    }
  }
  return { reintentados: pendientes.length, enviados };
}

module.exports = { revisarAtrasos, reintentarPendientes, cuotasAtrasadas, nombreMes };
