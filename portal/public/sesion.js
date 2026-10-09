// Sesión sin cookies ni almacenamiento del navegador (la vista previa embebida los bloquea).
// El token llega en la dirección de la página (?t=...) después de ingresar, o se
// mantiene en memoria mientras la página esté abierta. Se envía en el encabezado
// Authorization de cada pedido a /api/.
(function () {
  const originalFetch = window.fetch.bind(window);

  const desdeUrl = new URLSearchParams(location.search).get('t');
  window.portalToken = desdeUrl || null;

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
        if (data.token) window.portalToken = data.token;
      }
      if (/^\/api\/logout$/.test(url)) window.portalToken = null;
      return res;
    });
  };
})();
