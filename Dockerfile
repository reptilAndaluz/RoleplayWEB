# ==========================================
# Etapa 1: Builder - Instalar dependencias
# ==========================================
FROM python:3.11-slim-bookworm AS builder

WORKDIR /app

# Instalar herramientas básicas de compilación si fueran necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements y compilar/instalar dependencias en una carpeta local
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ==========================================
# Etapa 2: Runner - Entorno de producción limpio
# ==========================================
FROM python:3.11-slim-bookworm AS runner

WORKDIR /app

# Instalar utilidades básicas y asegurar zona horaria adecuada
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Crear un usuario de sistema no privilegiado para ejecutar la app de forma segura
RUN addgroup --system gremiogroup && adduser --system --ingroup gremiogroup gremiouser

# Copiar las dependencias instaladas en la etapa de builder
COPY --from=builder /root/.local /home/gremiouser/.local
ENV PATH=/home/gremiouser/.local/bin:$PATH

# Copiar la base de código del proyecto
COPY --chown=gremiouser:gremiogroup server.py .
COPY --chown=gremiouser:gremiogroup html/ ./html/
COPY --chown=gremiouser:gremiogroup data/ ./data/

# Crear directorios para subidas físicas y bases de datos locales, y darles permisos
RUN mkdir -p /app/data /app/html/uploads \
    && chown -R gremiouser:gremiogroup /app/data /app/html/uploads \
    && chmod -R 775 /app/data /app/html/uploads

# Cambiar al usuario no privilegiado
USER gremiouser

# Exponer el puerto del servidor ASGI
EXPOSE 8000

# Variables de entorno por defecto
ENV PORT=8000
ENV PYTHONUNBUFFERED=1

# Comando de ejecución con Uvicorn de alta velocidad
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
