# Plan de implementación: correcciones de seguridad de RoleplayWEB

> Documento para el agente de desarrollo. Ejecuta las fases **en orden**, en una rama `fix/security-hardening`, con **commits pequeños** (uno por tarea). No fusiones a `main` hasta cumplir la sección 7. Si una instrucción choca con lo que ves en el código, elige la opción más segura y anótalo en `docs/DECISIONES.md`.
>
> **Contexto:** el repositorio es un monorepo TypeScript (Hono + Prisma + Neon + React/Vite) desplegado en Vercel en `rol.burgoslabs.es`. Una auditoría previa solo pudo revisar ficheros de configuración. **El código de `api/`, `apps/` y `packages/shared` no ha sido auditado**: la Fase 4 es obligatoria.

## Resumen de hallazgos a corregir

| # | Severidad | Hallazgo | Fase |
|---|---|---|---|
| 1 | Alta | `vercel.json` sin cabeceras de seguridad (los estáticos no pasan por Hono) | 1 |
| 2 | Media | Secretos de ejemplo de `.env.example` aceptados por la validación en producción | 2 |
| 3 | Media | `.gitignore` no cubre `.env.production`, `.vercel/` ni volcados `.sql` | 1 |
| 4 | Baja | Contraseña por defecto hardcodeada en `docker-compose.dev.yml` | 1 |
| 5 | Baja | Infraestructura Docker obsoleta en el repositorio | 3 |
| 6 | Pendiente | Código fuente sin auditar | 4 |

## Fase 0: Preparación

1. Crea la rama `fix/security-hardening` desde `main`.
2. Revisa la **pull request abierta**: no la fusiones sin leerla; si toca ficheros de este plan, resuelve conflictos antes.
3. Ejecuta `npm ci`, `npm run build`, `npm run lint` y `npm test` para anotar el estado inicial. Si algo falla de base, regístralo en `docs/DECISIONES.md` y no lo mezcles con estas correcciones.
4. Busca secretos en **todo el historial** de Git (por ejemplo con `gitleaks detect`). Si aparece cualquier secreto real, **no lo borres sin más**: marca el hallazgo para rotarlo (Fase 5) porque seguirá en el historial.

**Aceptación:** rama creada, línea base documentada, resultado de la búsqueda de secretos anotado.

## Fase 1: Configuración (hallazgos 1, 3 y 4)

### 1.1 Cabeceras de seguridad en `vercel.json`

Añade una clave `headers` al objeto raíz (sin duplicar la clave si ya existe; no toques `rewrites` ni `crons`):

```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
      { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
    ]
  }
]
```

Reglas:
- Comprueba en un deploy de **preview** (consola del navegador) que la CSP no bloquea recursos legítimos. Si bloquea algo, amplía **solo** la directiva necesaria y justifícalo en `docs/DECISIONES.md`. No uses `script-src 'unsafe-inline'` ni `'unsafe-eval'`.
- Verifica en la documentación vigente de Vercel que la sintaxis de `headers` sigue siendo la indicada.
- No elimines las cabeceras que ya ponga la API con middleware: son complementarias para las respuestas de `/api`.

### 1.2 `.gitignore`

Sustituye el bloque "Entornos y secretos" por:

```gitignore
# Entornos y secretos
.env*
!.env.example
.vercel/
*.pem
*.key

# Volcados y backups
*.sql
*.dump
*.sql.gz
```

Después ejecuta `git ls-files` y confirma que **ningún** fichero ya rastreado coincide con esos patrones (salvo `.env.example`). Si alguno lo está, quítalo del índice con `git rm --cached` y avisa para rotar sus secretos.

### 1.3 `docker-compose.dev.yml`

Haz obligatoria la contraseña (sin valor por defecto):

```yaml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Define POSTGRES_PASSWORD en tu .env local}
```

Mantén el puerto limitado a `127.0.0.1`. Documenta en el README del desarrollo local cómo definir la variable.

### 1.4 Opcional: redirigir el dominio `*.vercel.app` al dominio oficial

Para que `roleplay-web-lovat.vercel.app` no sirva la misma app en paralelo, añade (verificando la sintaxis en la documentación vigente):

```json
"redirects": [
  {
    "source": "/(.*)",
    "has": [{ "type": "host", "value": "roleplay-web-lovat.vercel.app" }],
    "destination": "https://rol.burgoslabs.es/$1",
    "permanent": false
  }
]
```

