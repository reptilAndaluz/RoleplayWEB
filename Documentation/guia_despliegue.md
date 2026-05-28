# Guía de Desarrollo Local - Portal de Personajes D&D

Esta guía detalla los pasos necesarios para desplegar y ejecutar el **Portal del Gremio de Héroes D&D** en tu entorno de desarrollo local.

---

## 🏛️ Arquitectura del Sistema

* **Backend**: Python 3 (FastAPI + Uvicorn) actuando como una API REST robusta y ligera.
* **Frontend**: HTML5, CSS3 vainilla y JavaScript asíncrono servidos estáticamente.
* **Persistencia**: Archivos planos estructurados en formato **JSON** (`data/`) y almacenamiento de archivos binarios localmente (`html/uploads/`).

---

## 💻 Despliegue en Entorno de Desarrollo (Local)

### Requisitos Previos
* **Python**: Versión 3.8 o superior.
* **OpenSSL** (opcional, para HTTPS local).

### Pasos de Instalación

1. **Clonar o descargar el proyecto** en tu espacio de trabajo local:
   ```bash
   cd ruta_del_repositorio
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

4. **Generar certificados SSL autofirmados locales** (Recomendado para simular un entorno seguro):
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
   * **Con HTTPS para que nos podamos conectar todos en la misma red**:
     ```bash
     python -m uvicorn server:app --reload --port 8081 --host 0.0.0.0 --ssl-keyfile=key.pem --ssl-certfile=cert.pem
     ```

6. **Verificación**: Abre en tu navegador `http://[IP_ADDRESS]:[PORT]` o `https://[IP_ADDRESS]:[PORT]` (acepta el riesgo de seguridad del certificado autofirmado).
