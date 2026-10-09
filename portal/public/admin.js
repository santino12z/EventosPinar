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
const hoyISO = () => new Date().toLocaleDateString('sv-SE');
const TOLERANCIA_DIAS = 5;

// Reglas de recomendación de cuotas (ajustables)
const CUOTAS_OPCIONES = [1, 2, 3, 4, 6, 9, 12];
const CUOTA_MINIMA = 100000; // monto mínimo recomendado por cuota ($)

let eventosCache = [];

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

// ---------- Tipo de evento ----------
async function cargarTipos() {
  const tipos = await api('/api/admin/tipos-evento');
  const select = $('#tipoEvento');
  const actual = select.value;
  select.replaceChildren(
    Object.assign(document.createElement('option'), { value: '', textContent: 'Seleccione...' }),
    ...tipos.map(t => Object.assign(document.createElement('option'), { value: t, textContent: t }))
  );
  select.value = actual;
}

$('#tipoEvento').onchange = () => {
  const otro = $('#tipoEvento').value === 'Otro';
  $('#tipoOtroWrap').classList.toggle('oculto', !otro);
  $('#tipoOtro').required = otro;
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

// ---------- Recomendación de cuotas ----------
function mesesHastaEvento() {
  const f = $('#fechaEvento').value;
  if (!f) return 12;
  const dias = Math.round((Date.parse(f) - Date.parse(hoyISO())) / 86400000);
  return Math.max(1, Math.floor(dias / 30));
}

function actualizarRecomendacion() {
  const caja = $('#recomendacion');
  const valor = Number($('#valorFinal').value);
  const sena = Number($('#sena').value || 0);
  if (!$('#valorFinal').value || valor <= 0) { caja.replaceChildren(); return; }
  const saldo = Math.round((valor - sena) * 100) / 100;
  if (saldo <= 0) {
    caja.replaceChildren(txt('p', 'La seña cubre todo el valor final. No hay saldo para cuotas.'));
    return;
  }
  const meses = mesesHastaEvento();
  const opciones = CUOTAS_OPCIONES.map(n => ({ n, monto: saldo / n, valida: n <= meses && saldo / n >= CUOTA_MINIMA }));
  const validas = opciones.filter(o => o.valida);
  const recomendada = validas.length ? validas[validas.length - 1].n : 1;
  const rec = opciones.find(o => o.n === recomendada);

  const botones = opciones.filter(o => o.valida).map(o => {
    const b = txt('button', `Usar ${o.n} ${o.n === 1 ? 'cuota' : 'cuotas'}`, o.n === recomendada ? '' : 'sec peq');
    b.type = 'button';
    b.onclick = () => usarCuotas(o.n);
    return b;
  });

  caja.replaceChildren(
    el('div', 'rec-titulo', txt('strong', `Recomendado: ${recomendada} ${recomendada === 1 ? 'cuota' : 'cuotas'} de ${money(rec.monto)}`)),
    txt('p', `Saldo a financiar: ${money(saldo)} · Meses hasta el evento: ${meses} · Cuota mínima sugerida: ${money(CUOTA_MINIMA)}`),
    el('div', 'rec-botones', ...botones),
    txt('p', validas.length ? 'Las opciones que no aparecen superan los meses disponibles o bajan de la cuota mínima.' : 'Ninguna cantidad de cuotas cumple la cuota mínima. Podés cargar cuotas a mano.')
  );
}

function usarCuotas(n) {
  $('#gCantidad').value = n;
  $('#gPlan').value = 'mensual';
  if (!$('#gPrimera').value) {
    const d = new Date(Date.parse(hoyISO()) + 30 * 86400000);
    $('#gPrimera').value = d.toISOString().slice(0, 10);
  }
  $('#btnGenerar').click();
}

['#valorFinal', '#sena', '#fechaEvento'].forEach(s => $(s).addEventListener('input', () => { actualizarRecomendacion(); avisoFecha(); }));

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

// Aviso si la fecha elegida ya está reservada
function avisoFecha() {
  const f = $('#fechaEvento').value;
  const aviso = $('#avisoFecha');
  const ocupados = f ? eventosCache.filter(e => e.fecha.slice(0, 10) === f) : [];
  if (!ocupados.length) { aviso.textContent = ''; aviso.className = 'msg'; return; }
  aviso.textContent = `⚠️ Esa fecha ya tiene ${ocupados.length} evento(s): ${ocupados.map(e => e.tipo).join(', ')}.`;
  aviso.className = 'msg error';
}

// ---------- Eventos ----------
$('#formEvento').onsubmit = async e => {
  e.preventDefault();
  const form = e.target;
  const datos = Object.fromEntries(new FormData(form).entries());
  if (datos.tipo === 'Otro') datos.tipo = 'Otro: ' + $('#tipoOtro').value.trim();
  datos.cuotas = [...document.querySelectorAll('#listaCuotas [data-cuota]')].map(f => ({
    monto: f.querySelector('[name=monto]').value,
    vencimiento: f.querySelector('[name=vencimiento]').value
  }));
  try {
    await api('/api/admin/eventos', 'POST', datos);
    mostrarMsgEvento('Evento guardado.', 'ok');
    form.reset();
    $('#tipoOtroWrap').classList.add('oculto');
    $('#listaCuotas').replaceChildren();
    actualizarRecomendacion();
    avisoFecha();
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
  cargarTodo();
}

async function desmarcar(cuotaId) {
  if (!confirm('¿Desmarcar este pago?')) return;
  await api(`/api/admin/cuotas/${cuotaId}/desmarcar`, 'POST');
  cargarTodo();
}

async function eliminarEvento(id) {
  if (!confirm('¿Eliminar este evento y sus cuotas? No se puede deshacer.')) return;
  await api(`/api/admin/eventos/${id}`, 'DELETE');
  cargarTodo();
}

function alertar(err) { alert(err.message || 'Error'); }

// Estado de una cuota para el administrador
function estadoCuotaAdmin(c, hoy) {
  if (c.pagada) return `Pagada el ${fechaLarga(c.fecha_pago)} ${(c.fecha_pago || '').slice(11, 16)} hs`;
  if (c.pago_estado === 'pendiente') return 'Comprobante en revisión';
  const venc = c.vencimiento.slice(0, 10);
  const limite = new Date(Date.parse(venc) + TOLERANCIA_DIAS * 86400000).toISOString().slice(0, 10);
  if (hoy > limite) return `Vencida (venció el ${fechaLarga(venc)})`;
  if (hoy > venc) return `En tolerancia (venció el ${fechaLarga(venc)}, hasta ${fechaLarga(limite)})`;
  return `Pendiente (vence ${fechaLarga(venc)})`;
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
  eventosCache = eventos;
  const lista = $('#listaEventos');
  lista.replaceChildren();
  if (!eventos.length) lista.append(txt('p', 'Todavía no hay eventos cargados.'));
  eventos.forEach(e => lista.append(tarjetaEvento(e)));
  renderCalendario();
  avisoFecha();
}

// ---------- Calendario ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
let calAnio = new Date().getFullYear();
let calMes = new Date().getMonth(); // 0-11
let calSeleccion = null;

function renderCalendario() {
  const grid = $('#calGrid');
  grid.replaceChildren();
  $('#calTitulo').textContent = `${MESES[calMes]} ${calAnio}`;

  ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].forEach(d => grid.append(txt('div', d, 'cal-cabecera')));

  const primero = new Date(Date.UTC(calAnio, calMes, 1));
  const offset = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const diasMes = new Date(Date.UTC(calAnio, calMes + 1, 0)).getUTCDate();
  const hoy = hoyISO();

  for (let i = 0; i < offset; i++) grid.append(el('div', 'cal-dia vacio'));

  for (let dia = 1; dia <= diasMes; dia++) {
    const iso = `${calAnio}-${String(calMes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const ocupados = eventosCache.filter(e => e.fecha.slice(0, 10) === iso);
    const celda = el('div', `cal-dia ${ocupados.length ? 'ocupada' : 'libre'}${iso === hoy ? ' hoy' : ''}${iso === calSeleccion ? ' seleccionado' : ''}`);
    celda.append(txt('div', String(dia), 'cal-numero'));
    if (ocupados.length) {
      ocupados.slice(0, 2).forEach(e => celda.append(txt('div', e.tipo, 'cal-etiqueta')));
      if (ocupados.length > 2) celda.append(txt('div', `+${ocupados.length - 2} más`, 'cal-etiqueta'));
    } else {
      celda.append(txt('div', 'Libre', 'cal-etiqueta libre-txt'));
    }
    celda.onclick = () => { calSeleccion = iso; renderCalendario(); mostrarDetalleDia(iso); };
    grid.append(celda);
  }

  if (calSeleccion && calSeleccion.startsWith(`${calAnio}-${String(calMes + 1).padStart(2, '0')}`)) {
    mostrarDetalleDia(calSeleccion);
  } else {
    $('#calDetalle').replaceChildren(txt('p', 'Tocá un día para ver si está libre o reservado.', 'cal-ayuda'));
  }
}

function mostrarDetalleDia(iso) {
  const caja = $('#calDetalle');
  const ocupados = eventosCache.filter(e => e.fecha.slice(0, 10) === iso);
  const hoy = hoyISO();
  const titulo = txt('h3', `${fechaLarga(iso)} · ${ocupados.length ? 'RESERVADA' : 'LIBRE'}`);

  if (!ocupados.length) {
    const botonCargar = txt('button', 'Cargar evento en esta fecha');
    botonCargar.type = 'button';
    botonCargar.onclick = () => {
      $('#fechaEvento').value = iso;
      avisoFecha();
      actualizarRecomendacion();
      $('#formEvento').scrollIntoView({ behavior: 'smooth' });
    };
    caja.replaceChildren(titulo, txt('p', 'No hay eventos cargados para este día.'), botonCargar);
    return;
  }

  caja.replaceChildren(titulo, ...ocupados.map(e => {
    const saldo = e.cuotas.filter(c => !c.pagada).reduce((s, c) => s + c.monto, 0);
    const pagado = e.cuotas.filter(c => c.pagada).reduce((s, c) => s + c.monto, 0) + Number(e.sena || 0);
    const cuotas = e.cuotas.length
      ? el('table', null,
          el('thead', null, el('tr', null, ...['Cuota', 'Monto', 'Vence', 'Estado'].map(t => txt('th', t)))),
          el('tbody', null, ...e.cuotas.map(c => el('tr', null,
            txt('td', `#${c.numero}`),
            txt('td', money(c.monto)),
            txt('td', fechaLarga(c.vencimiento)),
            txt('td', estadoCuotaAdmin(c, hoy))))))
      : txt('p', 'Sin cuotas cargadas.');
    return el('div', 'evento',
      txt('h4', e.tipo),
      el('div', 'grid',
        el('div', 'dato', txt('small', 'Cliente'), txt('strong', e.cliente_nombre || 'Sin cuenta registrada')),
        el('div', 'dato', txt('small', 'DNI'), txt('strong', e.dni)),
        el('div', 'dato', txt('small', 'Mail'), txt('strong', e.cliente_mail || '-')),
        el('div', 'dato', txt('small', 'Seña'), txt('strong', money(e.sena))),
        el('div', 'dato', txt('small', 'Valor final'), txt('strong', money(e.valor_final))),
        el('div', 'dato', txt('small', 'Pagado'), txt('strong', money(pagado))),
        el('div', 'dato', txt('small', 'Saldo pendiente'), txt('strong', money(saldo)))
      ),
      el('p', null, txt('strong', 'Adicionales: '), document.createTextNode(e.adicionales || 'Ninguno')),
      cuotas
    );
  }));
}

$('#calAnterior').onclick = () => {
  calMes--; if (calMes < 0) { calMes = 11; calAnio--; }
  renderCalendario();
};
$('#calSiguiente').onclick = () => {
  calMes++; if (calMes > 11) { calMes = 0; calAnio++; }
  renderCalendario();
};

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
  try {
    await cargarTipos();
    await cargarTodo();
    actualizarRecomendacion();
  } catch (err) { mostrarLogin(); }
}

// Si ya hay sesión de administrador, entra directo
api('/api/admin/sesion').then(iniciar).catch(() => mostrarLogin());