**Aceptación:** `vercel.json` es JSON válido; un `curl -I` al preview muestra las cinco cabeceras; `git status` no muestra ficheros sensibles; el compose de desarrollo falla con un mensaje claro si falta `POSTGRES_PASSWORD`.

## Fase 2: Validación de secretos (hallazgo 2)

1. En `apps/api/src/config/env.ts`, rechaza los valores de ejemplo:

```ts
const notPlaceholder = (v: string) => !v.startsWith('change_this');

SESSION_SECRET: z.string().min(32).refine(notPlaceholder, 'Valor de ejemplo sin cambiar'),
CRON_SECRET: z.string().min(32).refine(notPlaceholder, 'Valor de ejemplo sin cambiar'),
```

2. Busca en todo el código usos de `SESSION_SECRET` (`grep -rn SESSION_SECRET`). Si **no se usa** (las sesiones son tokens aleatorios hasheados en BD), elimínala de `env.ts`, de `.env.example` y de la documentación. Si se usa, documenta para qué.
3. Añade tests de `env.ts`: arranque falla con el valor de ejemplo, falla con menos de 32 caracteres y funciona con un valor aleatorio válido.
4. Revisa `.env.example`: debe seguir sin ningún secreto real.

**Aceptación:** tests nuevos en verde; la app **no arranca** con `CRON_SECRET=change_this_...`.

## Fase 3: Limpieza de infraestructura obsoleta (hallazgo 5)

1. Confirma que nada del despliegue en Vercel depende de estos ficheros: `docker-compose.yml`, `Caddyfile`, `apps/api/Dockerfile`, `PLAN_IMPLEMENTACION.md` (versión Docker).
2. Elimínalos (`git rm`). Conserva `docker-compose.dev.yml` si se usa para la BD local.
3. Elimina referencias huérfanas: variables `TUNNEL_TOKEN`, `POSTGRES_USER`/`POSTGRES_DB` de producción en docs, scripts o `package.json`.
4. Mueve el plan vigente a `docs/` o sustituye el obsoleto por `PLAN_IMPLEMENTACION_VERCEL.md`.

**Aceptación:** `npm run build` sigue pasando; no quedan referencias a Caddy, `cloudflared` ni `TUNNEL_TOKEN` (`grep -rni`).

## Fase 4: Auditoría del código fuente (hallazgo 6)

Revisa el código **contra esta lista** y corrige cada incumplimiento con el cambio mínimo. Por cada punto deja constancia en `docs/AUDITORIA.md` (cumple / corregido / no aplica) con el fichero y la línea.

### 4.1 Autenticación
- Hash de contraseñas con **argon2id** y mínimo 10 caracteres.
- Token de sesión de 32 bytes con `crypto.randomBytes`; en BD solo el **SHA-256**, nunca el token en claro.
- Cookie con `HttpOnly; Secure; SameSite=Lax; Path=/` y caducidad definida.
- Login con **mensaje genérico** y verificación de hash aunque el email no exista (evita enumeración por tiempos).
- Logout elimina la fila de sesión y la cookie.

### 4.2 Autorización (revisión crítica)
- Todas las reglas están en `lib/authz.ts`; ningún handler decide permisos por su cuenta.
- Cada consulta Prisma sobre fichas y campañas incluye el filtro de pertenencia **dentro** del `where` (`id` + `ownerId` o membresía).
- Recurso inexistente o ajeno devuelve **404 idéntico**.
- El DM lee las fichas de su campaña pero **no puede editarlas**.
- No se puede asignar una ficha a una campaña de la que no se es miembro.
- Ninguna ruta devuelve campos sensibles (`passwordHash`, `tokenHash`) en sus respuestas: revisa los `select`/serializadores.

### 4.3 Validación y entrada
- `body`, `params` y `query` validados con Zod en **todas** las rutas.
- `data` de fichas limitado a 64 KB y con esquema por `system`.
- Listados paginados (máximo 50 por página).
- `inviteCode` generado con `crypto.randomBytes`, nunca con `Math.random`.
- No hay `$queryRawUnsafe` ni consultas SQL construidas por concatenación.

### 4.4 Protección CSRF y anti-abuso
- Peticiones `POST/PUT/PATCH/DELETE` rechazadas si `Origin` falta o no coincide con `ALLOWED_ORIGIN`.
- Rate limit de login y registro (5 intentos/minuto por IP) con contador **en base de datos**; la IP se obtiene de cabeceras de Vercel de forma segura y documentada.
- Límite de tamaño del cuerpo de petición (256 KB).

