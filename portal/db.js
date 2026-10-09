const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'portal.db'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS clientes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  dni           TEXT NOT NULL UNIQUE,
  mail          TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS eventos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  dni          TEXT NOT NULL,            -- vincula el evento con el cliente por DNI
  tipo         TEXT NOT NULL,
  fecha        TEXT NOT NULL,            -- YYYY-MM-DD
  sena         REAL NOT NULL DEFAULT 0,
  adicionales  TEXT NOT NULL DEFAULT '',
  valor_final  REAL NOT NULL DEFAULT 0,
  creado_en    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS cuotas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id   INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  numero      INTEGER NOT NULL,
  monto       REAL NOT NULL,
  vencimiento TEXT NOT NULL,             -- YYYY-MM-DD
  pagada      INTEGER NOT NULL DEFAULT 0,
  fecha_pago  TEXT                       -- YYYY-MM-DD HH:MM, cuando se registró el pago
);

CREATE TABLE IF NOT EXISTS sesiones (
  token      TEXT PRIMARY KEY,
  rol        TEXT NOT NULL,              -- 'cliente' | 'admin'
  dni        TEXT,
  expira     INTEGER NOT NULL            -- epoch ms
);
`);

module.exports = db;
