const $ = s => document.querySelector(s);

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
const fechaLarga = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-';

async function api(url, metodo = 'GET', datos) {
  const r = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: datos ? JSON.stringify(datos) : undefined,
    credentials: 'same-origin'
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/admin/login') { mostrarLogin(); throw new Error('Sesión expirada'); }
  if (!r.ok) throw new Error(data.error || 'Error inesperado');
  return data;
}

// Descarga un archivo protegido (con la sesión) y devuelve una URL local para verlo
async function descargarProtegido(url) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error('No se pudo abrir el comprobante');
  return URL.createObjectURL(await r.blob());
}

function mostrarLogin() {
  $('#loginCard').classList.remove('oculto');
  $('#panelAdmin').classList.add('oculto');
  $('#btnSalir').classList.add('oculto');
}
function mostrarPanel() {
  $('#loginCard').classList.add('oculto');
  $('#panelAdmin').classList.remove('oculto');
  $('#btnSalir').classList.remove('oculto');
}

// ---------- Ingreso ----------
$('#formLogin').onsubmit = async e => {
  e.preventDefault();
  try {
    await api('/api/admin/login', 'POST', Object.fromEntries(new FormData(e.target)));
    iniciar();
  } catch (err) {
    $('#msgLogin').textContent = err.message;
    $('#msgLogin').className = 'msg error';
  }
};

$('#btnSalir').onclick = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  mostrarLogin();
};

// ---------- Cuotas del formulario ----------
function filaCuota(monto = '', vencimiento = '') {
  const fila = el('div', 'fila-form');
  fila.dataset.cuota = '1';
  fila.innerHTML = `
    <div><label>Monto ($)</label><input name="monto" type="number" min="0" step="0.01" required></div>
    <div><label>Vence</label><input name="vencimiento" type="date" required></div>
    <div></div>
    <div><button class="sec peq" type="button">Quitar</button></div>`;
  fila.querySelector('[name=monto]').value = monto;
  fila.querySelector('[name=vencimiento]').value = vencimiento;
  fila.querySelector('button').onclick = () => fila.remove();
  return fila;
}
$('#btnAgregarCuota').onclick = () => $('#listaCuotas').append(filaCuota());

// ---------- Generación automática de cuotas ----------
// Fechas en UTC para no tener problemas de zona horaria
const aDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const aISO = d => d.toISOString().slice(0, 10);

function fechasMensuales(primera, n) {
  const base = aDate(primera);
  const dia = base.getUTCDate();
  const out = [];
  for (let i = 0; i < n; i++) {
    const anio = base.getUTCFullYear();
    const mes = base.getUTCMonth() + i;
    const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    out.push(aISO(new Date(Date.UTC(anio, mes, Math.min(dia, ultimoDia)))));
  }
  return out;
}

function fechasDosPorMes(primera, n) {
  let d = aDate(primera);
  const out = [aISO(d)];
  for (let i = 1; i < n; i++) {
    const anio = d.getUTCFullYear();
    const mes = d.getUTCMonth();
    // Si cae antes del 15, la siguiente es el 15 del mismo mes; si no, el 1 del mes siguiente
    d = d.getUTCDate() < 15 ? new Date(Date.UTC(anio, mes, 15)) : new Date(Date.UTC(anio, mes + 1, 1));
    out.push(aISO(d));
  }
  return out;
}

$('#btnGenerar').onclick = () => {
  const form = $('#formEvento');
  const n = parseInt($('#gCantidad').value, 10);
  const plan = $('#gPlan').value;
  const primera = $('#gPrimera').value;
  const valorFinal = Number(form.valor_final.value);
  const sena = Number(form.sena.value || 0);
  const msg = $('#msgEvento');

  if (!n || n < 1 || n > 60) return mostrarMsgEvento('La cantidad de cuotas debe estar entre 1 y 60', 'error');
  if (!primera) return mostrarMsgEvento('Indicá el primer vencimiento', 'error');
  if (!form.valor_final.value) return mostrarMsgEvento('Indicá el valor final antes de generar las cuotas', 'error');
  const saldo = Math.round((valorFinal - sena) * 100) / 100;
  if (saldo <= 0) return mostrarMsgEvento('El saldo (valor final menos seña) debe ser mayor a cero', 'error');

  const base = Math.floor((saldo / n) * 100) / 100;
  const montos = Array.from({ length: n }, (_, i) => i < n - 1 ? base : Math.round((saldo - base * (n - 1)) * 100) / 100);
  const fechas = plan === 'mensual' ? fechasMensuales(primera, n) : fechasDosPorMes(primera, n);

  $('#listaCuotas').replaceChildren(...montos.map((m, i) => filaCuota(m.toFixed(2), fechas[i])));
  mostrarMsgEvento(`Se generaron ${n} cuotas por ${money(saldo)} en total. Revisá antes de guardar.`, 'ok');
};

