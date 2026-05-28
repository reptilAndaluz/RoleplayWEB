# 🏰 Guía de Despliegue en Servidor Propio (Debian Linux)

Esta guía detalla los pasos místicos para instalar, configurar y mantener en pie tu **Catálogo de Personajes D&D** en un servidor con **Debian Linux** (Debian 11 Bullseye o Debian 12 Bookworm), garantizando que tus bases de datos de aventureros y las imágenes subidas sean **100% persistentes y seguras**.

---

## 📋 1. Preparación del Servidor Debian

Antes de comenzar, conéctate a tu servidor mediante SSH y asegúrate de que el sistema esté completamente actualizado e incluya las herramientas esenciales.

```bash
# Actualizar repositorios e índices de paquetes de Debian
sudo apt update && sudo apt upgrade -y

# Instalar utilidades esenciales de compilación y control de versiones
sudo apt install -y git curl build-essential python3-pip python3-venv python3-dev nginx
```

---

## 🐋 2. Opción A: Despliegue con Docker & Docker Compose (Senda Recomendada)

Docker permite aislar la aplicación por completo del sistema operativo principal, facilitando la portabilidad y eliminando cualquier conflicto de versiones de Python o librerías.

### Paso 2.1: Instalar Docker en Debian

Instala el motor oficial de Docker utilizando el repositorio oficial de Docker para Debian:

```bash
# Agregar la clave GPG oficial de Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Configurar el repositorio APT oficial de Docker para Debian
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Iniciar y habilitar el servicio de Docker
sudo systemctl enable --now docker
```

### Paso 2.2: Configurar las Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto para definir las contraseñas de forma ultra segura, alejándolas de Git:

```bash
nano .env
```

Pega y personaliza el siguiente contenido:
```ini
ADMIN_USERNAME=GranMagoGandalf
ADMIN_PASSWORD=ContraseñaSuperSegura123
SECRET_KEY=UnaCadenaLargaYAleatoriaQueFirmeLosTokensJWT
# Opcional (deja vacío si usas archivos JSON en disco)
# MONGODB_URI=mongodb+srv://...
```

### Paso 2.3: Lanzar la Aplicación

Arranca los contenedores de forma automatizada. Gracias a nuestro volumen mapeado, las bases de datos de `./data` y los archivos multimedia subidos en `./html/uploads` se escribirán en el disco de tu Debian de forma totalmente persistente.

```bash
# Levantar el servicio en segundo plano
docker compose up -d --build
```

---

## ⚙️ 3. Opción B: Despliegue Nativo con Systemd (Senda Clásica)

Si prefieres ejecutar el servidor de forma directa y nativa sobre el sistema Debian (sin contenedores), utilizaremos un entorno virtual (`venv`) y el gestor de servicios `systemd`.

### Paso 3.1: Configurar el Entorno Virtual e Instalar Dependencias

Clona el proyecto en tu servidor Debian (por ejemplo, en `/home/reptil/Documentos/Catalogo_D-D`) y ejecuta:

```bash
# Entrar al directorio del proyecto
cd /home/reptil/Documentos/Catalogo_D-D

# Crear el entorno virtual
python3 -m venv venv

# Activar el entorno e instalar las dependencias
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
```

### Paso 3.2: Configurar el Servicio Systemd

Copia nuestro archivo de servicio prediseñado al directorio de servicios del sistema de Debian:

```bash
# Copiar el archivo del servicio
sudo cp gremio-heroes.service /etc/systemd/system/gremio-heroes.service

# Asegurar los permisos
sudo chmod 644 /etc/systemd/system/gremio-heroes.service
```

> [!NOTE]
> Si clonaste el proyecto en una ruta distinta a `/home/reptil/Documentos/Catalogo_D-D` o utilizas un usuario Debian diferente a `reptil`, edita el servicio con `sudo nano /etc/systemd/system/gremio-heroes.service` y ajusta las rutas de `WorkingDirectory`, `ExecStart` y el parámetro `User`.

### Paso 3.3: Iniciar y Habilitar el Servicio

Recarga el daemon de systemd y activa la aplicación para que arranque automáticamente en cada reinicio del servidor Debian:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gremio-heroes.service
sudo systemctl start gremio-heroes.service

