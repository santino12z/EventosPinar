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
const MESES_NOMBRE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = mes => { if (!mes) return '-'; const [a, m] = mes.split('-').map(Number); return `${MESES_NOMBRE[m - 1]} de ${a}`; };

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

// ---------- Navegación entre vistas ----------
function irA(vista, opciones = {}) {
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('oculto', v.id !== 'vista-' + vista));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (vista === 'calendario') renderCalendario();
  if (vista === 'nuevo') {
    if (opciones.fecha) $('#fechaEvento').value = opciones.fecha;
    if (opciones.dni) { $('#dniEvento').value = opciones.dni; buscarDniEvento(); }
    avisoFecha();
    actualizarRecomendacion();
  }
  if (vista === 'clientes' && opciones.dni) cargarFicha(opciones.dni).catch(alertar);
}
document.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => irA(b.dataset.ir)));

// Muestra quién es el cliente del DNI cargado en el formulario de evento
let timerDni = null;
function buscarDniEvento() {
  const dni = $('#dniEvento').value.trim();
  const info = $('#infoDni');
  if (!dni) { info.textContent = ''; info.className = 'info-dni'; return; }
  clearTimeout(timerDni);
  timerDni = setTimeout(async () => {
    try {
      const lista = await api(`/api/admin/clientes?q=${encodeURIComponent(dni)}`);
      const c = lista.find(x => x.dni === dni);
      if (c) {
        info.textContent = `✔ ${c.nombre}${c.telefono ? '' : ' · sin WhatsApp cargado'}`;
        info.className = 'info-dni ok' + (c.telefono ? '' : ' aviso');
      } else {
        info.textContent = 'No hay cliente registrado con ese DNI. El evento queda guardado y se vincula cuando la persona se registre.';
        info.className = 'info-dni aviso';
      }
    } catch (err) { info.textContent = ''; }
  }, 300);
}
$('#dniEvento').addEventListener('input', buscarDniEvento);

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
function filaCuota(monto = '', mes = '') {
  const fila = el('div', 'fila-form');
  fila.dataset.cuota = '1';
  fila.innerHTML = `
    <div><label>Monto ($)</label><input name="monto" type="number" min="0" step="0.01" required></div>
    <div><label>Mes de la cuota</label><input name="mes" type="month" required></div>
    <div></div>
    <div><button class="sec peq" type="button">Quitar</button></div>`;
  fila.querySelector('[name=monto]').value = monto;
  fila.querySelector('[name=mes]').value = mes;
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
  if (!$('#gPrimera').value) {
    const h = new Date();
    const siguiente = new Date(Date.UTC(h.getFullYear(), h.getMonth() + 1, 1));
    $('#gPrimera').value = siguiente.toISOString().slice(0, 7);
  }
  $('#btnGenerar').click();
}

['#valorFinal', '#sena', '#fechaEvento'].forEach(s => $(s).addEventListener('input', () => { actualizarRecomendacion(); avisoFecha(); }));

// ---------- Generación automática de cuotas ----------
// Meses consecutivos a partir de un mes AAAA-MM
function mesesConsecutivos(primero, n) {
  let [anio, mes] = primero.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(`${anio}-${String(mes).padStart(2, '0')}`);
    mes++;
    if (mes > 12) { mes = 1; anio++; }
  }
  return out;
}

