const contenido = document.getElementById('contenido');
const bienvenida = document.getElementById('bienvenida');

// Crea un elemento con texto seguro (sin innerHTML)
function el(tag, cls, ...hijos) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  hijos.forEach(h => e.append(h));
  return e;
}
function txt(tag, texto, cls) {
  const e = document.createElement(tag);
  e.textContent = texto;
  if (cls) e.className = cls;
  return e;
}

const money = n => '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function nombreMes(mes) {
  if (!mes) return '-';
  const [anio, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${anio}`;
}

function fechaLarga(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function diasEntre(desde, hasta) {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);
}
function sumarDias(iso, dias) {
  const d = new Date(Date.parse(iso.slice(0, 10)) + dias * 86400000);
  return d.toISOString().slice(0, 10);
}

// Estado de una cuota mensual para mostrar al cliente
function estadoCuota(c, hoy) {
  const mes = nombreMes(c.mes);
  if (c.pagada) {
    const hora = (c.fecha_pago || '').slice(11, 16);
    return { texto: `Pagada el ${fechaLarga(c.fecha_pago)} a las ${hora} hs`, cls: 'pagada', etiqueta: 'Pagada' };
  }
  if (c.pago_estado === 'pendiente') {
    return { texto: 'Comprobante enviado, esperando confirmación', cls: 'pendiente', etiqueta: 'En revisión' };
  }
  const cierre = c.vencimiento.slice(0, 10);
  if (hoy > cierre) {
    return { texto: `Atrasada: no se pagó durante ${mes}. Te vamos a recordar por WhatsApp.`, cls: 'vencida', etiqueta: 'Atrasada' };
  }
  return { texto: `Pagala durante ${mes} (hasta el ${fechaLarga(cierre)})`, cls: 'pendiente', etiqueta: 'Pendiente' };
}

function sePuedePagar(c) {
  return !c.pagada && !c.pago_estado;
}

function tablaCuotas(evento, hoy, conSeleccion) {
  const cuotas = evento.cuotas;
  if (!cuotas.length) return txt('p', 'No hay cuotas cargadas para este evento.');
  const encabezados = ['Cuota', 'Mes', 'Monto', 'Estado', 'Detalle'];
  if (conSeleccion) encabezados.unshift('');
  const thead = el('thead', null, el('tr', null, ...encabezados.map(t => txt('th', t))));
  const tbody = el('tbody');
  cuotas.forEach(c => {
    const est = estadoCuota(c, hoy);
    const celdas = [
      txt('td', `#${c.numero}`),
      txt('td', nombreMes(c.mes)),
      txt('td', money(c.monto)),
      el('td', null, txt('span', est.etiqueta, `badge ${est.cls}`)),
      txt('td', est.texto)
    ];
    if (conSeleccion) {
      const td = el('td');
      if (sePuedePagar(c)) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.cuotaId = c.id;
        cb.dataset.monto = c.monto;
        cb.className = 'check-cuota';
        td.append(cb);
      }
      celdas.unshift(td);
    }
    tbody.append(el('tr', null, ...celdas));
  });
  const tabla = el('table', null, thead, tbody);
  return tabla;
}

