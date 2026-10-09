// Visor de contrato y presupuesto: abre el documento dentro de la página (sin ventanas emergentes)
// y permite imprimirlo o guardarlo como PDF.
(function () {
  window.abrirDocumento = async function (url, titulo, headers = {}) {
    const r = await fetch(url, { credentials: 'same-origin', headers });
    if (!r.ok) throw new Error('No se pudo abrir el documento');
    const html = await r.text();

    const cerrar = () => overlay.remove();
    const barra = document.createElement('div');
    barra.className = 'visor-barra';
    const titulo_ = document.createElement('strong');
    titulo_.textContent = titulo;
    const botonCerrar = document.createElement('button');
    botonCerrar.type = 'button';
    botonCerrar.className = 'sec peq';
    botonCerrar.textContent = 'Cerrar';
    botonCerrar.onclick = cerrar;
    barra.append(titulo_, botonCerrar);

    const frame = document.createElement('iframe');
    frame.className = 'visor-frame';
    frame.setAttribute('title', titulo);
    frame.srcdoc = html;

    const overlay = document.createElement('div');
    overlay.className = 'visor-overlay';
    overlay.append(barra, frame);
    document.body.append(overlay);
  };
})();
