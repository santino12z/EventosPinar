// Administración: selector de adicionales, presupuestos (crear, numerar, editar, compartir).
// Usa las funciones de admin.js (api, el, txt, $, filaCuota, mesesConsecutivos, aDate, etc.).

// ---------- Selector de adicionales: menú desplegable + lista de lo elegido ----------
function crearSelectorAdicionales(contenedor, opciones) {
  let elegidos = [];
  const select = document.createElement('select');
  const chips = el('div', 'chips');

  const pintar = () => {
    chips.replaceChildren(...(elegidos.length
      ? elegidos.map(nombre => {
          const b = txt('button', `${nombre}  ✕`, 'chip');
          b.type = 'button';
          b.title = 'Quitar';
          b.onclick = () => { elegidos = elegidos.filter(x => x !== nombre); pintar(); };
          return b;
        })
      : [txt('span', 'Ningún adicional agregado', 'ayuda')]));
  };

  select.replaceChildren(new Option('Agregar adicional...', ''), ...opciones.map(o => new Option(o, o)));
  select.onchange = () => {
    if (select.value && !elegidos.includes(select.value)) elegidos.push(select.value);
    select.value = '';
    pintar();
  };

  contenedor.replaceChildren(txt('small', 'Elegí del menú y se agrega a la lista. Para quitar uno, tocá su nombre.'), select, chips);
  pintar();
  return {
    valores: () => [...elegidos],
    limpiar: () => { elegidos = []; pintar(); },
    cargar: lista => { elegidos = [...lista]; pintar(); }
  };
}

let selPres = null;
let presEditandoId = null;

// Se llama al entrar al panel: carga las opciones y arma los selectores
async function prepararFormularios() {
  const opciones = await api('/api/admin/adicionales');
  selEvento = crearSelectorAdicionales($('#selAdicionalesEvento'), opciones);
  selPres = crearSelectorAdicionales($('#selAdicionalesPres'), opciones);
  $('#presTipo').replaceChildren(...[...$('#tipoEvento').options].map(o => o.cloneNode(true)));
}

