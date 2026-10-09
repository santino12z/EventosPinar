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

function leerCookie(req, nombre) {
  const cookies = (req.headers.cookie || '').split(';').map(c => c.trim());
  const found = cookies.find(c => c.startsWith(nombre + '='));
  return found ? decodeURIComponent(found.slice(nombre.length + 1)) : null;
}

// Middleware: exige sesión del rol indicado
function exigir(rol) {
  return (req, res, next) => {
    const sesion = leerSesion(leerCookie(req, 'sid'));
    if (!sesion || sesion.rol !== rol) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    req.sesion = sesion;
    next();
  };
}

function setCookie(res, token) {
  res.setHeader('Set-Cookie',
    `sid=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURACION_MS / 1000}`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

module.exports = {
  hashPassword, verifyPassword, crearSesion, leerSesion, borrarSesion,
  leerCookie, exigir, setCookie, clearCookie
};
