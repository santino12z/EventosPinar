const contenido = document.getElementById('contenido');
const bienvenida = document.getElementById('bienvenida');

// Crea un elemento con texto seguro (sin innerHTML) y los hijos indicados
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

function fechaLarga(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function diasEntre(desde, hasta) {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);
}

function estadoCuota(c, hoy) {
  if (c.pagada) {
    const hora = (c.fecha_pago || '').slice(11, 16);
    return { texto: `Pagada el ${fechaLarga(c.fecha_pago)} a las ${hora} hs`, cls: 'pagada', etiqueta: 'Pagada' };
  }
  const dias = diasEntre(hoy, c.vencimiento.slice(0, 10));
  if (dias < 0) return { texto: `Venció el ${fechaLarga(c.vencimiento)} (hace ${-dias} días)`, cls: 'vencida', etiqueta: 'Vencida' };
  if (dias === 0) return { texto: `Vence hoy (${fechaLarga(c.vencimiento)})`, cls: 'pendiente', etiqueta: 'Vence hoy' };
  return { texto: `Vence el ${fechaLarga(c.vencimiento)} (en ${dias} días)`, cls: 'pendiente', etiqueta: 'Pendiente' };
}

function tablaCuotas(cuotas, hoy) {
  if (!cuotas.length) return txt('p', 'No hay cuotas cargadas para este evento.');
  const thead = el('thead', null, el('tr', null, ...['Cuota', 'Monto', 'Estado', 'Detalle'].map(t => txt('th', t))));
  const tbody = el('tbody');
  cuotas.forEach(c => {
    const est = estadoCuota(c, hoy);
    tbody.append(el('tr', null,
      txt('td', `#${c.numero}`),
      txt('td', money(c.monto)),
      el('td', null, txt('span', est.etiqueta, `badge ${est.cls}`)),
      txt('td', est.texto)
    ));
  });
  return el('table', null, thead, tbody);
}

function tarjetaEvento(e, hoy) {
  const saldo = e.cuotas.filter(c => !c.pagada).reduce((s, c) => s + c.monto, 0);
  const pagado = e.cuotas.filter(c => c.pagada).reduce((s, c) => s + c.monto, 0) + Number(e.sena || 0);
  const dato = (etiqueta, valor) => el('div', 'dato', txt('small', etiqueta), txt('strong', valor));

  const adicionales = el('p', null, txt('strong', 'Adicionales: '), document.createTextNode(e.adicionales || 'Ninguno'));
  return el('div', 'evento',
    txt('h3', `${e.tipo} · ${fechaLarga(e.fecha)}`),
    el('div', 'grid',
      dato('Seña', money(e.sena)),
      dato('Valor final', money(e.valor_final)),
      dato('Pagado (seña + cuotas)', money(pagado)),
      dato('Saldo pendiente', money(saldo))
    ),
    adicionales,
    txt('h4', 'Cuotas'),
    tablaCuotas(e.cuotas, hoy)
  );
}

function seccion(titulo, eventos, hoy, mensajeVacio) {
  const card = el('div', 'card', txt('h2', titulo));
  if (!eventos.length) card.append(txt('p', mensajeVacio));
  eventos.forEach(e => card.append(tarjetaEvento(e, hoy)));
  return card;
}

async function cargar() {
  const meR = await fetch('/api/me', { credentials: 'same-origin' });
  if (meR.status === 401) return location.replace('ingreso.html');
  const me = await meR.json();

  const evR = await fetch('/api/mis-eventos', { credentials: 'same-origin' });
  const { hoy, proximos, historial } = await evR.json();

  bienvenida.replaceChildren(
    txt('h2', `Hola, ${me.nombre}`),
    txt('p', `DNI ${me.dni} · ${me.mail}`)
  );
  contenido.replaceChildren(
    seccion('Próximos eventos', proximos, hoy, 'No tenés eventos próximos.'),
    seccion('Historial de eventos realizados', historial, hoy, 'Todavía no hay eventos realizados.')
  );
}

document.getElementById('btnSalir').onclick = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  location.replace('ingreso.html');
};

cargar().catch(err => {
  bienvenida.replaceChildren(txt('p', 'No se pudo cargar tu cuenta. Probá ingresar de nuevo.'));
  console.error(err);
});