// ---------- Textos auxiliares ----------
const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const diaLargo = iso => {
  if (!iso) return '';
  const d = aDate(iso);
  return `${DIAS_LARGOS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_LARGOS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};
function duracionEntre(a, b) {
  if (!a || !b) return '';
  if (a === b) return 'El inicio y el fin no pueden ser iguales.';
  const m = (minutosHora(b) - minutosHora(a) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  const partes = [h ? `${h} hora${h === 1 ? '' : 's'}` : '', mm ? `${mm} minutos` : ''].filter(Boolean).join(' y ');
  return `Dura ${partes}${minutosHora(b) < minutosHora(a) ? ' (termina al día siguiente)' : ''}.`;
}
// Número para WhatsApp: 549 + código de área + número (acepta 11 3433-4894 o 54 9 11 ...)
function telefonoWhatsApp(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  return '549' + d;
}

// ---------- Formulario de presupuesto ----------
function sincronizarPresupuesto() {
  $('#presTotal').value = (Number($('#presAdultos').value) || 0) + (Number($('#presNinos').value) || 0);
  $('#presDia').textContent = diaLargo($('#presFecha').value);
  $('#presDuracion').textContent = duracionEntre($('#presHoraInicio').value, $('#presHoraFin').value);
  $('#presTipoOtroWrap').classList.toggle('oculto', $('#presTipo').value !== 'Otro');
}

function abrirFormPresupuesto(p) {
  const form = $('#formPresupuesto');
  form.reset();
  $('#presCuotas').replaceChildren();
  selPres.limpiar();
  if (p) {
    $('#presTitulo').textContent = `Editar ${p.numero}`;
    form.cliente_nombre.value = p.cliente_nombre || '';
    const enLista = [...$('#presTipo').options].some(o => o.value === p.tipo);
    if (enLista) { $('#presTipo').value = p.tipo; }
    else { $('#presTipo').value = 'Otro'; $('#presTipoOtro').value = p.tipo.replace(/^Otro: /, ''); }
    $('#presFecha').value = p.fecha || '';
    $('#presHoraInicio').value = p.horario_inicio || '';
    $('#presHoraFin').value = p.horario_fin || '';
    $('#presAdultos').value = p.adultos ?? 0;
    $('#presNinos').value = p.ninos ?? 0;
    selPres.cargar(p.adicionales ? p.adicionales.split(', ') : []);
    $('#presSena').value = p.sena;
    $('#presValor').value = p.valor_final;
    $('#presCuotas').replaceChildren(...p.cuotas.map(c => filaCuota(String(c.monto), c.mes)));
  } else {
    presEditandoId = null;
    $('#presTitulo').textContent = 'Nuevo presupuesto';
    $('#presAdultos').value = 0;
    $('#presNinos').value = 0;
    $('#presSena').value = 0;
  }
  sincronizarPresupuesto();
  $('#msgPres').textContent = '';
  $('#cardListaPresupuestos').classList.add('oculto');
  $('#cardFormPresupuesto').classList.remove('oculto');
  $('#cardFormPresupuesto').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cerrarFormPresupuesto() {
  presEditandoId = null;
  $('#cardFormPresupuesto').classList.add('oculto');
  $('#cardListaPresupuestos').classList.remove('oculto');
}

function mostrarMsgPres(texto, tipo) {
  $('#msgPres').textContent = texto;
  $('#msgPres').className = 'msg ' + (tipo || '');
}

function datosPresupuesto() {
  const f = $('#formPresupuesto');
  const tipo = $('#presTipo').value === 'Otro' ? 'Otro: ' + $('#presTipoOtro').value.trim() : $('#presTipo').value;
  return {
    cliente_nombre: f.cliente_nombre.value.trim(),
    tipo,
    fecha: $('#presFecha').value || null,
    horario_inicio: $('#presHoraInicio').value || null,
    horario_fin: $('#presHoraFin').value || null,
    adultos: $('#presAdultos').value,
    ninos: $('#presNinos').value,
    adicionales: selPres.valores(),
    sena: $('#presSena').value || 0,
    valor_final: $('#presValor').value,
    cuotas: [...$('#presCuotas').querySelectorAll('[data-cuota]')].map(fila => ({
      monto: fila.querySelector('[name=monto]').value,
      mes: fila.querySelector('[name=mes]').value
    }))
  };
}

// ---------- Listado ----------
async function cargarPresupuestos() {
  const q = $('#buscarPresupuesto').value.trim();
  const lista = await api(`/api/admin/presupuestos?q=${encodeURIComponent(q)}`);
  const cont = $('#listaPresupuestos');
  cont.replaceChildren();
  if (!lista.length) {
    cont.append(txt('p', q ? 'No hay presupuestos con esa búsqueda.' : 'Todavía no creaste presupuestos.'));
    return;
  }
  const boton = (texto, accion, cls = 'sec peq') => {
    const b = txt('button', texto, cls);
    b.type = 'button';
    b.onclick = () => accion().catch(alertar);
    return b;
  };
  cont.append(el('table', null,
    el('thead', null, el('tr', null, ...['N°', 'Cliente', 'Tipo de evento', 'Fecha', 'Valor final', 'Acciones'].map(t => txt('th', t)))),
    el('tbody', null, ...lista.map(p => el('tr', null,
      txt('td', p.numero),
      txt('td', p.cliente_nombre || '-'),
      txt('td', p.tipo),
      txt('td', p.fecha ? diaLargo(p.fecha) : '-'),
      txt('td', money(p.valor_final)),
      el('td', 'acciones-tabla',
        boton('Ver', () => abrirDocumento(`/api/admin/presupuestos/${p.id}/html`, `Presupuesto ${p.numero}`, {})),
        boton('Compartir', () => abrirCompartir(p.id), 'peq'),
        boton('Editar', () => editarPresupuesto(p.id)),
        boton('Eliminar', () => eliminarPresupuesto(p.id), 'sec peq')
      ))))));
}

async function editarPresupuesto(id) {
  const p = await api(`/api/admin/presupuestos/${id}`);
  presEditandoId = id;
  abrirFormPresupuesto(p);
  $('#presTitulo').textContent = `Editar ${p.numero}`;
}

async function eliminarPresupuesto(id) {
  if (!confirm('¿Eliminar este presupuesto? Los enlaces que ya compartiste dejarán de funcionar.')) return;
  await api(`/api/admin/presupuestos/${id}`, 'DELETE');
  cargarPresupuestos();
}

// ---------- Compartir por WhatsApp o enlace ----------
async function abrirCompartir(id) {
  const p = await api(`/api/admin/presupuestos/${id}`);
  const enlace = `${location.origin}/api/presupuestos/publico/${p.token}`;
  const mensaje = `Hola${p.cliente_nombre ? ' ' + p.cliente_nombre : ''}! Te comparto el presupuesto ${p.numero} de Eventos Pinar` +
    ` para ${p.tipo}${p.fecha ? ' del ' + diaLargo(p.fecha) : ''}. Podés verlo acá: ${enlace}`;

  const telefono = Object.assign(document.createElement('input'), { placeholder: 'Ej: 11 3433-4894', inputMode: 'tel' });
  const enviar = txt('button', 'Abrir WhatsApp');
  enviar.type = 'button';
  enviar.onclick = () => {
    const n = telefonoWhatsApp(telefono.value);
    const url = n ? `https://wa.me/${n}?text=${encodeURIComponent(mensaje)}` : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  };
  const copiar = txt('button', 'Copiar enlace', 'sec');
  copiar.type = 'button';
  copiar.onclick = async () => {
    try { await navigator.clipboard.writeText(enlace); copiar.textContent = '¡Copiado!'; }
    catch { alert(enlace); }
  };
  const ver = txt('button', 'Ver presupuesto', 'sec');
  ver.type = 'button';
  ver.onclick = () => abrirDocumento(`/api/admin/presupuestos/${p.id}/html`, `Presupuesto ${p.numero}`, {}).catch(alertar);

  $('#modalCuerpo').replaceChildren(
    txt('h3', `Compartir presupuesto ${p.numero}`),
    txt('p', 'Podés mandarlo las veces que haga falta. El número no cambia.'),
    el('label', null, txt('small', 'WhatsApp del cliente (opcional)'), telefono),
    el('div', 'acciones-form', enviar, copiar, ver),
    txt('p', 'Enlace:'),
    txt('code', enlace)
  );
  $('#modalDia').classList.remove('oculto');
}

