# 🏰 Guía de Despliegue en Servidor Propio (Debian Linux)

Esta guía detalla los pasos sencillos y directos para instalar, configurar y mantener en pie tu **Catálogo de Personajes D&D** en un servidor con **Debian Linux** (Debian 11 Bullseye o Debian 12 Bookworm), utilizando la IP pública de tu servidor para acceder y garantizando la persistencia total de tus bases de datos e imágenes.

---

## 📋 1. Preparación del Servidor Debian

Antes de comenzar, conéctate a tu servidor mediante SSH y actualiza el sistema instalando las herramientas básicas necesarias.

```bash
# Actualizar repositorios e índices de paquetes de Debian
sudo apt update && sudo apt upgrade -y

# Instalar utilidades esenciales de compilación, control de versiones y servidor web
sudo apt install -y git curl build-essential python3-pip python3-venv python3-dev nginx
```

---

## 🐋 2. Opción A: Despliegue con Docker & Docker Compose (Senda Recomendada)

Docker aísla la aplicación por completo del sistema operativo principal, eliminando cualquier conflicto de librerías de Python y facilitando el mantenimiento.

### Paso 2.1: Instalar Docker en Debian

Instala el motor oficial de Docker utilizando su repositorio oficial para Debian:

```bash
# Agregar la GPG oficial de Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Configurar el repositorio APT oficial de Docker
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar los paquetes oficiales de Docker y Compose
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Iniciar y habilitar el servicio
sudo systemctl enable --now docker
```

### Paso 2.2: Configurar las Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto para definir tus contraseñas y claves secretas:

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

*Guarda el archivo en nano pulsando `Ctrl+O`, `Enter` y luego sal con `Ctrl+X`.*

### Paso 2.3: Lanzar la Aplicación

Arranca los contenedores de forma automatizada. Gracias a los volúmenes configurados, las bases de datos de `./data` y los archivos multimedia subidos en `./html/uploads` se escribirán en el disco de tu Debian de forma totalmente persistente:

```bash
# Levantar el servicio en segundo plano
docker compose up -d --build
```

---

## ⚙️ 3. Opción B: Despliegue Nativo con Systemd (Senda Clásica)

Si prefieres ejecutar el servidor directamente sobre el sistema Debian (sin contenedores), utilizaremos un entorno virtual (`venv`) de Python y el gestor de servicios `systemd`.

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
> Si clonaste el proyecto en una ruta distinta a `/home/reptil/Documentos/Catalogo_D-D` o utilizas un usuario Debian diferente a `reptil`, edita el servicio con `sudo nano /etc/systemd/system/gremio-heroes.service` (o `TERM=xterm sudo nano /etc/systemd/system/gremio-heroes.service` si tienes problemas con tu terminal) y ajusta las rutas de `WorkingDirectory`, `ExecStart` y el parámetro `User`.

### Paso 3.3: Iniciar y Habilitar el Servicio

Recarga el daemon de systemd y activa la aplicación para que arranque automáticamente en cada reinicio del servidor Debian:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gremio-heroes.service
sudo systemctl start gremio-heroes.service

# Verificar que está corriendo correctamente sin fallos
sudo systemctl status gremio-heroes.service
```

---

## 🌐 4. Configurar Nginx como Proxy Inverso

Nginx actuará como guardián de entrada. Servirá todo el frontend estático a la velocidad del rayo directamente desde el disco y redirigirá las consultas de la API `/api` al backend de Python.

### Paso 4.1: Registrar el sitio en Nginx

Copia nuestro archivo de configuración óptimo al directorio de sitios disponibles de Nginx en Debian:

```bash
sudo cp nginx.conf /etc/nginx/sites-available/gremio-heroes
```

> [!NOTE]
> Edita el archivo con `sudo nano /etc/nginx/sites-available/gremio-heroes` y asegúrate de que el parámetro `root` y la directiva `alias` en `/html/img/uploads/` apunten de forma exacta al directorio absoluto donde está clonado tu proyecto.

### Paso 4.2: Activar el Sitio y Reiniciar Nginx

Crea el enlace simbólico para activar el sitio, retira la configuración por defecto de Nginx y reinicia el servicio:

```bash
# Crear enlace simbólico
sudo ln -s /etc/nginx/sites-available/gremio-heroes /etc/nginx/sites-enabled/

# Desactivar el sitio por defecto de Nginx
sudo rm /etc/nginx/sites-enabled/default

# Validar que la sintaxis de Nginx sea correcta
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

---

## 🚀 5. Acceso a la Aplicación y Seguridad

¡Ya has completado la instalación básica!

### Acceso Directo por IP
Ya puedes abrir cualquier navegador en tu PC o dispositivo e ingresar directamente utilizando la dirección IP pública de tu servidor Debian:

`http://LA_IP_PUBLICA_DE_TU_SERVIDOR`

*(Puedes obtener la IP pública de tu servidor ejecutando `curl ifconfig.me` en su terminal).*

### ¿Y si en el futuro añado un Dominio y SSL?
Si en el futuro decides comprar un dominio real (ej: `tudominio.com`), añadir seguridad HTTPS (SSL) gratuita con Let's Encrypt es sumamente fácil:

1. Modifica la línea `server_name _;` en tu archivo de Nginx (`/etc/nginx/sites-available/gremio-heroes`) para que contenga tu dominio:
   ```nginx
   server_name tudominio.com www.tudominio.com;
   ```
2. Instala **Certbot** y genera los certificados automáticos ejecutando:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d tudominio.com -d www.tudominio.com
   ```
   *Certbot modificará la configuración de Nginx de forma automática y creará una tarea programada para renovar el certificado SSL cada 3 meses.*

---

## 🔄 6. Actualizaciones y Mantenimiento

Cada vez que realices una mejora en tu código y la subas a tu repositorio Git, actualizar el servidor de producción Debian es tan fácil como entrar al servidor y ejecutar nuestro script automatizado:

```bash
# Ejecutar actualización automática inteligente
./deploy.sh
```

El script se encargará de hacer `git pull` de los últimos cambios y de reconstruir los contenedores Docker o de actualizar las dependencias y reiniciar el servicio Systemd según la opción que hayas elegido. ¡Fácil, rápido y a prueba de errores! ⚔️📜👑
