const crypto = require('crypto');
const db = require('./db');

const DURACION_MS = 1000 * 60 * 60 * 12; // 12 horas

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(hash, 'hex');
  return original.length === test.length && crypto.timingSafeEqual(original, test);
}

function crearSesion(rol, dni = null) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sesiones (token, rol, dni, expira) VALUES (?, ?, ?, ?)')
    .run(token, rol, dni, Date.now() + DURACION_MS);
  return token;
}

function leerSesion(token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sesiones WHERE token = ?').get(token);
  if (!s) return null;
  if (s.expira < Date.now()) {
    db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
    return null;
  }
  return s;
}

function borrarSesion(token) {
  if (token) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

// Token: primero el encabezado Authorization (respaldo si el navegador bloquea cookies),
// y si no hay, la cookie sid.
function leerToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return leerCookie(req, 'sid');
}

function leerCookie(req, nombre) {
  const cookies = (req.headers.cookie || '').split(';').map(c => c.trim());
  const found = cookies.find(c => c.startsWith(nombre + '='));
  return found ? decodeURIComponent(found.slice(nombre.length + 1)) : null;
}

// Middleware: exige sesión del rol indicado
function exigir(rol) {
  return (req, res, next) => {
    const token = leerToken(req);
    const sesion = leerSesion(token);
    console.log(`[sesion] ${req.method} ${req.originalUrl} rol=${rol} auth=${req.headers.authorization ? 'si' : 'no'} cookie=${req.headers.cookie ? 'si' : 'no'} token=${token ? token.slice(0, 6) : '-'} -> ${sesion && sesion.rol === rol ? 'OK' : 'NO'}`);
    if (!sesion || sesion.rol !== rol) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    req.sesion = sesion;
    next();
  };
}

// La cookie se envía como SameSite=None; Secure para que el navegador la acepte
// cuando el portal se muestra dentro de otro sitio (vista previa embebida).
// Requiere HTTPS, salvo en localhost, donde los navegadores también la aceptan.
function atributosCookie() {
  return 'SameSite=None; Secure';
}

function setCookie(res, token, req) {
  res.setHeader('Set-Cookie',
    `sid=${encodeURIComponent(token)}; HttpOnly; ${atributosCookie()}; Path=/; Max-Age=${DURACION_MS / 1000}`);
}

function clearCookie(res, req) {
  res.setHeader('Set-Cookie', `sid=; HttpOnly; ${atributosCookie()}; Path=/; Max-Age=0`);
}

module.exports = {
  hashPassword, verifyPassword, crearSesion, leerSesion, borrarSesion,
  leerCookie, leerToken, exigir, setCookie, clearCookie
};