// ---------- Eventos de la pantalla ----------
$('#btnNuevoPresupuesto').onclick = () => abrirFormPresupuesto(null);
$('#btnCancelarPres').onclick = cerrarFormPresupuesto;
$('#presTipo').addEventListener('change', sincronizarPresupuesto);
['#presAdultos', '#presNinos', '#presFecha', '#presHoraInicio', '#presHoraFin'].forEach(s =>
  $(s).addEventListener('input', sincronizarPresupuesto));
$('#presHoraInicio').addEventListener('change', sincronizarPresupuesto);
$('#presHoraFin').addEventListener('change', sincronizarPresupuesto);

$('#btnAgregarCuotaPres').onclick = () => $('#presCuotas').append(filaCuota());

$('#btnGenerarPres').onclick = () => {
  const n = parseInt($('#presCantidad').value, 10);
  const primera = $('#presPrimera').value;
  if (!$('#presValor').value) return mostrarMsgPres('Indicá el valor final antes de generar las cuotas', 'error');
  const valor = Number($('#presValor').value);
  const sena = Number($('#presSena').value || 0);
  if (!n || n < 1 || n > 60) return mostrarMsgPres('La cantidad de cuotas debe estar entre 1 y 60', 'error');
  if (!primera) return mostrarMsgPres('Indicá el primer mes de cuota', 'error');
  const saldo = Math.round((valor - sena) * 100) / 100;
  if (saldo <= 0) return mostrarMsgPres('El saldo (valor final menos seña) debe ser mayor a cero', 'error');
  const base = Math.floor((saldo / n) * 100) / 100;
  const montos = Array.from({ length: n }, (_, i) => i < n - 1 ? base : Math.round((saldo - base * (n - 1)) * 100) / 100);
  const meses = mesesConsecutivos(primera, n);
  $('#presCuotas').replaceChildren(...montos.map((m, i) => filaCuota(m.toFixed(2), meses[i])));
  mostrarMsgPres(`Se generaron ${n} cuotas por ${money(saldo)} en total. Revisá antes de guardar.`, 'ok');
};

$('#formPresupuesto').onsubmit = async e => {
  e.preventDefault();
  const datos = datosPresupuesto();
  try {
    const r = presEditandoId
      ? await api(`/api/admin/presupuestos/${presEditandoId}`, 'PUT', datos)
      : await api('/api/admin/presupuestos', 'POST', datos);
    const numero = r.numero || `PRE-${String(presEditandoId).padStart(4, '0')}`;
    cerrarFormPresupuesto();
    await cargarPresupuestos();
    mostrarMsgPres('', '');
    $('#msgPres').textContent = '';
    alert(`Presupuesto ${numero} guardado.`);
  } catch (err) {
    mostrarMsgPres(err.message, 'error');
  }
};

let timerPres = null;
$('#buscarPresupuesto').addEventListener('input', () => {
  clearTimeout(timerPres);
  timerPres = setTimeout(() => cargarPresupuestos().catch(alertar), 250);
});