// Formulario para informar un pago con comprobante (cuotas elegidas en la tabla)
function formularioPago(evento) {
  const total = txt('strong', '$ 0');
  total.dataset.total = '1';
  const fecha = document.createElement('input');
  fecha.type = 'datetime-local';
  const archivo = document.createElement('input');
  archivo.type = 'file';
  archivo.accept = 'image/jpeg,image/png,image/webp,application/pdf';
  const msg = el('div', 'msg');
  const boton = txt('button', 'Enviar comprobante');
  boton.type = 'button';

  const contenedor = el('div', 'bloque-pago',
    txt('h4', 'Informar pago'),
    txt('p', 'Marcá las cuotas que querés pagar en la tabla y adjuntá el comprobante.'),
    el('div', 'fila-pago',
      el('div', null, txt('small', 'Total elegido'), total),
      el('div', null, txt('small', 'Fecha y hora de la transferencia'), fecha),
      el('div', null, txt('small', 'Comprobante (JPG, PNG, WEBP o PDF)'), archivo)
    ),
    boton,
    msg
  );

  function elegidas() {
    return [...contenedor.parentElement.querySelectorAll('.check-cuota:checked')];
  }
  function actualizarTotal() {
    const suma = elegidas().reduce((s, cb) => s + Number(cb.dataset.monto), 0);
    total.textContent = money(suma);
  }
  contenedor.actualizarTotal = actualizarTotal;

  boton.onclick = async () => {
    const marcadas = elegidas();
    msg.className = 'msg';
    if (!marcadas.length) return mostrarMsg(msg, 'Elegí al menos una cuota', 'error');
    if (!fecha.value) return mostrarMsg(msg, 'Indicá fecha y hora de la transferencia', 'error');
    const archivoElegido = archivo.files[0];
    if (!archivoElegido) return mostrarMsg(msg, 'Adjuntá el comprobante', 'error');

    const datos = {
      cuota_ids: marcadas.map(cb => Number(cb.dataset.cuotaId)),
      monto: marcadas.reduce((s, cb) => s + Number(cb.dataset.monto), 0),
      fecha_transferencia: fecha.value.replace('T', ' ')
    };
    boton.disabled = true;
    try {
      const r = await fetch('/api/pagos', {
        method: 'POST',
        headers: { 'Content-Type': archivoElegido.type, 'X-Pago-Datos': JSON.stringify(datos) },
        body: archivoElegido,
        credentials: 'same-origin'
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'No se pudo enviar el comprobante');
      mostrarMsg(msg, 'Comprobante enviado. Te avisaremos cuando se confirme el pago.', 'ok');
      await window.cargarPanel();
    } catch (err) {
      mostrarMsg(msg, err.message, 'error');
    } finally {
      boton.disabled = false;
    }
  };

  return contenedor;
}

function mostrarMsg(elemento, texto, tipo) {
  elemento.textContent = texto;
  elemento.className = 'msg ' + (tipo || '');
}

function tarjetaEvento(e, hoy, conPago) {
  const saldo = e.cuotas.filter(c => !c.pagada).reduce((s, c) => s + c.monto, 0);
  const pagado = e.cuotas.filter(c => c.pagada).reduce((s, c) => s + c.monto, 0) + Number(e.sena || 0);
  const dato = (etiqueta, valor) => el('div', 'dato', txt('small', etiqueta), txt('strong', valor));

  const adicionales = el('p', null, txt('strong', 'Adicionales: '), document.createTextNode(e.adicionales || 'Ninguno'));
  const hijos = [
    txt('h3', `${e.tipo} · ${fechaLarga(e.fecha)}`),
    el('div', 'grid',
      dato('Horario', e.horario_inicio && e.horario_fin ? `${e.horario_inicio} a ${e.horario_fin}` : 'Sin cargar'),
      dato('Invitados', e.adultos != null ? `${Number(e.adultos) + Number(e.ninos || 0)} (${e.adultos} adultos, ${e.ninos || 0} niños)` : 'Sin cargar'),
      dato('Seña', money(e.sena)),
      dato('Valor final', money(e.valor_final)),
      dato('Pagado (seña + cuotas)', money(pagado)),
      dato('Saldo pendiente', money(saldo))
    ),
    adicionales,
    txt('h4', 'Cuotas'),
    tablaCuotas(e, hoy, conPago)
  ];
  const botonDoc = (texto, tipo) => {
    const b = txt('button', texto, 'sec peq');
    b.type = 'button';
    b.onclick = () => abrirDocumento(`/api/mis-eventos/${e.id}/${tipo}`, `${texto.replace('Ver ', '')} · ${e.tipo}`).catch(err => alert(err.message));
    return b;
  };
  hijos.splice(3, 0, el('div', 'acciones-evento', botonDoc('Ver contrato', 'contrato'), botonDoc('Ver presupuesto', 'presupuesto')));
  let formulario = null;
  if (conPago && e.cuotas.some(sePuedePagar)) {
    formulario = formularioPago(e);
    hijos.push(formulario);
  }
  const card = el('div', 'evento', ...hijos);
  // Al marcar o desmarcar cuotas, actualizar el total elegido
  card.addEventListener('change', ev => {
    if (ev.target.classList.contains('check-cuota') && formulario) formulario.actualizarTotal();
  });
  return card;
}

function seccion(titulo, eventos, hoy, mensajeVacio, conPago) {
  const card = el('div', 'card', txt('h2', titulo));
  if (!eventos.length) card.append(txt('p', mensajeVacio));
  eventos.forEach(e => card.append(tarjetaEvento(e, hoy, conPago)));
  return card;
}

// Carga el panel del cliente. Devuelve false si no hay sesión.
async function cargarPanel() {
  const meR = await fetch('/api/me', { credentials: 'same-origin' });
  if (meR.status === 401) return false;
  const me = await meR.json();

  const evR = await fetch('/api/mis-eventos', { credentials: 'same-origin' });
  const { hoy, proximos, historial } = await evR.json();

  bienvenida.replaceChildren(
    txt('h2', `Hola, ${me.nombre}`),
    txt('p', `DNI ${me.dni} · ${me.mail}`)
  );
  contenido.replaceChildren(
    seccion('Próximos eventos', proximos, hoy, 'No tenés eventos próximos.', true),
    seccion('Historial de eventos realizados', historial, hoy, 'Todavía no hay eventos realizados.', false)
  );
  return true;
}
window.cargarPanel = cargarPanel;

document.getElementById('btnSalir').onclick = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  location.replace('ingreso.html');
};

// En panel.html se carga al abrir la página. En ingreso.html se carga después de ingresar.
if (document.body.dataset.pagina === 'panel') {
  cargarPanel().then(ok => { if (!ok) location.replace('ingreso.html'); }).catch(err => {
    bienvenida.replaceChildren(txt('p', 'No se pudo cargar tu cuenta. Probá ingresar de nuevo.'));
    console.error(err);
  });
}