$('#btnGenerar').onclick = () => {
  const form = $('#formEvento');
  const n = parseInt($('#gCantidad').value, 10);
  const primera = $('#gPrimera').value;
  const valorFinal = Number(form.valor_final.value);
  const sena = Number(form.sena.value || 0);

  if (!n || n < 1 || n > 60) return mostrarMsgEvento('La cantidad de cuotas debe estar entre 1 y 60', 'error');
  if (!primera) return mostrarMsgEvento('Indicá el primer mes de cuota', 'error');
  if (!form.valor_final.value) return mostrarMsgEvento('Indicá el valor final antes de generar las cuotas', 'error');
  const saldo = Math.round((valorFinal - sena) * 100) / 100;
  if (saldo <= 0) return mostrarMsgEvento('El saldo (valor final menos seña) debe ser mayor a cero', 'error');

  const base = Math.floor((saldo / n) * 100) / 100;
  const montos = Array.from({ length: n }, (_, i) => i < n - 1 ? base : Math.round((saldo - base * (n - 1)) * 100) / 100);
  const meses = mesesConsecutivos(primera, n);

  $('#listaCuotas').replaceChildren(...montos.map((m, i) => filaCuota(m.toFixed(2), meses[i])));
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
    mes: f.querySelector('[name=mes]').value
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

// Estado de una cuota mensual para el administrador
function estadoCuotaAdmin(c, hoy) {
  if (c.pagada) return `Pagada el ${fechaLarga(c.fecha_pago)} ${(c.fecha_pago || '').slice(11, 16)} hs`;
  if (c.pago_estado === 'pendiente') return 'Comprobante en revisión';
  const cierre = c.vencimiento.slice(0, 10);
  if (hoy > cierre) return `Atrasada (no se pagó durante ${nombreMes(c.mes)})`;
  return `Pendiente (pagar durante ${nombreMes(c.mes)})`;
}

function tarjetaEvento(e) {
  const saldo = e.cuotas.filter(c => !c.pagada).reduce((s, c) => s + c.monto, 0);
  const tabla = el('table');
  tabla.append(el('thead', null, el('tr', null,
    ...['Cuota', 'Mes', 'Monto', 'Pago', ''].map(t => txt('th', t)))));
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
      txt('td', nombreMes(c.mes)),
      txt('td', money(c.monto)),
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
const DIAS_SEMANA = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];
let calAnio = new Date().getFullYear();
let calMes = new Date().getMonth(); // 0-11

const isoDia = (anio, mes, dia) => `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const aDate = iso => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
const eventosDelDia = iso => eventosCache.filter(e => e.fecha.slice(0, 10) === iso);

function renderCalendario() {
  const grid = $('#calGrid');
  grid.replaceChildren();
  $('#calTitulo').textContent = `${MESES[calMes]} ${calAnio}`;

  DIAS_SEMANA.forEach(d => grid.append(txt('div', d, 'cal-cabecera')));

  const primero = new Date(Date.UTC(calAnio, calMes, 1));
  const offset = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const diasMes = new Date(Date.UTC(calAnio, calMes + 1, 0)).getUTCDate();
  const hoy = hoyISO();

  for (let i = 0; i < offset; i++) grid.append(el('div', 'cal-dia vacio'));

  for (let dia = 1; dia <= diasMes; dia++) {
    const iso = isoDia(calAnio, calMes, dia);
    const ocupados = eventosDelDia(iso);
    const celda = el('div', `cal-dia ${ocupados.length ? 'ocupada' : 'libre'}${iso === hoy ? ' hoy' : ''}`);
    celda.append(txt('span', String(dia), 'cal-numero'));
    ocupados.slice(0, 2).forEach(e => celda.append(el('div', 'cal-chip',
      txt('strong', e.tipo),
      txt('span', e.cliente_nombre || `DNI ${e.dni}`)
    )));
    if (ocupados.length > 2) celda.append(txt('div', `+${ocupados.length - 2} más`, 'cal-mas'));
    celda.onclick = () => (ocupados.length ? abrirDia(iso) : irA('nuevo', { fecha: iso }));
    grid.append(celda);
  }
}

function cerrarModal() {
  $('#modalDia').classList.add('oculto');
}

function abrirDia(iso) {
  const ocupados = eventosDelDia(iso);
  if (!ocupados.length) return irA('nuevo', { fecha: iso });
  const caja = $('#modalCuerpo');
  const hoy = hoyISO();
  const fechaTexto = `${DIAS_SEMANA[(aDate(iso).getUTCDay() + 6) % 7]} ${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
  $('#modalDia').classList.remove('oculto');

  const boton = (texto, accion, cls) => {
    const b = txt('button', texto, cls || '');
    b.type = 'button';
    b.onclick = () => { cerrarModal(); accion(); };
    return b;
  };

  caja.replaceChildren(
    txt('h3', fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1)),
    txt('span', ocupados.length === 1 ? 'RESERVADO' : `RESERVADO · ${ocupados.length} EVENTOS`, 'estado ocupada'),
    ...ocupados.map(e => {
      const saldo = e.cuotas.filter(c => !c.pagada).reduce((s, c) => s + c.monto, 0);
      const pagado = e.cuotas.filter(c => c.pagada).reduce((s, c) => s + c.monto, 0) + Number(e.sena || 0);
      const cuotas = e.cuotas.length
        ? el('table', null,
            el('thead', null, el('tr', null, ...['Cuota', 'Mes', 'Monto', 'Estado'].map(t => txt('th', t)))),
            el('tbody', null, ...e.cuotas.map(c => el('tr', null,
              txt('td', `#${c.numero}`),
              txt('td', nombreMes(c.mes)),
              txt('td', money(c.monto)),
              txt('td', estadoCuotaAdmin(c, hoy))))))
        : txt('p', 'Sin cuotas cargadas.');
      return el('div', 'evento',
        txt('h4', e.tipo),
        el('div', 'grid',
          el('div', 'dato', txt('small', 'Cliente'), txt('strong', e.cliente_nombre || 'Sin cuenta registrada')),
          el('div', 'dato', txt('small', 'DNI'), txt('strong', e.dni)),
          el('div', 'dato', txt('small', 'WhatsApp'), txt('strong', e.cliente_telefono || '-')),
          el('div', 'dato', txt('small', 'Mail'), txt('strong', e.cliente_mail || '-')),
          el('div', 'dato', txt('small', 'Seña'), txt('strong', money(e.sena))),
          el('div', 'dato', txt('small', 'Valor final'), txt('strong', money(e.valor_final))),
          el('div', 'dato', txt('small', 'Pagado'), txt('strong', money(pagado))),
          el('div', 'dato', txt('small', 'Saldo pendiente'), txt('strong', money(saldo)))
        ),
        el('p', null, txt('strong', 'Adicionales: '), document.createTextNode(e.adicionales || 'Ninguno')),
        cuotas,
        el('div', 'acciones-evento',
          boton('Ver ficha del cliente', () => irA('clientes', { dni: e.dni }), 'peq'),
          boton('Ver contrato', () => abrirDocumento(`/api/admin/eventos/${e.id}/contrato`, `Contrato · ${e.tipo}`, {}).catch(alertar), 'sec peq'),
          boton('Ver presupuesto', () => abrirDocumento(`/api/admin/eventos/${e.id}/presupuesto`, `Presupuesto · ${e.tipo}`, {}).catch(alertar), 'sec peq')
        )
      );
    }),
    el('div', 'acciones-form', boton('+ Agregar otro evento este día', () => irA('nuevo', { fecha: iso }), 'sec peq'))
  );
}

