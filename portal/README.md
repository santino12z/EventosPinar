# Portal de clientes · Eventos Pinar

Portal donde los clientes que alquilaron el salón se registran (nombre, DNI, mail y contraseña) y ven:

- Tipo de evento, fecha, seña, adicionales y valor final.
- Cuotas pagadas, con fecha y hora del pago.
- Cuotas pendientes, con su fecha de vencimiento y los días que faltan (o cuánto venció).
- Próximos eventos e historial de eventos realizados.

El administrador carga los eventos y cuotas y marca los pagos desde `admin.html`.

## Requisitos

- Node.js **22.5 o superior** (usa el SQLite integrado de Node, sin compilar nada).

## Puesta en marcha

```bash
cd portal
npm install
ADMIN_PASSWORD="una-clave-segura" npm start
```

Después abrí `http://localhost:3000/ingreso.html` (clientes) o `http://localhost:3000/admin.html` (administrador).

Si no definís `ADMIN_PASSWORD`, el servidor genera una temporal y la muestra en la consola al iniciar.

Variables opcionales: `PORT` (por defecto 3000).

## Cómo funciona

| Página | Quién la usa |
|---|---|
| `public/ingreso.html` | Clientes: ingresar o registrarse con DNI y contraseña |
| `public/panel.html` | Clientes: ver sus eventos, cuotas e historial |
| `public/admin.html` | Administrador: cargar eventos y cuotas, marcar pagos |

El cliente ve los eventos asociados a su **DNI**. Por eso, al cargar un evento, el DNI tiene que coincidir con el que usó el cliente al registrarse. Si el cliente todavía no se registró, el evento queda guardado y lo ve cuando cree su cuenta.

### Base de datos

Archivo SQLite en `data/portal.db` (se crea solo). Tablas:

- `clientes`: nombre, DNI (único), mail (único), contraseña con hash scrypt.
- `eventos`: DNI, tipo, fecha, seña, adicionales, valor final.
- `cuotas`: evento, número, monto, vencimiento, pagada, fecha y hora de pago.
- `sesiones`: sesiones activas (12 horas).

Para hacer copias de seguridad, copiá `data/portal.db`.

### Seguridad

- Contraseñas con hash scrypt y sal; nunca se guardan en texto plano.
- Cookie de sesión `HttpOnly` y `SameSite=Strict`.
- Los clientes solo acceden a sus propios eventos (filtrado por la sesión en el servidor).
- El administrador usa una contraseña separada, comparada en tiempo constante.

Antes de publicarlo en internet: servir detrás de HTTPS y definir una `ADMIN_PASSWORD` fuerte.

## Contrato

`contrato/CONTRATO_PLANTILLA.md` es un borrador de contrato de locación con los campos a completar. **Debe ser revisado por un abogado** antes de usarlo, porque los plazos, porcentajes de devolución y mora son ejemplos.

## Próximos pasos posibles

- Recuperación de contraseña por mail.
- Subida de comprobantes de pago por parte del cliente.
- Envío automático de recordatorios de vencimiento.
- Generar el contrato en PDF con los datos del evento.