# Verificar que está corriendo en segundo plano sin fallos
sudo systemctl status gremio-heroes.service
```

---

## 🌐 4. Configurar Nginx como Proxy Inverso

Nginx actuará como guardián de entrada. Servirá todo el frontend estático a la velocidad del rayo directamente desde el disco y redirigirá las consultas de la API `/api` al backend de Python.

### Paso 4.1: Configuración Previa del Dominio (DNS)

Antes de configurar Nginx y solicitar el certificado SSL con Let's Encrypt, es obligatorio que tu dominio (ej. `roleplayweb.reptilandaluz.com`) apunte a la dirección IP pública de tu servidor Debian.

1. **Obtén la IP pública de tu servidor**:
   Puedes encontrarla en el panel de control de tu VPS o ejecutando en el servidor:
   ```bash
   curl ifconfig.me
   ```

2. **Configura los registros DNS**:
   Accede al panel del proveedor donde hayas comprado el dominio (Cloudflare, Namecheap, GoDaddy, etc.) y añade los siguientes registros en la zona DNS de tu dominio:

   | Tipo | Nombre | Valor | TTL |
   | :--- | :--- | :--- | :--- |
   | **A** | `@` (o vacío) | `LA_IP_PUBLICA_DE_TU_SERVIDOR` | Automático / 3600 |
   | **A** | `www` (opcional) | `LA_IP_PUBLICA_DE_TU_SERVIDOR` | Automático / 3600 |

> [!IMPORTANT]
> Los cambios en las DNS pueden tardar desde unos minutos hasta 24-48 horas en propagarse de forma global. Puedes comprobar si tu dominio ya resuelve correctamente ejecutando:
> ```bash
> ping -c 3 roleplayweb.reptilandaluz.com
> ```

### Paso 4.2: Registrar el sitio en Nginx

Copia nuestro archivo de configuración óptimo al directorio de sitios disponibles de Nginx en Debian:

```bash
sudo cp nginx.conf /etc/nginx/sites-available/gremio-heroes
```

> [!NOTE]
> Edita el archivo con `sudo nano /etc/nginx/sites-available/gremio-heroes` (o con `TERM=xterm sudo nano /etc/nginx/sites-available/gremio-heroes` si tienes problemas de terminal) y asegúrate de que el parámetro `root` y la directiva `alias` en `/html/img/uploads/` apunten de forma exacta al directorio absoluto donde está clonado tu proyecto.

### Paso 4.3: Activar el Sitio y Reiniciar Nginx

Crea el enlace simbólico para activar el sitio, valida que la sintaxis sea perfecta y reinicia el servicio Nginx:

```bash
# Crear enlace simbólico
sudo ln -s /etc/nginx/sites-available/gremio-heroes /etc/nginx/sites-enabled/

# Desactivar el sitio por defecto de Nginx si no lo usas
sudo rm /etc/nginx/sites-enabled/default

# Validar sintaxis
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

---

## 🔒 5. Asegurar la Senda con HTTPS (SSL Gratuito Let's Encrypt)

Para que tu web sea segura e impida que se intercepten las contraseñas al iniciar sesión, habilitaremos el cifrado HTTPS con Let's Encrypt y Certbot de forma automática:

```bash
# Instalar Certbot y el plugin de Nginx para Debian
sudo apt install -y certbot python3-certbot-nginx

# Generar e instalar los certificados SSL automáticamente
# (Certbot leerá tu archivo de Nginx, generará las llaves y reescribirá la configuración)
sudo certbot --nginx -d roleplayweb.reptilandaluz.com
```

> [!TIP]
> Certbot creará una tarea programada *cron* en Debian para renovar el certificado SSL automáticamente cada 3 meses.

---

## 🔄 6. Actualizaciones y Mantenimiento

Cada vez que realices una mejora en tu PC local y la subas a tu repositorio Git, actualizar el servidor de producción Debian es tan fácil como entrar al servidor y ejecutar nuestro script automatizado:

```bash
# Ejecutar actualización mágica interactiva
./deploy.sh
```

El script se encargará de hacer `git pull` de los últimos cambios y de reconstruir los contenedores Docker o de actualizar las dependencias y reiniciar el servicio Systemd según la senda que hayas elegido. ¡Fácil, rápido y a prueba de errores! ⚔️📜👑
