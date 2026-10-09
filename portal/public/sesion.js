// Sesión sin depender de cookies ni del almacenamiento del navegador.
// El token llega en la dirección de la página (?t=...) después de ingresar, o se
// guarda en memoria mientras la página esté abierta. Se envía en el encabezado
// Authorization de cada pedido a /api/.
(function () {
  const CLAVE = 'portalEventosPinarToken';
  const originalFetch = window.fetch.bind(window);

  let token = new URLSearchParams(location.search).get('t');
  if (!token) {
    try { token = localStorage.getItem(CLAVE); } catch (e) { token = null; }
  }
  window.portalToken = token || null;

  function guardar(t) {
    window.portalToken = t;
    try { localStorage.setItem(CLAVE, t); } catch (e) { /* almacenamiento bloqueado: se usa solo la memoria */ }
  }
  function borrar() {
    window.portalToken = null;
    try { localStorage.removeItem(CLAVE); } catch (e) { /* ignorar */ }
  }

  window.fetch = function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (window.portalToken && url.startsWith('/api/')) {
      const headers = new Headers(init.headers || {});
      if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + window.portalToken);
      init = { ...init, headers };
    }
    return originalFetch(input, init).then(async res => {
      if (res.ok && /^\/api\/(login|registro|admin\/login)$/.test(url)) {
        const data = await res.clone().json().catch(() => ({}));
        if (data.token) guardar(data.token);
      }
      if (/^\/api\/logout$/.test(url)) borrar();
      return res;
    });
  };
})();
