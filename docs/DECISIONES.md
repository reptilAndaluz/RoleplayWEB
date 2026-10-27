# Registro de Decisiones de Arquitectura y Desarrollo (ADR)

Este documento registra las decisiones tomadas durante el desarrollo del proyecto `rol.burgoslabs.es`, especialmente ante ambigüedades o alternativas técnicas.

---

## DEC-001: Ubicación del monorepo y respaldo del código legacy
- **Fecha:** 2026-10-27
- **Contexto:** Se contaba con una implementación previa basada en Express monolítico y HTML estático en la raíz del repositorio.
- **Decisión:** 
  1. Se creó una rama de respaldo `legacy` en Git para conservar todo el historial y código anterior.
  2. Se limpió el directorio raíz y se ubicó el monorepo directamente en la raíz del repositorio (con carpetas `apps/` y `packages/`), en lugar de anidar una subcarpeta `rol/` redundante.
  3. No se migran datos antiguos; se inicia con base de datos limpia para cumplir estrictamente con el nuevo esquema relacional y de sesiones.

## DEC-002: Versiones fijas y herramientas de desarrollo para Fase 0
- **Fecha:** 2026-10-27
- **Contexto:** El plan exige no usar `latest` y fijar versiones exactas de dependencias en `package.json`, además de modo `strict` en TypeScript, ESLint y Prettier.
- **Decisión:**
  - TypeScript: `5.4.5` con configuración base compartida (`tsconfig.base.json`) en modo `strict`.
  - ESLint: `8.57.0` con `@typescript-eslint/parser` y `@typescript-eslint/eslint-plugin` para compatibilidad y estabilidad sólida.
  - Prettier: `3.2.5`.
  - Zod: `4.6.7` (versión asegurada ante vulnerabilidades GHSA-mrhx-c7xc-m3w5).
  - Fastify: `5.12.7` (versión asegurada ante DoS y bypass de validación).
  - Vite: `8.3.5`, `@vitejs/plugin-react`: `6.1.2`.
  - Vitest: `5.0.5` (versión asegurada sin vulnerabilidades en tinypool/esbuild).
  - `@types/node`: `22.20.5`, `tsx`: `4.23.15`.
  - Resultado: `npm audit` reporta 0 vulnerabilidades.

## DEC-003: Estrategia Docker Compose para desarrollo vs producción
- **Fecha:** 2026-10-27
- **Contexto:** El plan exige estrictamente que el servicio `db` en producción no publique ningún puerto al exterior (`sin ports` en `docker-compose.yml`), pero para el desarrollo local y la ejecución de `prisma migrate dev` desde el host se requiere acceso a PostgreSQL en `localhost:5432`.
- **Decisión:**
  - `docker-compose.yml`: Archivo de producción con servicios `db`, `api`, `caddy`, `cloudflared` operando exclusivamente en una red bridge interna `internal`, sin ningún puerto de PostgreSQL expuesto.
  - `docker-compose.dev.yml`: Archivo para entorno de desarrollo local que expone `127.0.0.1:5432:5432` con volumen aislado `pgdata_dev`.
  - Se añadieron scripts `npm run db:up`, `npm run db:down` y `npm run db:logs` al `package.json` raíz para facilitar el flujo de desarrollo.

## DEC-004: Autenticación, cookies y prevención de timing attacks
- **Fecha:** 2026-10-27
- **Contexto:** Se requiere autenticación basada en servidor con cookies seguras y hash con argon2id, protegiendo contra ataques de enumeración y CSRF.
- **Decisión:**
  - Se utiliza `argon2` configurado en variante `argon2id` (64 MB de memoria, tiempo de iteración 3 y 4 hilos en paralelo).
  - En login, si el usuario no existe en la base de datos, se ejecuta una verificación con hash dummy contra la contraseña suministrada para unificar el tiempo de respuesta y neutralizar ataques de temporización / enumeración.
  - Los tokens de sesión se generan mediante 32 bytes de entropía criptográfica (`crypto.randomBytes(32)`), y en la base de datos se almacena única y exclusivamente su resumen criptográfico SHA-256 (`tokenHash`).
  - La cookie `rol_session` se envía con `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` (7 días), y el flag `Secure` se activa dinámicamente cuando `NODE_ENV === 'production'`, facilitando el desarrollo local sobre HTTP.
  - Se implementó un hook global CSRF en Fastify que rechaza peticiones mutantes (`POST`, `PUT`, `PATCH`, `DELETE`) cuya cabecera `Origin` no coincida con `ALLOWED_ORIGIN`.
