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

// ---------- Eventos ----------
$('#formEvento').onsubmit = async e => {
  e.preventDefault();
  const form = e.target;
  const datos = Object.fromEntries(new FormData(form).entries());
  datos.cuotas = [...document.querySelectorAll('#listaCuotas [data-cuota]')].map(f => ({
    monto: f.querySelector('[name=monto]').value,
    vencimiento: f.querySelector('[name=vencimiento]').value
  }));
  const msg = $('#msgEvento');
  try {
    await api('/api/admin/eventos', 'POST', datos);
    msg.textContent = 'Evento guardado.';
    msg.className = 'msg ok';
    form.reset();
    $('#listaCuotas').replaceChildren();
    cargarEventos();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg error';
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

function tarjetaEvento(e) {
  const saldo = e.cuotas.filter(c => !c.pagada).reduce((s, c) => s + c.monto, 0);
  const tabla = el('table');
  tabla.append(el('thead', null, el('tr', null,
    ...['Cuota', 'Monto', 'Vencimiento', 'Pago', ''].map(t => txt('th', t)))));
  const tbody = el('tbody');
  e.cuotas.forEach(c => {
    const accion = el('td');
    if (c.pagada) {
      accion.append(txt('button', 'Desmarcar', 'peq'));
      accion.lastChild.onclick = () => desmarcar(c.id).catch(alertar);
    } else {
      accion.append(txt('button', 'Marcar pagada', 'peq'));
      accion.lastChild.onclick = () => marcarPagada(c.id).catch(alertar);
    }
    tbody.append(el('tr', null,
      txt('td', `#${c.numero}`),
      txt('td', money(c.monto)),
      txt('td', fechaLarga(c.vencimiento)),
      txt('td', c.pagada ? `${fechaLarga(c.fecha_pago)} ${c.fecha_pago.slice(11, 16)} hs` : 'Pendiente'),
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

function alertar(err) { alert(err.message || 'Error'); }

async function cargarEventos() {
  const eventos = await api('/api/admin/eventos');
  const lista = $('#listaEventos');
  lista.replaceChildren();
  if (!eventos.length) lista.append(txt('p', 'Todavía no hay eventos cargados.'));
  eventos.forEach(e => lista.append(tarjetaEvento(e)));
}

async function iniciar() {
  mostrarPanel();
  if (!$('#listaCuotas').children.length) $('#listaCuotas').append(filaCuota());
  try { await cargarEventos(); } catch (err) { mostrarLogin(); }
}

// Si ya hay sesión de admin, entra directo
api('/api/admin/sesion').then(iniciar).catch(() => mostrarLogin());