function mostrarMsgEvento(texto, tipo) {
  const msg = $('#msgEvento');
  msg.textContent = texto;
  msg.className = 'msg ' + (tipo || '');
}

// ---------- Eventos ----------
$('#formEvento').onsubmit = async e => {
  e.preventDefault();
  const form = e.target;
  const datos = Object.fromEntries(new FormData(form).entries());
  datos.cuotas = [...document.querySelectorAll('#listaCuotas [data-cuota]')].map(f => ({
    monto: f.querySelector('[name=monto]').value,
    vencimiento: f.querySelector('[name=vencimiento]').value
  }));
  try {
    await api('/api/admin/eventos', 'POST', datos);
    mostrarMsgEvento('Evento guardado.', 'ok');
    form.reset();
    $('#listaCuotas').replaceChildren();
    cargarEventos();
  } catch (err) {
    mostrarMsgEvento(err.message, 'error');
  }
};

async function marcarPagada(cuotaId) {
  const ahora = new Date();
  const valor = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const fecha = prompt('Fecha y hora del pago (AAAA-MM-DD HH:MM). Dejá el valor por defecto para usar ahora:', valor.replace('T', ' '));
  if (fecha === null) return;
  await api(`/api/admin/cuotas/${cuotaId}/pagar`, 'POST', { fecha_pago: fecha.trim() });
  cargarEventos();
}

async function desmarcar(cuotaId) {
  if (!confirm('¿Desmarcar este pago?')) return;
  await api(`/api/admin/cuotas/${cuotaId}/desmarcar`, 'POST');
  cargarEventos();
}

async function eliminarEvento(id) {
  if (!confirm('¿Eliminar este evento y sus cuotas? No se puede deshacer.')) return;
  await api(`/api/admin/eventos/${id}`, 'DELETE');
  cargarEventos();
}

function alertar(err) { alert(err.message || 'Error'); }

function tarjetaEvento(e) {
  const saldo = e.cuotas.filter(c => !c.pagada).reduce((s, c) => s + c.monto, 0);
  const tabla = el('table');
  tabla.append(el('thead', null, el('tr', null,
    ...['Cuota', 'Monto', 'Vencimiento', 'Pago', ''].map(t => txt('th', t)))));
  const tbody = el('tbody');
  e.cuotas.forEach(c => {
    const accion = el('td');
    if (c.pagada) {
      const b = txt('button', 'Desmarcar', 'peq');
      b.onclick = () => desmarcar(c.id).catch(alertar);
      accion.append(b);
    } else {
      const b = txt('button', 'Marcar pagada', 'peq');
      b.onclick = () => marcarPagada(c.id).catch(alertar);
      accion.append(b);
    }
    const estadoPago = c.pagada
      ? `${fechaLarga(c.fecha_pago)} ${(c.fecha_pago || '').slice(11, 16)} hs`
      : (c.pago_estado === 'pendiente' ? 'Comprobante en revisión' : 'Pendiente');
    tbody.append(el('tr', null,
      txt('td', `#${c.numero}`),
      txt('td', money(c.monto)),
      txt('td', fechaLarga(c.vencimiento)),
      txt('td', estadoPago),
      accion
    ));
  });
  tabla.append(tbody);

  const borrar = txt('button', 'Eliminar evento', 'sec peq');
  borrar.onclick = () => eliminarEvento(e.id).catch(alertar);

  return el('div', 'evento',
    txt('h3', `${e.tipo} · ${fechaLarga(e.fecha)} · DNI ${e.dni}${e.cliente_nombre ? ' (' + e.cliente_nombre + ')' : ' (sin cuenta registrada)'}`),
    el('p', null,
      document.createTextNode(`Seña ${money(e.sena)} · Valor final ${money(e.valor_final)} · Saldo pendiente ${money(saldo)}`)),
    el('p', null, txt('strong', 'Adicionales: '), document.createTextNode(e.adicionales || 'Ninguno')),
    tabla,
    borrar
  );
}

