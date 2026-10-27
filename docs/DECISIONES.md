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
