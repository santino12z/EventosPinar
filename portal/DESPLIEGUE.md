# Despliegue del portal en Oracle Cloud (plan Always Free)

Guía para publicar el portal en una máquina virtual gratuita. Todos los comandos se ejecutan en el servidor, por SSH, salvo que se indique otra cosa.

## 1. Crear la cuenta y la máquina
1. Entrar a oracle.com/cloud/free y crear la cuenta (pide tarjeta solo para verificar; no cobra dentro del plan gratuito).
2. Elegir la **región** con cuidado: no se puede cambiar después.
3. En la consola: **Compute → Instances → Create instance**.
   - Imagen: **Canonical Ubuntu 22.04** o 24.04.
   - Shape: **VM.Standard.E2.1.Micro** (marcada "Always Free-Eligible"). Si aparece disponible, la **VM.Standard.A1.Flex** (ARM) tiene más potencia; si dice "Out of capacity", usar E2.1.Micro.
   - En "Networking", dejar **Assign a public IPv4 address** activado.
   - Subir la clave SSH pública (o generar un par y guardar la clave privada).
4. Anotar la **IP pública** de la instancia.

## 2. Abrir los puertos 80 y 443
En Oracle: **Networking → Virtual Cloud Networks → (tu red) → Security Lists → Default Security List → Add Ingress Rules**: origen `0.0.0.0/0`, protocolo TCP, puertos `80` y `443`.

En el servidor (el firewall de Ubuntu de Oracle viene con reglas que bloquean):
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

## 3. Instalar Node 22 y Git
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v   # debe mostrar v22 o superior
```

## 4. Descargar el portal
```bash
cd /home/ubuntu
git clone https://github.com/santino12z/EventosPinar.git
cd EventosPinar/portal
npm install --omit=dev
```

## 5. Configurar las variables secretas
Crear `/home/ubuntu/eventos-pinar.env` (NO se sube a Git):
```bash
ADMIN_PASSWORD=pone-aca-la-clave-del-admin
WA_TOKEN=
WA_PHONE_NUMBER_ID=
```
Proteger el archivo: `chmod 600 /home/ubuntu/eventos-pinar.env`

Los datos de WhatsApp se completan cuando Meta apruebe la cuenta. Sin ellos el portal funciona igual, pero no envía recordatorios.

## 6. Iniciar el portal como servicio
```bash
sudo cp /home/ubuntu/EventosPinar/portal/deploy/eventos-pinar.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eventos-pinar
curl -s localhost:3000/ingreso.html | head -3   # debe responder HTML
```
Ver registros: `journalctl -u eventos-pinar -f`

## 7. Dominio gratuito y HTTPS (Caddy)
1. Entrar a **duckdns.org**, iniciar sesión y crear un subdominio (por ejemplo `eventospinar`) apuntado a la IP pública del servidor.
2. Instalar Caddy:
```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```
3. Copiar `portal/deploy/Caddyfile` a `/etc/caddy/Caddyfile`, reemplazar `TU-DOMINIO` por el subdominio y recargar:
```bash
sudo systemctl reload caddy
```
Caddy obtiene el certificado solo. Después, el portal queda en `https://TU-DOMINIO.duckdns.org`.

## 8. Actualizar el portal cuando haya cambios
```bash
cd /home/ubuntu/EventosPinar && git pull && cd portal && npm install --omit=dev
sudo systemctl restart eventos-pinar
```

## 9. Copias de seguridad de la base de datos
La base está en `/home/ubuntu/EventosPinar/portal/data/portal.db`. Copiarla periódicamente a otro lugar (por ejemplo, descargarla con `scp` cada semana). Si se pierde el servidor, sin esa copia se pierden clientes, eventos y pagos.

## Notas
- La base de datos de la prueba (sandbox) no se migra: el servidor arranca vacío y los clientes se registran de nuevo.
- Login de clientes: usuario y contraseña = DNI (decisión acordada; ver el aviso de seguridad en el README).
- Con la cuenta gratuita, la máquina puede quedar sin capacidad en algunas regiones. Si pasa, probar en otro momento o con otra región.
