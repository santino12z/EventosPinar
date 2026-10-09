// Respaldo de sesión: si el navegador bloquea la cookie (por ejemplo dentro de una
// vista previa embebida), el token se guarda en localStorage y se envía en el
// encabezado Authorization. Así el ingreso funciona igual.
(function () {
  const CLAVE = 'portalEventosPinarToken';
  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const token = localStorage.getItem(CLAVE);
    if (token && url.startsWith('/api/')) {
      const headers = new Headers(init.headers || {});
      if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
      init = { ...init, headers };
    }
    return originalFetch(input, init).then(async res => {
      if (res.ok && /^\/api\/(login|registro|admin\/login)$/.test(url)) {
        const data = await res.clone().json().catch(() => ({}));
        if (data.token) localStorage.setItem(CLAVE, data.token);
      }
      if (/^\/api\/logout$/.test(url)) localStorage.removeItem(CLAVE);
      return res;
    });
  };
})();
