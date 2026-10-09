const $ = s => document.querySelector(s);

function mostrar(id, texto, tipo) {
  const el = $(id);
  el.textContent = texto;
  el.className = 'msg ' + (tipo || '');
}

async function post(url, datos) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos), credentials: 'same-origin'
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Error inesperado');
  return data;
}

function formDatos(form) {
  return Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]));
}

$('#tabLogin').onclick = () => cambiar('login');
$('#tabRegistro').onclick = () => cambiar('registro');

function cambiar(modo) {
  const esLogin = modo === 'login';
  $('#formLogin').classList.toggle('oculto', !esLogin);
  $('#formRegistro').classList.toggle('oculto', esLogin);
  $('#tabLogin').classList.toggle('activo', esLogin);
  $('#tabRegistro').classList.toggle('activo', !esLogin);
}

$('#formLogin').onsubmit = async e => {
  e.preventDefault();
  try {
    await post('/api/login', formDatos(e.target));
    await mostrarPanelCliente();
  } catch (err) { mostrar('#msgLogin', err.message, 'error'); }
};

$('#formRegistro').onsubmit = async e => {
  e.preventDefault();
  try {
    await post('/api/registro', formDatos(e.target));
    await mostrarPanelCliente();
  } catch (err) { mostrar('#msgRegistro', err.message, 'error'); }
};

async function mostrarPanelCliente() {
  const ok = await window.cargarPanel();
  if (!ok) throw new Error('No se pudo abrir tu cuenta. Probá de nuevo.');
  $('#cardIngreso').classList.add('oculto');
  $('#panelCliente').classList.remove('oculto');
}
