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

CREATE TABLE IF NOT EXISTS pagos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  dni                 TEXT NOT NULL,
  monto               REAL NOT NULL,
  fecha_transferencia TEXT NOT NULL,      -- YYYY-MM-DD HH:MM informada por el cliente
  comprobante         TEXT NOT NULL,      -- nombre del archivo en data/comprobantes
  mime                TEXT NOT NULL,
  estado              TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | aprobado | rechazado
  motivo              TEXT,
  creado_en           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  revisado_en         TEXT
);

CREATE TABLE IF NOT EXISTS mensajes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dni         TEXT NOT NULL,
  cuota_id    INTEGER REFERENCES cuotas(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,            -- 'atraso'
  telefono    TEXT,
  texto       TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | enviado | error
  error       TEXT,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  enviado_en  TEXT,
  UNIQUE (cuota_id, tipo)
);

CREATE TABLE IF NOT EXISTS sesiones (
  token      TEXT PRIMARY KEY,
  rol        TEXT NOT NULL,              -- 'cliente' | 'admin'
  dni        TEXT,
  expira     INTEGER NOT NULL            -- epoch ms
);
`);

// Migración: columna pago_id en cuotas (para saber si una cuota está en revisión)
const columnas = db.prepare('PRAGMA table_info(cuotas)').all().map(c => c.name);
if (!columnas.includes('pago_id')) {
  db.exec('ALTER TABLE cuotas ADD COLUMN pago_id INTEGER REFERENCES pagos(id)');
}

if (!columnas.includes('mes')) {
  db.exec('ALTER TABLE cuotas ADD COLUMN mes TEXT');
  db.exec("UPDATE cuotas SET mes = substr(vencimiento, 1, 7) WHERE mes IS NULL");
}

const columnasClientes = db.prepare('PRAGMA table_info(clientes)').all().map(c => c.name);
if (!columnasClientes.includes('telefono')) {
  db.exec('ALTER TABLE clientes ADD COLUMN telefono TEXT');
}

const columnasEventos = db.prepare('PRAGMA table_info(eventos)').all().map(c => c.name);
for (const [nombre, tipo] of [['horario_inicio', 'TEXT'], ['horario_fin', 'TEXT'], ['adultos', 'INTEGER'], ['ninos', 'INTEGER']]) {
  if (!columnasEventos.includes(nombre)) db.exec(`ALTER TABLE eventos ADD COLUMN ${nombre} ${tipo}`);
}

module.exports = db;
