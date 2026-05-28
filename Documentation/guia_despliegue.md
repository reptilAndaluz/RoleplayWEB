# Guía de Despliegue Profesional - Portal de Personajes D&D

Esta guía detalla los pasos necesarios para desplegar el **Portal del Gremio de Héroes D&D** en entornos locales y en un servidor de producción Linux (Ubuntu/Debian) utilizando buenas prácticas de la industria, incluyendo control de servicios con **Systemd**, proxy inverso con **Nginx**, certificados seguros con **Let's Encrypt** y automatización de copias de seguridad.

---

## 🏛️ Arquitectura del Sistema

* **Backend**: Python 3 (FastAPI + Uvicorn) actuando como una API REST robusta y ligera.
* **Frontend**: HTML5, CSS3 vainilla y JavaScript asíncrono servidos estáticamente.
* **Persistencia**: Archivos planos estructurados en formato **JSON** (`data/`) y almacenamiento de archivos binarios en el servidor (`html/img/uploads/`).

---

## 💻 1. Despliegue en Entorno de Desarrollo (Local)

### Requisitos Previos
* **Python**: Versión 3.8 o superior.
* **OpenSSL** (opcional, para HTTPS local).

### Pasos de Instalación

1. **Clonar o descargar el proyecto** en tu espacio de trabajo local:
   ```bash
   cd /home/reptil/Documentos/Catalogo_D-D
   ```

2. **Crear y activar un entorno virtual de Python**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Instalar dependencias del sistema**:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. **Generar certificados SSL autofirmados locales** (Recomendado para simular producción):
   ```bash
   python generar_cert.py
   ```

5. **Iniciar el servidor local**:
   * **Con HTTPS (Recomendado)**:
     ```bash
     python -m uvicorn server:app --reload --port 8081 --host 127.0.0.1 --ssl-keyfile=key.pem --ssl-certfile=cert.pem
     ```
   * **Con HTTP estándar**:
     ```bash
     python -m uvicorn server:app --reload --port 8081 --host 127.0.0.1
     ```

6. **Verificación**: Abre en tu navegador `https://127.0.0.1:8081` (acepta el riesgo de seguridad del certificado autofirmado) o `http://127.0.0.1:8081`.

---

## ☁️ 2. Despliegue en Producción (Servidor VPS Linux)

Para un entorno de producción real en la nube (AWS, DigitalOcean, Linode, etc.) con el dominio `gremioheroes.tu-dominio.com`, sigue rigurosamente los siguientes pasos.

### 2.1 Preparación de Variables de Entorno Seguras
Configura las claves de producción. Nunca utilices los valores por defecto del código fuente. Puedes inyectar estas variables al sistema de servicios de Linux.
* `SECRET_KEY`: Una cadena hexadecimal larga generada aleatoriamente (ej. `openssl rand -hex 32`) para firmar y validar tokens JWT.

### 2.2 Configuración del Servicio con Systemd
Para asegurar que la aplicación FastAPI se ejecute en segundo plano, se inicie automáticamente con el sistema y se reinicie en caso de fallo, utilizaremos **Systemd**.

1. Crea el archivo de servicio `/etc/systemd/system/dnd-portal.service`:
   ```bash
   sudo nano /etc/systemd/system/dnd-portal.service
   ```

2. Pega el siguiente contenido (ajusta las rutas de tu usuario `/home/reptil/` correspondientes):
   ```ini
   [Unit]
   Description=Servidor FastAPI del Portal de Personajes D&D
   After=network.target

   [Service]
   User=reptil
   WorkingDirectory=/home/reptil/Documentos/Catalogo_D-D
   ExecStart=/home/reptil/Documentos/Catalogo_D-D/venv/bin/python -m uvicorn server:app --port 8000 --host 127.0.0.1
   Restart=always
   RestartSec=5
   Environment=SECRET_KEY=e8312e09ff7b5fa367aaee1728da4f4b23267d643fe8d249f3e9aefbb2d13da0

   [Install]
   WantedBy=multi-user.target
   ```

3. Guarda el archivo, recarga el demonio de Systemd, arranca el servicio y configúralo para que se ejecute al inicio:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start dnd-portal.service
   sudo systemctl enable dnd-portal.service
   ```

4. Comprueba que el servicio esté corriendo correctamente:
   ```bash
   sudo systemctl status dnd-portal.service
   ```

---

### 2.3 Configuración del Proxy Inverso con Nginx
**Nginx** actuará como servidor web de alto rendimiento. Se encargará de:
* Terminar la conexión segura SSL/HTTPS de forma eficiente.
* Servir el frontend estático (`/html/`) directamente a velocidad de memoria sin saturar a Python.
* Derivar las peticiones de la API (`/api/`) al servidor FastAPI que corre localmente en el puerto `8000`.

1. Instala Nginx en el servidor Linux:
   ```bash
   sudo apt update
   sudo apt install nginx -y
   ```

2. Crea el archivo de configuración del bloque de servidor en Nginx:
   ```bash
   sudo nano /etc/nginx/sites-available/dnd-portal
   ```

3. Pega la siguiente configuración profesional optimizada:
   ```nginx
   server {
       listen 80;
       server_name gremioheroes.tu-dominio.com;

       # Redirigir tráfico HTTP a HTTPS automáticamente
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name gremioheroes.tu-dominio.com;

       # Cabeceras estrictas de seguridad web (Prevenir ataques XSS, Clickjacking e inyecciones)
       add_header X-Frame-Options "DENY" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-XSS-Protection "1; mode=block" always;
       add_header Referrer-Policy "strict-origin-when-cross-origin" always;
       add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: http: https:; frame-src https://www.youtube.com https://youtube.com;" always;

       # Logs de acceso y errores
       access_log /var/log/nginx/dnd_portal_access.log;
       error_log /var/log/nginx/dnd_portal_error.log;

       # Optimización: Servir contenido estático directamente por Nginx
       location /html/ {
           alias /home/reptil/Documentos/Catalogo_D-D/html/;
           expires 7d;
           add_header Cache-Control "public, no-transform";
           try_files $uri $uri/ =404;
       }

       # Redirección raíz al Login
       location = / {
           return 301 /html/index.html;
       }

       # Redirección de llamadas a la API de Python (FastAPI)
       location /api/ {
           proxy_pass http://127.0.0.1:8000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           
           # Aumentar límites para subidas pesadas de galería
           client_max_body_size 25M;
       }
   }
   ```

4. Habilita la configuración enlazándola a `sites-enabled` y retira la configuración por defecto de Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/dnd-portal /etc/nginx/sites-enabled/
   sudo rm /etc/nginx/sites-enabled/default
   ```