### 4.5 Endpoint de cron `/api/cron/cleanup`
- Exige `Authorization: Bearer <CRON_SECRET>` y compara con **`crypto.timingSafeEqual`**.
- **Falla cerrado**: si `CRON_SECRET` no está definido o vacío, responde 401, nunca ejecuta la limpieza.
- Solo acepta el método previsto por Vercel Cron (`GET`).
- La limpieza borra **únicamente** sesiones caducadas y filas de `RateLimit` cuya ventana ya expiró, nunca todas.

### 4.6 Errores, logs y frontend
- Manejador de errores global sin stack traces en producción.
- Los logs **no registran** contraseñas, tokens, cookies ni cuerpos de petición de auth.
- El frontend no usa `dangerouslySetInnerHTML`, no guarda tokens en `localStorage`/`sessionStorage` y usa `credentials: 'include'`.
- `/health` (rewrite a la API) no revela versiones, variables ni estado de la BD.

### 4.7 Dependencias
- Ejecuta `npm audit`; resuelve vulnerabilidades altas y críticas. Si una actualización rompe algo, documéntalo en vez de ignorarla.
- Confirma que no hay versiones `latest` ni rangos abiertos en dependencias críticas y que `package-lock.json` está versionado.

### 4.8 Tests de seguridad obligatorios

Verifica que existen como tests automatizados; crea los que falten:

1. Usuario A no puede leer, editar ni borrar la ficha de B (404).
2. Sin sesión: 401 en todas las rutas protegidas.
3. Sesión caducada o borrada es rechazada.
4. El DM lee pero no edita fichas de su campaña; un DM ajeno no las lee.
5. No se puede asignar ficha a una campaña de la que no se es miembro.
6. `data` de más de 64 KB o fuera de esquema devuelve 400.
7. Superar el límite de login devuelve 429, también entre invocaciones distintas.
8. Mutación con `Origin` ausente o no permitido es rechazada.
9. El cron rechaza peticiones sin `CRON_SECRET` válido y también si el secreto no está configurado.

**Aceptación:** `docs/AUDITORIA.md` completo; los 9 tests existen y pasan; `npm audit` sin vulnerabilidades altas/críticas.

## Fase 5: Configuración externa (pasos manuales del propietario)

El agente **no puede** hacer esto; déjalo como lista de verificación en `docs/DESPLIEGUE.md`:

- [ ] En Vercel, confirmar que `CRON_SECRET` de producción es aleatorio (`openssl rand -hex 32`) y **no** el valor de ejemplo. Si alguna vez lo fue, **rotarlo**.
- [ ] Rotar la contraseña de Neon y cualquier secreto que apareciera en el historial (Fase 0, punto 4).
- [ ] Verificar que Preview y Production usan **bases de datos distintas**.
- [ ] Activar protección de despliegues de Vercel para previews.
- [ ] En GitHub: activar **Dependabot**, **secret scanning con push protection** y protección de la rama `main` (PR obligatoria, checks en verde).
- [ ] Confirmar que `ALLOWED_ORIGIN` de producción es exactamente `https://rol.burgoslabs.es`.

## Fase 6: Verificación final

1. `npm ci && npm run build && npm run lint && npm test`: todo en verde.
2. Preview desplegado: comprobar cabeceras (`curl -I`), flujo completo (registro, ficha, campaña, DM) y consola del navegador sin errores de CSP.
3. `gitleaks detect` sin hallazgos nuevos.
4. Abrir PR con el resumen de cambios, enlazando `docs/AUDITORIA.md`.

## 7. Definición de "terminado"

- [x] Los hallazgos 1 a 5 corregidos y verificados.
- [x] `docs/AUDITORIA.md` completo con la revisión de la Fase 4.
- [x] Los 9 tests de seguridad existen y pasan (83/83 en total).
- [x] `npm audit` sin vulnerabilidades altas o críticas (0 vulnerabilidades).
- [x] Ningún secreto real rastreado por Git ni en el historial sin rotar.
- [x] Lista de la Fase 5 entregada al propietario en `docs/DESPLIEGUE.md`.
- [ ] PR revisada y fusionada solo con CI en verde (acción del propietario).