async function cargarEventos() {
  const eventos = await api('/api/admin/eventos');
  const lista = $('#listaEventos');
  lista.replaceChildren();
  if (!eventos.length) lista.append(txt('p', 'Todavía no hay eventos cargados.'));
  eventos.forEach(e => lista.append(tarjetaEvento(e)));
}

// ---------- Pagos por confirmar ----------
function tarjetaPago(p) {
  const cuotasTxt = p.cuotas.map(c => `Cuota #${c.numero} (${c.tipo}, ${money(c.monto)})`).join(' · ') || 'Sin cuotas asociadas';
  const visor = el('div');
  const verBtn = txt('button', 'Ver comprobante', 'sec peq');
  verBtn.onclick = async () => {
    try {
      const url = await descargarProtegido(`/api/admin/pagos/${p.id}/comprobante`);
      visor.replaceChildren();
      if (p.mime === 'application/pdf') {
        visor.append(el('p', null, Object.assign(document.createElement('a'), { href: url, target: '_blank', textContent: 'Abrir PDF' })));
      } else {
        visor.append(Object.assign(document.createElement('img'), { src: url, style: 'max-width:340px;border:1px solid #ddd;border-radius:6px;margin-top:8px;' }));
      }
    } catch (err) { alertar(err); }
  };

  const acciones = el('div', 'acciones-pago');
  if (p.estado === 'pendiente') {
    const aprobar = txt('button', 'Confirmar pago', 'peq');
    aprobar.onclick = async () => {
      if (!confirm(`¿Confirmar el pago de ${money(p.monto)}?`)) return;
      try { await api(`/api/admin/pagos/${p.id}/aprobar`, 'POST', {}); cargarTodo(); } catch (err) { alertar(err); }
    };
    const rechazar = txt('button', 'Rechazar', 'sec peq');
    rechazar.onclick = async () => {
      const motivo = prompt('Motivo del rechazo (se muestra al cliente):', 'El comprobante no coincide con la transferencia');
      if (motivo === null) return;
      try { await api(`/api/admin/pagos/${p.id}/rechazar`, 'POST', { motivo }); cargarTodo(); } catch (err) { alertar(err); }
    };
    acciones.append(aprobar, rechazar);
  } else {
    acciones.append(txt('span', p.estado === 'aprobado' ? 'Confirmado' : 'Rechazado' + (p.motivo ? ': ' + p.motivo : ''), 'badge ' + (p.estado === 'aprobado' ? 'pagada' : 'vencida')));
  }

  return el('div', 'evento',
    txt('h3', `${p.cliente_nombre || 'DNI ' + p.dni} · ${money(p.monto)}`),
    el('p', null, document.createTextNode(`Transferencia informada: ${p.fecha_transferencia} · Cuotas: ${cuotasTxt}`)),
    el('div', null, verBtn),
    visor,
    acciones
  );
}

async function cargarPagos() {
  const pagos = await api('/api/admin/pagos');
  const lista = $('#listaPagos');
  lista.replaceChildren();
  const pendientes = pagos.filter(p => p.estado === 'pendiente');
  if (!pendientes.length) lista.append(txt('p', 'No hay pagos esperando confirmación.'));
  pagos.forEach(p => lista.append(tarjetaPago(p)));
}

async function cargarTodo() {
  await Promise.all([cargarPagos(), cargarEventos()]);
}

async function iniciar() {
  mostrarPanel();
  if (!$('#listaCuotas').children.length) $('#listaCuotas').append(filaCuota());
  try { await cargarTodo(); } catch (err) { mostrarLogin(); }
}

// Si ya hay sesión de administrador, entra directo
api('/api/admin/sesion').then(iniciar).catch(() => mostrarLogin());
