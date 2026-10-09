# Análisis y planificación · Portal de clientes Eventos Pinar

## 1. Resumen del proyecto
Eventos Pinar es un salón de eventos que hoy gestiona las reservas, las cuotas y los presupuestos de forma manual. El proyecto agrega un **portal web** donde el cliente ve su evento y sus pagos, y un **panel de administración** para cargar eventos, cobrar y generar presupuestos.

## 2. Problemática y solución

| Problema detectado | Solución planteada |
|---|---|
| El cliente no tiene forma de ver cuánto pagó, qué le falta pagar y cuándo vence cada cuota. | Portal de clientes con cuotas pagadas y pendientes, historial y próximos eventos. |
| El administrador lleva el control de pagos a mano. | Panel con calendario, carga de eventos y cuotas, y confirmación manual de pagos con comprobante. |
| Las cuotas atrasadas se recuerdan tarde o no se recuerdan. | Recordatorio por WhatsApp (Cloud API de Meta), uno solo por cuota atrasada. |
| Los presupuestos se rehacen cada vez que alguien consulta. | **Presupuestos independientes**, numerados (PRE-0000), que se comparten por WhatsApp y se reutilizan. |
| Cargar un evento exige escribir datos a mano y es fácil equivocarse. | Desplegables para tipo de evento, horario (solo hora exacta o y media) y adicionales. |
| El contrato y el presupuesto no muestran todos los datos del evento. | El presupuesto del cliente muestra día, horario, duración, invitados, adicionales y valores. |

## 3. Objetivos
1. **Principal:** que cada cliente pueda ver su evento, su contrato, su presupuesto y sus cuotas sin llamar al salón.
2. Que el administrador cargue un evento en pocos minutos, sin errores de formato.
3. Que las cuotas atrasadas se recuerden con un mensaje automático por WhatsApp.
4. Que el portal use la paleta y el logo del sitio del salón.
5. Que el portal quede publicado en internet de forma gratuita y con HTTPS.

## 4. Primeras ideas y borradores
- **Primera versión (commit inicial del 8/10/2026):** portal con registro e ingreso de clientes, eventos, cuotas, pagos y calendario.
- **Borradores de contrato:** `portal/contrato/CONTRATO_PLANTILLA.md`, con campos a completar. Requiere revisión legal antes de usarse.
- **Diseño visual:** paleta tomada del sitio del salón (verde `#2f7a3d`, verde oscuro `#1f4d2b`, crema `#faf8f2`, dorado `#e8c97a`). Los valores son aproximados, a confirmar con el cliente.
- **Logo:** pendiente de recibir el archivo del salón.

## 5. Decisiones de diseño

| Decisión | Motivo |
|---|---|
| **Pagos confirmados a mano por el administrador**, sin pasarela de pago. | El salón recibe el dinero por fuera del portal; evita costos y trámites de una pasarela. |
| **Cuotas mensuales sin día de vencimiento fijo.** El cliente paga la cuota de cada mes. | Así lo acordó el salón. |
| **La mora empieza el día siguiente al fin del mes.** | Criterio acordado con el salón. |
| **Un solo recordatorio por cuota atrasada** (tabla `mensajes` con restricción única). | Evita spam al cliente. |
| **Plan "hasta 2 por mes (días 1 y 15)" eliminado.** | Decisión del salón. |
| **Usuario y contraseña del cliente = DNI.** | Simplifica el primer ingreso. **Riesgo aceptado** por el salón; se recomienda revisarlo. |
| **Node.js + SQLite integrado (`node:sqlite`).** | Sin compilar nada ni instalar servidor de base de datos; la base es un solo archivo, fácil de copiar. |
| **Contraseña de admin por variable de entorno** (`ADMIN_PASSWORD`), no en el código. | Evita dejar secretos en Git. |
| **Horarios solo en hora exacta o y media** (20:00, 20:30). | Pedido del salón. |
| **Total de invitados = adultos + niños.** | Pedido del salón. |
| **Adicionales como menú desplegable con casillas**, con íconos. | Más cómodo que la lista de casillas que ocupaba mucho espacio. |
| **Hosting en Oracle Cloud (plan Always Free)** con HTTPS por Caddy y servicio systemd. | Gratuito, con disco persistente para la base de datos. Render gratis no sirve para datos reales porque borra el disco. |

## 6. Riesgos
- **WhatsApp:** los envíos no se pudieron probar desde el entorno de desarrollo; dependen de la aprobación de la cuenta en Meta.
- **Contrato:** los plazos y porcentajes de mora y cancelación son de ejemplo y deben revisarse con un abogado.
- **Seguridad:** el ingreso con DNI es fácil de adivinar. Conviene migrar a una contraseña propia.
- **Copias de seguridad:** si se pierde el servidor sin copia de `portal.db`, se pierden datos.
- **Capacidad en Oracle:** la máquina gratuita puede no tener disponibilidad en algunas regiones.

## 7. Plan de 2 meses (9 oct – 8 dic 2026)

```mermaid
gantt
    title Plan de 2 meses · Portal Eventos Pinar
    dateFormat YYYY-MM-DD
    axisFormat %d/%m
    section Análisis y diseño
    Relevamiento, problemas y objetivos        :done, a1, 2026-10-08, 2026-10-08
    Paleta del sitio y diseño de pantallas      :done, a2, 2026-10-08, 2026-10-09
    section Desarrollo
    Portal de clientes (ingreso, cuotas, historial) :done, d1, 2026-10-08, 2026-10-08
    Panel admin: eventos, calendario y pagos    :done, d2, 2026-10-08, 2026-10-09
    Presupuestos independientes y adicionales   :active, d3, 2026-10-09, 2026-10-16
    Datos del salón y contrato final            :d4, 2026-10-12, 2026-10-23
    Revisión legal del contrato (abogado)       :d5, 2026-10-12, 2026-11-15
    section Publicación
    Servidor Oracle Cloud y HTTPS               :p1, 2026-10-19, 2026-10-30
    Botón del portal en el sitio del salón      :p2, 2026-10-30, 2026-11-03
    section Pruebas
    Pruebas en celular y computadora            :t1, 2026-10-26, 2026-11-06
    WhatsApp Cloud API: aprobación y prueba real :t2, 2026-10-19, 2026-11-20
    Corrección de errores                       :t3, 2026-11-06, 2026-11-20
    section Puesta en marcha
    Capacitación del administrador              :s1, 2026-11-20, 2026-11-27
    Carga de clientes y eventos reales          :s2, 2026-11-23, 2026-12-08
    Seguimiento y mejoras                       :s3, 2026-11-27, 2026-12-08
```

**Hitos:**
- **23/10:** presupuestos y contrato terminados.
- **3/11:** portal publicado con HTTPS y enlazado desde el sitio.
- **20/11:** WhatsApp probado con mensajes reales.
- **8/12:** cierre del plan, con el portal en uso.

## 8. Estado al día de hoy
- Hecho: portal de clientes, panel admin, calendario, cuotas, pagos, buscador de clientes, paleta del sitio, selector de adicionales, guía de despliegue.
- En curso: presupuestos independientes (creación, numeración y envío por WhatsApp), pruebas en navegador.
- Pendiente: logo del salón, aprobación de WhatsApp, publicación en Oracle Cloud, botón en el sitio.