$('#modalCerrar').onclick = cerrarModal;
$('#modalDia').onclick = ev => { if (ev.target.id === 'modalDia') cerrarModal(); };
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrarModal(); });

$('#calAnterior').onclick = () => {
  calMes--; if (calMes < 0) { calMes = 11; calAnio--; }
  renderCalendario();
};
$('#calHoy').onclick = () => {
  const h = new Date();
  calAnio = h.getFullYear(); calMes = h.getMonth();
  renderCalendario();
};
$('#calSiguiente').onclick = () => {
  calMes++; if (calMes > 11) { calMes = 0; calAnio++; }
  renderCalendario();
};

// ---------- Pagos por confirmar ----------
function tarjetaPago(p) {
  const cuotasTxt = p.cuotas.map(c => `Cuota #${c.numero} de ${nombreMes(c.mes)} (${c.tipo}, ${money(c.monto)})`).join(' · ') || 'Sin cuotas asociadas';
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
  const contador = $('#contPagos');
  contador.textContent = pendientes.length;
  contador.classList.toggle('oculto', !pendientes.length);
  if (!pendientes.length) lista.append(txt('p', 'No hay pagos esperando confirmación.'));
  pagos.forEach(p => lista.append(tarjetaPago(p)));
}

async function cargarMensajes() {
  const mensajes = await api('/api/admin/mensajes');
  const lista = $('#listaMensajes');
  lista.replaceChildren();
  if (!mensajes.length) { lista.append(txt('p', 'Todavía no se enviaron recordatorios.')); return; }
  lista.append(el('table', null,
    el('thead', null, el('tr', null, ...['Cliente', 'Mes', 'Monto', 'Estado', 'Detalle'].map(t => txt('th', t)))),
    el('tbody', null, ...mensajes.map(m => el('tr', null,
      txt('td', m.nombre || m.dni),
      txt('td', nombreMes(m.mes)),
      txt('td', money(m.monto)),
      txt('td', m.estado === 'enviado' ? 'Enviado' : (m.estado === 'error' ? 'No enviado' : 'Pendiente')),
      txt('td', m.estado === 'enviado' ? `Enviado ${m.enviado_en || ''}` : (m.error || '-'))
    )))));
}

