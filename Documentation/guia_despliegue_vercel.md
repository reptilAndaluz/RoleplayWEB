# Guía de Despliegue en Vercel - Portal del Gremio de Héroes D&D

Esta guía detalla paso a paso cómo desplegar el **Portal del Gremio de Héroes D&D** en el entorno en la nube de **Vercel** de manera gratuita y eficiente utilizando la arquitectura adaptada.

---

## 🏛️ ¿Cómo funciona esta adaptación?

Vercel es una plataforma serverless excelente y ultrarrápida, pero con dos limitaciones para aplicaciones monolíticas tradicionales:
1. **Sistema de archivos de Solo Lectura**: No permite escribir archivos directamente en el directorio del proyecto durante la ejecución.
2. **Instancias Efímeras (Serverless)**: El servidor se apaga/reinicia constantemente según el tráfico.

Para resolver esto sin obligarte a pagar o configurar una base de datos externa de inmediato, adaptamos la aplicación de la siguiente forma:
* **Almacenamiento en `/tmp`**: Cuando la app corre en Vercel, todos los datos JSON (`usuarios.json`, `personajes.json`, `config.json`) y las imágenes subidas se guardan en el directorio `/tmp` del contenedor.
* **Inicialización Automática**: Al arrancar la instancia en Vercel, si no encuentra datos en `/tmp/data`, creará la base de datos automáticamente con el usuario administrador por defecto (`admin` con contraseña `1234`).
* **Endpoints Inteligentes**: Servimos las imágenes directamente desde `/tmp` mediante endpoints dinámicos de FastAPI para evitar errores de ruta.

> [!WARNING]
> **Almacenamiento Temporal**: Dado que las instancias serverless de Vercel se reinician periódicamente (por inactividad o despliegues), **cualquier cambio en la base de datos (nuevos personajes, nuevos usuarios, configuraciones) e imágenes subidas en Vercel se perderán al reiniciarse la función**.
> Esta configuración es ideal para **demostraciones rápidas, portfolios y entornos de prueba/QA**. Para producción a gran escala de tu gremio, se recomienda conectar FastAPI a una base de datos externa (como PostgreSQL, MongoDB o Vercel KV) y un servicio de CDN para las imágenes (como Cloudinary o AWS S3).

---

## 🚀 Método 1: Despliegue Automatizado con GitHub (Recomendado)

Esta es la forma más rápida y recomendada. Cada vez que hagas `git push` a tu repositorio, Vercel compilará y actualizará el portal automáticamente.

1. **Sube tu proyecto a GitHub**:
   Si no lo has hecho ya, crea un repositorio en GitHub (público o privado) y sube el código:
   ```bash
   git init
   git add .
   git commit -m "feat: soporte premium para despliegue en Vercel"
   git remote add origin https://github.com/tu-usuario/nombre-repositorio.git
   git branch -M main
   git push -u origin main
   ```

2. **Conéctalo a Vercel**:
   * Entra a [Vercel](https://vercel.com/) e inicia sesión con tu cuenta de GitHub.
   * Haz clic en **"Add New..."** y luego en **"Project"**.
   * Importa tu repositorio recién creado.
   * Vercel detectará el proyecto automáticamente.
   * Haz clic en **"Deploy"**. ¡Listo! En menos de 2 minutos tu portal estará online con un dominio `.vercel.app` gratuito y HTTPS automático.

---

## 💻 Método 2: Despliegue Manual con Vercel CLI

Si prefieres desplegar directamente desde la terminal de tu máquina sin pasar por GitHub:

1. **Instalar Vercel CLI de forma global**:
   *(Requiere tener Node.js instalado)*
   ```bash
   npm install -g vercel
   ```

2. **Iniciar sesión en Vercel**:
   ```bash
   vercel login
   ```
   *(Introduce tu correo o inicia sesión con tu proveedor preferido en el navegador)*

3. **Desplegar el proyecto**:
   Ejecuta el siguiente comando en la raíz del proyecto (`/home/reptil/Documentos/Catalogo_D-D`):
   ```bash
   vercel
   ```
   * **Set up and deploy?** `yes`
   * **Which scope?** Selecciona tu cuenta personal.
   * **Link to existing project?** `no`
   * **What's your project's name?** `catalogo-dnd` (o el nombre que gustes)
   * **In which directory is your code located?** `./` (raíz)
   * **Want to modify any settings?** `no` (la configuración ya está establecida perfectamente en `vercel.json`)

   Vercel subirá los archivos y te dará una URL de vista previa (preview URL).

4. **Desplegar a Producción**:
   Para generar el dominio final de producción y confirmar el despliegue:
   ```bash
   vercel --prod
   ```

---

## 🛠️ Configuración y Variables de Entorno (Opcional)

Para mayor seguridad de tu portal en producción, puedes configurar variables de entorno en el panel de control de tu proyecto en Vercel (en **Settings > Environment Variables**):

* **`SECRET_KEY`**: Define una clave secreta larga y aleatoria para firmar las sesiones de tus jugadores (JWT tokens). Ejemplo de generación rápida en terminal:
  ```bash
  openssl rand -hex 32
  ```

---

## 📂 Estructura de Archivos Creados para Vercel
Para tu conocimiento, se han incorporado los siguientes archivos clave:
* `vercel.json` (file:///home/reptil/Documentos/Catalogo_D-D/vercel.json): Configura las rutas, reescrituras del servidor web y compila la API de Python.
* `api/index.py` (file:///home/reptil/Documentos/Catalogo_D-D/api/index.py): Punto de enlace serverless que Vercel invoca para arrancar la API.
