# Registro de Decisiones de Arquitectura y Seguridad (ADR)
Plataforma: **BurgosLabs Rol (rol.burgoslabs.es)**
Stack: **Vercel Serverless (Hono) + Neon PostgreSQL (Prisma) + React SPA**

---

## 1. Runtime Node.js para la API Serverless con Hono
- **Contexto**: Vercel ofrece runtimes Edge y Node.js.
- **Decisión**: Se selecciona **Node.js** para la función de Hono (`api/index.ts`).
- **Motivo**: `argon2` y el motor nativo de `@prisma/client` requieren soporte de APIs del sistema de Node.js (Crypto, binarios compilados), incompatibles con Edge Workers puros. Hono ofrece velocidad óptima y tipado estricto manteniendo portabilidad serverless.

---

## 2. Rate Limiting Persistente en Base de Datos (`RateLimit`)
- **Contexto**: En entornos serverless, las lambdas se instancian y destruyen bajo demanda. El rate limiting en memoria RAM local (como el plugin tradicional en memoria de Fastify/Express) es inútil porque cada invocación puede caer en un contenedor distinto.
- **Decisión**: Implementar rate limiting transaccional mediante la tabla `RateLimit` en PostgreSQL.
- **Implementación**:
  - Clave: `login:<ip>` o `register:<ip>`.
  - Ventana deslizante o fija de 1 minuto con máximo 5 intentos.
  - Al superar los 5 intentos en la ventana, se responde inmediatamente `429 Too Many Requests`.
- **Detección de IP**: Se extrae prioritariamente de `x-real-ip` o del primer valor de `x-forwarded-for` inyectados por el proxy de Vercel. No se permite falseamiento mediante cabeceras no confiables del cliente.

---

## 3. Manejo de Conexiones con Neon (`DATABASE_URL` y `DIRECT_URL`)
- **Contexto**: Neon proporciona dos tipos de cadenas de conexión: pooling con PgBouncer y conexión directa a la base de datos PostgreSQL.
- **Decisión**:
  - `DATABASE_URL`: Utiliza el host `-pooler` de Neon. Es la utilizada en runtime por la API para no agotar el límite de conexiones concurrentes ante múltiples lambdas.
  - `DIRECT_URL`: Utiliza la conexión directa sin pooler. Es requerida exclusivamente para comandos DDL como `prisma migrate dev` y `prisma migrate deploy`.
  - **Singleton de Prisma**: Se asegura una única instancia de `PrismaClient` a nivel de módulo (`globalThis.prisma`) para compartir el pool de conexiones entre invocaciones calientes de la función.

---

## 4. Sesiones en Servidor y Almacenamiento Criptográfico de Tokens
- **Contexto**: Prevenir ataques de robo de credenciales (XSS, robo de almacenamiento local, replay).
- **Decisión**:
  - Prohibido terminantemente almacenar tokens JWT o de sesión en `localStorage` o `sessionStorage`.
  - Se genera un token aleatorio criptográfico de 32 bytes (`crypto.randomBytes(32).toString('hex')`).
  - En la tabla `Session` de PostgreSQL **solo se almacena el SHA-256** del token (`tokenHash`).
  - La cookie de sesión viaja con atributos obligatorios:
    `HttpOnly; Secure; SameSite=Lax; Path=/` con caducidad de 7 días.
  - En cada login exitoso se rota la sesión anterior.

---

## 5. Prevención de Ataques CSRF
- **Contexto**: Las cookies enviadas automáticamente por el navegador pueden ser aprovechadas en peticiones entre sitios maliciosos.
- **Decisión**: En todos los métodos mutantes (`POST`, `PUT`, `PATCH`, `DELETE`), el middleware de seguridad valida que la cabecera `Origin` coincida exactamente con `ALLOWED_ORIGIN` (`https://rol.burgoslabs.es`). Si no coincide o está ausente, se aborta la petición con `403 Forbidden`.

---

## 6. Anti-Enumeración de Recursos y Usuarios
- **Contexto**: Evitar que atacantes descubran qué correos están registrados o qué IDs de fichas/campañas existen.
- **Decisión**:
  - En login: si el usuario no existe o la contraseña no coincide, se devuelve un mensaje genérico idéntico: `Credenciales inválidas`.
  - Mitigación de timing attack: si el usuario no existe, se ejecuta un hash ficticio de contraseña para simular el consumo de CPU de argon2id y mantener tiempos de respuesta equivalentes.
  - En fichas y campañas: las consultas incluyen el filtro de pertenencia (`where: { id, ownerId }`). Tanto si el recurso no existe como si pertenece a otro usuario no autorizado, la API responde un **404 Not Found** uniforme.

---

## 7. Tarea de Mantenimiento y Purga Automatizada (`/api/cron/cleanup`)
- **Contexto**: Las filas de sesiones caducadas y de rate limits antiguos acumulan espacio innecesario.
- **Decisión**: Se expone el endpoint `GET /api/cron/cleanup` invocado periódicamente por Vercel Cron.
- **Seguridad**: Requiere obligatoriamente la cabecera `Authorization: Bearer <CRON_SECRET>`. Peticiones no autenticadas o con token erróneo son rechazadas con `401 Unauthorized`.