$('#btnRevisarAtrasos').onclick = async () => {
  const msg = $('#msgAtrasos');
  try {
    const r = await api('/api/admin/atrasos/revisar', 'POST', {});
    msg.textContent = `Cuotas atrasadas: ${r.atrasadas}. Nuevos avisos: ${r.nuevos}. Enviados ahora: ${r.enviados + (r.reintentos ? r.reintentos.enviados : 0)}.`;
    msg.className = 'msg ok';
    await cargarMensajes();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg error';
  }
};

// ---------- Buscador de clientes y ficha ----------
let timerBusqueda = null;

async function buscarClientes() {
  const q = $('#buscarCliente').value.trim();
  const clientes = await api(`/api/admin/clientes?q=${encodeURIComponent(q)}`);
  const lista = $('#resultadosClientes');
  lista.replaceChildren();
  if (!clientes.length) { lista.append(txt('p', 'No se encontraron clientes.')); return; }
  lista.append(el('table', null,
    el('thead', null, el('tr', null, ...['Nombre', 'DNI', 'Mail', 'WhatsApp', 'Eventos'].map(t => txt('th', t)))),
    el('tbody', null, ...clientes.map(c => {
      const fila = el('tr', 'fila-clickable',
        txt('td', c.nombre), txt('td', c.dni), txt('td', c.mail), txt('td', c.telefono || 'Sin cargar'), txt('td', String(c.eventos)));
      fila.style.cursor = 'pointer';
      fila.onclick = () => cargarFicha(c.dni);
      return fila;
    }))));
}

