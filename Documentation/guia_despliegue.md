# Guía de Desarrollo Local - Portal de Personajes D&D

Esta guía detalla los pasos necesarios para desplegar y ejecutar el **Portal del Gremio de Héroes D&D** en tu entorno de desarrollo local, utilizando la nueva arquitectura basada en Node.js.

---

## Arquitectura del Sistema

* **Backend**: Node.js (Express.js) actuando como una API REST robusta y rápida.
* **Frontend**: HTML5, CSS3 vainilla y JavaScript asíncrono servidos estáticamente.
* **Persistencia**: **PostgreSQL** (alojado en la nube, p.ej. Supabase) como fuente única y exclusiva de verdad. Almacenamiento de archivos binarios e imágenes localmente en `html/img/uploads/`.
* **Seguridad**: Autenticación vía JWT (JSON Web Tokens) y contraseñas cifradas en servidor (PBKDF2 SHA-256).

---

## Despliegue en Entorno de Desarrollo (Local)

### Requisitos Previos
* **Node.js**: Versión 18 o superior.
* **npm**: Gestor de paquetes de Node.
* **Base de datos PostgreSQL**: Cadena de conexión válida (ej. Supabase).
* **Python**: (Opcional, únicamente usado para generar certificados locales HTTPS mediante el script legado).

### Pasos de Instalación

1. **Clonar o descargar el proyecto** en tu espacio de trabajo local:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd Catalogo_D-D
   ```

2. **Instalar dependencias del sistema**:
   Ejecuta el gestor de paquetes para descargar Express, PG, JWT, y demás herramientas.
   ```bash
   npm install
   ```

3. **Configurar Variables de Entorno**:
   Copia el archivo `.env.example` (si existe) o edita directamente el archivo `.env` en la raíz del proyecto. **Es obligatorio** definir las credenciales de PostgreSQL:
   ```env
   # Llave secreta para firmar las sesiones (Inventa una o usa un generador de contraseñas)
   SECRET_KEY="una_clave_super_secreta_y_larga"

   # URL de conexión a tu base de datos PostgreSQL (ej. Supabase)
   DATABASE_URL="postgresql://usuario:password@host:5432/postgres"

   # Credenciales para el administrador por defecto (Si no existe, se creará al iniciar)
   ADMIN_USERNAME="admin"
   ADMIN_PASSWORD="password_seguro"
   ```

4. **Generar certificados SSL autofirmados locales** (Recomendado para simular un entorno seguro en local):
   Para que la cámara y otras APIs del navegador funcionen correctamente, necesitas iniciar el servidor bajo HTTPS.
   ```bash
   python3 generar_cert.py
   ```
   *(Esto generará los archivos `key.pem` y `cert.pem` en la raíz)*

5. **Iniciar el servidor local**:
   * **Modo Desarrollo (Recomendado, usa Nodemon para autorecarga)**:
     ```bash
     npm run dev
     ```
   * **Modo Producción**:
     ```bash
     npm start
     ```

6. **Verificación**: 
   Abre en tu navegador `https://127.0.0.1:8081` (acepta el riesgo de seguridad del certificado autofirmado en tu navegador) o `http://127.0.0.1:8081` si no generaste certificados.

---

## Notas Post-Migración
Si provienes de una versión anterior del repositorio, ten en cuenta que **MongoDB y los archivos JSON locales (`data/*.json`) ya no tienen ningún uso**. El servidor no creará respaldos en el disco duro ni tiene mecanismos de fallback; depende 100% de la disponibilidad de la base de datos PostgreSQL definida en el archivo `.env`.