5. Comprueba que no haya errores de sintaxis en Nginx y reinicia el servicio:
   ```bash
   sudo nginx -t
   sudo systemctl restart nginx
   ```

---

### 2.4 Habilitar SSL/HTTPS Real con Let's Encrypt
Para proteger las contraseñas y fichas de tus jugadores en el tráfico web, utiliza **Certbot** para obtener certificados SSL gratuitos de Let's Encrypt válidos en todos los navegadores modernos.

1. Instala Certbot y el plugin para Nginx:
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   ```

2. Ejecuta Certbot para que analice la configuración de Nginx y genere los certificados automáticamente:
   ```bash
   sudo certbot --nginx -d gremioheroes.tu-dominio.com
   ```
   *(Sigue las instrucciones en pantalla, introduce tu correo de administrador y acepta los términos. Certbot modificará de forma segura el bloque de Nginx para incluir los certificados correspondientes y configurará una tarea Cron de autorenovación para siempre).*

---

## 💾 3. Copias de Seguridad Automatizadas (Cron Job)

Dado que la persistencia de datos se realiza en formato plano JSON en la carpeta `data/` y los archivos de galería se suben a `html/img/uploads/`, salvaguardar estos archivos es sumamente sencillo.

1. Crea un script de backup `/home/reptil/Documentos/Catalogo_D-D/backup.sh`:
   ```bash
   nano /home/reptil/Documentos/Catalogo_D-D/backup.sh
   ```

2. Pega el siguiente script que compacta la base de datos JSON y las imágenes cargadas por los aventureros:
   ```bash
   #!/bin/bash
   BACKUP_DIR="/home/reptil/backups_dnd"
   SOURCE_DIR="/home/reptil/Documentos/Catalogo_D-D"
   DATE=$(date +"%Y-%m-%d_%H%M%S")

   mkdir -p "$BACKUP_DIR"

   # Generar archivo comprimido .tar.gz
   tar -czf "$BACKUP_DIR/backup_dnd_$DATE.tar.gz" -C "$SOURCE_DIR" data html/img/uploads

   # Mantener solo las copias de seguridad de los últimos 30 días para optimizar disco
   find "$BACKUP_DIR" -type f -name "backup_dnd_*.tar.gz" -mtime +30 -delete
   ```

3. Haz el script ejecutable:
   ```bash
   chmod +x /home/reptil/Documentos/Catalogo_D-D/backup.sh
   ```

4. Configura una tarea programada diaria con **Cron** para ejecutar la copia de seguridad cada noche a las 03:00 AM:
   ```bash
   crontab -e
   ```
   *(Añade la siguiente línea al final del archivo)*:
   ```cron
   0 3 * * * /home/reptil/Documentos/Catalogo_D-D/backup.sh >/dev/null 2>&1
   ```

---

## 🛠️ 4. Monitoreo y Mantenimiento Diario

### 4.1 Monitorear los Logs del Servidor FastAPI (Uvicorn)
Si detectas alguna anomalía o fallo en la invocación de personajes, puedes seguir los logs en tiempo real con Systemd:
```bash
sudo journalctl -u dnd-portal.service -f -n 100
```

### 4.2 Monitorear Logs de Nginx
* **Ver logs de peticiones y accesos**:
  ```bash
  sudo tail -f /var/log/nginx/dnd_portal_access.log
  ```
* **Ver logs de errores técnicos de proxy inverso**:
  ```bash
  sudo tail -f /var/log/nginx/dnd_portal_error.log
  ```

### 4.3 Actualizar el Portal (Despliegue Continuo Rápido)
Cuando realices cambios en los archivos CSS, JavaScript o FastAPI y quieras aplicarlos a producción:
1. Trae los últimos cambios de tu repositorio local al VPS (ej. `git pull`).
2. Si has añadido nuevas librerías, actualiza dependencias:
   ```bash
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Reinicia el servicio de Systemd para aplicar los cambios en Python:
   ```bash
   sudo systemctl restart dnd-portal.service
   ```
4. Limpia la caché en Nginx o fuerza recarga en los navegadores de tus aventureros (Ctrl+F5).