async function cargarFicha(dni) {
  const f = await api(`/api/admin/clientes/${encodeURIComponent(dni)}`);
  const ficha = $('#fichaCliente');
  ficha.replaceChildren();
  const hoy = hoyISO();

  // Datos y WhatsApp
  const inputTel = Object.assign(document.createElement('input'), { placeholder: '5491134334894', value: f.cliente.telefono || '' });
  const guardarTel = txt('button', 'Guardar WhatsApp', 'sec peq');
  guardarTel.type = 'button';
  guardarTel.onclick = async () => {
    try {
      await api(`/api/admin/clientes/${f.cliente.dni}/telefono`, 'PUT', { telefono: inputTel.value });
      cargarFicha(dni); buscarClientes();
    } catch (err) { alertar(err); }
  };
  ficha.append(el('div', 'card',
    txt('h3', `${f.cliente.nombre} · DNI ${f.cliente.dni}`),
    txt('p', `Mail: ${f.cliente.mail}`),
    el('div', 'fila-form', el('div', null, txt('small', 'WhatsApp (54 + código de área + número)'), inputTel), el('div', null), el('div', null), el('div', null, guardarTel))
  ));

  // Eventos con cuotas y documentos
  if (!f.eventos.length) ficha.append(txt('p', 'Este cliente todavía no tiene eventos.'));
  f.eventos.forEach(e => {
    const botonDoc = (texto, tipo) => {
      const b = txt('button', texto, 'sec peq');
      b.type = 'button';
      b.onclick = () => abrirDocumento(`/api/admin/eventos/${e.id}/${tipo}`, `${texto.replace('Ver ', '')} · ${e.tipo}`, {}).catch(alertar);
      return b;
    };
    const saldo = e.cuotas.filter(c => !c.pagada).reduce((s, c) => s + c.monto, 0);
    ficha.append(el('div', 'card',
      txt('h3', `${e.tipo} · ${fechaLarga(e.fecha)}`),
      txt('p', `Seña ${money(e.sena)} · Valor final ${money(e.valor_final)} · Saldo pendiente ${money(saldo)}`),
      txt('p', `Adicionales: ${e.adicionales || 'Ninguno'}`),
      el('div', 'acciones-evento', botonDoc('Ver contrato', 'contrato'), botonDoc('Ver presupuesto', 'presupuesto')),
      el('table', null,
        el('thead', null, el('tr', null, ...['Cuota', 'Mes', 'Monto', 'Estado'].map(t => txt('th', t)))),
        el('tbody', null, ...e.cuotas.map(c => el('tr', null,
          txt('td', `#${c.numero}`), txt('td', nombreMes(c.mes)), txt('td', money(c.monto)),
          txt('td', estadoCuotaAdmin(c, hoy))))))
    ));
  });

  // Pagos informados
  const bloquePagos = el('div', 'card', txt('h3', 'Pagos informados'));
  if (!f.pagos.length) bloquePagos.append(txt('p', 'No hay pagos informados.'));
  else bloquePagos.append(el('table', null,
    el('thead', null, el('tr', null, ...['Fecha de transferencia', 'Monto', 'Estado', 'Comprobante'].map(t => txt('th', t)))),
    el('tbody', null, ...f.pagos.map(p => {
      const ver = txt('button', 'Ver', 'sec peq');
      ver.type = 'button';
      const visor = el('div');
      ver.onclick = async () => {
        try {
          const url = await descargarProtegido(`/api/admin/pagos/${p.id}/comprobante`);
          visor.replaceChildren();
          if (p.mime === 'application/pdf') visor.append(Object.assign(document.createElement('a'), { href: url, target: '_blank', textContent: 'Abrir PDF' }));
          else visor.append(Object.assign(document.createElement('img'), { src: url, style: 'max-width:280px;border:1px solid #ddd;border-radius:6px;margin-top:6px;' }));
        } catch (err) { alertar(err); }
      };
      return el('tr', null,
        txt('td', p.fecha_transferencia), txt('td', money(p.monto)),
        txt('td', p.estado === 'aprobado' ? 'Aprobado' : (p.estado === 'rechazado' ? `Rechazado${p.motivo ? ': ' + p.motivo : ''}` : 'En revisión')),
        el('td', null, ver, visor));
    }))));
  ficha.append(bloquePagos);

  // Mensajes de WhatsApp
  const bloqueMsj = el('div', 'card', txt('h3', 'Recordatorios de WhatsApp'));
  if (!f.mensajes.length) bloqueMsj.append(txt('p', 'No se enviaron recordatorios.'));
  else bloqueMsj.append(el('table', null,
    el('thead', null, el('tr', null, ...['Mes', 'Monto', 'Estado', 'Detalle'].map(t => txt('th', t)))),
    el('tbody', null, ...f.mensajes.map(m => el('tr', null,
      txt('td', nombreMes(m.mes)), txt('td', money(m.monto)),
      txt('td', m.estado === 'enviado' ? 'Enviado' : (m.estado === 'error' ? 'No enviado' : 'Pendiente')),
      txt('td', m.estado === 'enviado' ? `Enviado ${m.enviado_en || ''}` : (m.error || '-')))))));
  ficha.append(bloqueMsj);
  ficha.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#buscarCliente').addEventListener('input', () => {
  clearTimeout(timerBusqueda);
  timerBusqueda = setTimeout(() => buscarClientes().catch(alertar), 250);
});

async function cargarTodo() {
  await Promise.all([cargarPagos(), cargarEventos(), cargarMensajes(), buscarClientes()]);
}

async function iniciar() {
  mostrarPanel();
  irA('inicio');
  if (!$('#listaCuotas').children.length) $('#listaCuotas').append(filaCuota());
  try {
    await cargarTipos();
    await cargarTodo();
    actualizarRecomendacion();
  } catch (err) { mostrarLogin(); }
}

// Si ya hay sesión de administrador, entra directo
api('/api/admin/sesion').then(iniciar).catch(() => mostrarLogin());
