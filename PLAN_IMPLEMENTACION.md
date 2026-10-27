# Plan de implementación: rol.burgoslabs.es (Vercel + Neon)

> Documento para el agente de desarrollo. **Sustituye a la versión anterior basada en Docker/VPS.** Ejecuta las fases **en orden** y no avances hasta cumplir los criterios de aceptación de la actual. Ante cualquier ambigüedad, elige la opción más segura y documéntala en `docs/DECISIONES.md`.
>
> **Importante:** la documentación de Vercel, Neon, Prisma y Hono cambia con frecuencia. Antes de implementar cada integración, **consulta la documentación oficial vigente** y adapta los detalles de configuración sin romper los requisitos de este plan.

## 1. Objetivo

Aplicación web multiusuario para **almacenar fichas de personaje de D&D 5e y de otros sistemas de rol**, con campañas (un DM y jugadores), accesible en `https://rol.burgoslabs.es`.

### Requisitos funcionales (MVP)

1. Registro, login y logout de usuarios.
2. CRUD de fichas de personaje propias (campo `system` para distinguir D&D 5e u otros).
3. Campañas: un usuario crea una campaña (es su DM) e invita a jugadores mediante código.
4. Un personaje puede asignarse a una campaña. El DM de esa campaña puede **ver** (no editar) las fichas asignadas.
5. Búsqueda y listado de las fichas propias.

### Fuera de alcance del MVP

Chat en tiempo real, tiradas de dados compartidas, subida de imágenes, app móvil nativa.

## 2. Stack (decidido, no cambiar)

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript en modo `strict` en todo el proyecto |
| API | **Hono** (runtime **Node.js**, no Edge) como función serverless de Vercel |
| Validación | Zod (esquemas compartidos en `packages/shared`) |
| BD | **PostgreSQL en Neon** + **Prisma** |
| Auth | Sesiones en servidor (tabla en Postgres) + cookie `HttpOnly`; hash con argon2id |
| Frontend | React + Vite + TypeScript, servido como estático por Vercel |
| Tests | Vitest |
| Hosting | **Vercel** (plan Hobby) con dominio propio vía Cloudflare DNS |

**Restricciones:** no usar Laravel/PHP, Docker ni servidores propios. No usar JWT en `localStorage`. Usa versiones estables actuales y **fija las versiones** (sin `latest`).

## 3. Estructura del repositorio

Proyecto de Vercel con **raíz en la raíz del repositorio** (monorepo con npm workspaces):

```
rol/
├─ api/
│  └─ index.ts           # punto de entrada serverless: exporta el handler de Hono
├─ apps/
│  ├─ api/               # lógica de la API (librería importada por /api/index.ts)
│  │  ├─ prisma/schema.prisma
│  │  └─ src/
│  │     ├─ app.ts                  # crea la app Hono y registra middlewares
│  │     ├─ config/env.ts           # valida variables de entorno con Zod
│  │     ├─ middleware/             # auth, rate-limit, origin-check, errores
│  │     ├─ modules/
│  │     │  ├─ auth/
│  │     │  ├─ characters/
│  │     │  └─ campaigns/
│  │     └─ lib/                    # hash, tokens, authz (policies), db
│  └─ web/               # React + Vite
├─ packages/
│  └─ shared/            # esquemas Zod y tipos
├─ docs/
│  ├─ DECISIONES.md
│  └─ DESPLIEGUE.md
├─ vercel.json
├─ .env.example          # sin secretos reales
├─ .gitignore            # incluye .env*, node_modules, dist, .vercel
└─ PLAN_IMPLEMENTACION_VERCEL.md
```

## 4. Fases

### Fase 0: Andamiaje

- Inicializa el monorepo con workspaces, `tsconfig.base.json` en modo `strict`, ESLint y Prettier.
- Crea `.gitignore` y `.env.example` **antes del primer commit**.
- `config/env.ts` valida con Zod: `DATABASE_URL`, `DIRECT_URL`, `ALLOWED_ORIGIN`, `CRON_SECRET`, `NODE_ENV`. La app **falla al arrancar** si falta alguna.

**Aceptación:** `npm run build` y `npm run lint` pasan en limpio; no hay secretos en el repositorio.

### Fase 1: Base de datos (Neon + Prisma)

Esquema en `prisma/schema.prisma`:

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  displayName  String
  passwordHash String
  createdAt    DateTime @default(now())
  sessions     Session[]
  characters   Character[]
  memberships  CampaignMember[]
  campaigns    Campaign[] @relation("CampaignDM")
}

model Session {
  id         String   @id @default(uuid())
  tokenHash  String   @unique        // SHA-256 del token; el token en claro nunca se guarda
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  @@index([userId])
  @@index([expiresAt])
}

model Campaign {
  id         String   @id @default(uuid())
  name       String
  system     String
  inviteCode String   @unique
  dmId       String
  dm         User     @relation("CampaignDM", fields: [dmId], references: [id])
  members    CampaignMember[]
  characters Character[]
  createdAt  DateTime @default(now())
}

enum CampaignRole { DM PLAYER }

model CampaignMember {
  campaignId String
  userId     String
  role       CampaignRole
  campaign   Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([campaignId, userId])
}

model Character {
  id         String   @id @default(uuid())
  ownerId    String
  owner      User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  campaignId String?
  campaign   Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  system     String                    // "dnd5e", etc.
  name       String
  data       Json                      // validado con Zod según `system`
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([ownerId])
  @@index([campaignId])
}

// Rate limiting compartido entre instancias serverless (no usar memoria local)
model RateLimit {
  key         String   @id            // p. ej. "login:<ip>" o "register:<ip>"
  count       Int
  windowStart DateTime
}
```

Configuración para serverless (verifica en la documentación vigente de Prisma y Neon):

- `DATABASE_URL`: cadena **con pooler** de Neon (host `-pooler`), usada en runtime.
- `DIRECT_URL`: cadena **directa**, usada solo por `prisma migrate`.
- Crear **un único cliente Prisma por instancia** (patrón singleton en `lib/db.ts`) para no agotar conexiones.
- Las migraciones **no se ejecutan en el build de Vercel automáticamente sin control**: documenta en `docs/DESPLIEGUE.md` cómo y cuándo ejecutar `prisma migrate deploy`.

**Aceptación:** `prisma migrate dev` genera la migración inicial y se versiona; la API conecta a una rama de desarrollo de Neon.

### Fase 2: Esquemas compartidos (`packages/shared`)

- Esquemas Zod para registro, login, campaña y ficha.
- Esquema de ficha `dnd5e`: nombre, clase, nivel, raza, trasfondo, alineamiento, atributos, competencias, puntos de golpe, CA, ataques, inventario, conjuros, rasgos y notas.
- Límites estrictos: longitudes máximas de strings, rangos numéricos (atributos 1-30, nivel 1-20), tamaño máximo de `data` de **64 KB**.
- Otros sistemas: esquema genérico (`name` + pares clave/valor acotados) hasta definir esquemas específicos.

**Aceptación:** tests Vitest cubren entradas válidas, inválidas y casos límite.

### Fase 3: Autenticación

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Contraseñas con **argon2id** (usa una implementación compatible con el runtime Node de Vercel; verifica que compila en el entorno de despliegue); mínimo 10 caracteres.
- Al hacer login: token aleatorio de 32 bytes (`crypto.randomBytes`), guardar **solo su SHA-256** en `Session`, enviar el token en cookie `HttpOnly; Secure; SameSite=Lax; Path=/`, caducidad 7 días.
- Logout borra la fila de sesión y la cookie.
- Mensajes de error **genéricos** en login ("credenciales inválidas").
- Mitigar enumeración por tiempos: ejecutar la verificación de hash aunque el email no exista.
- **CSRF:** en métodos mutantes validar que `Origin` coincide con `ALLOWED_ORIGIN`; rechazar si falta o difiere.

**Aceptación:** tests de registro, login correcto/incorrecto, sesión caducada y logout.

### Fase 4: Autorización y módulos de negocio

Centraliza **todas** las reglas en `lib/authz.ts` (`canReadCharacter`, `canEditCharacter`, `canManageCampaign`). Ningún handler decide permisos por su cuenta.

| Recurso | Leer | Editar/Borrar |
|---|---|---|
| Ficha | Propietario, o DM de la campaña a la que está asignada | Solo propietario |
| Campaña | DM y miembros | Solo DM |
| Asignar ficha a campaña | Propietario, y debe ser miembro de esa campaña | Solo propietario |

Endpoints:

- `/api/characters` (GET lista propia, POST), `/api/characters/:id` (GET, PUT, DELETE).
- `/api/campaigns` (GET, POST), `/api/campaigns/:id`, `/api/campaigns/join` (POST con `inviteCode`), `/api/campaigns/:id/characters` (GET para el DM).

Reglas obligatorias:

- El filtro de pertenencia va **dentro de la propia query Prisma** (`where: { id, ownerId }`), no en una comprobación posterior.
- Si el recurso no existe **o** no pertenece al usuario, responder **404** idéntico (evita enumeración).
- Validar `body`, `params` y `query` con Zod en cada ruta.
- Paginación en listados (máximo 50 por página).
- `inviteCode` generado con `crypto.randomBytes`, no con `Math.random`.

**Aceptación:** suite de tests de autorización (sección 6) en verde.

### Fase 5: Seguridad transversal

- Cabeceras de seguridad (middleware `secureHeaders` de Hono y/o `headers` en `vercel.json`): CSP restrictiva, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`.
- **Rate limiting en base de datos** (tabla `RateLimit`): login y registro máximo 5 intentos/minuto por IP. Obtén la IP de las cabeceras que Vercel inyecta (`x-forwarded-for` / `x-real-ip`) y **no confíes en cabeceras que el cliente pueda falsificar**; documenta la decisión.
- Límite de tamaño del cuerpo de petición: 256 KB.
- Logging sin datos sensibles: **nunca** registrar contraseñas, tokens ni cookies.
- Manejador de errores global: sin stack traces en respuestas de producción.
- `npm audit` y resolver vulnerabilidades altas/críticas.

**Aceptación:** pruebas confirman cabeceras, rate limit efectivo entre invocaciones distintas y ausencia de datos sensibles en logs.

### Fase 6: Frontend

- Páginas: login/registro, listado de fichas, editor de ficha D&D 5e, campañas y detalle de campaña.
- Validar con los **mismos esquemas Zod** de `packages/shared`.
- `fetch` con `credentials: 'include'` (mismo origen); sin tokens en `localStorage`/`sessionStorage`.
- Datos de usuario siempre como texto (prohibido `dangerouslySetInnerHTML`).
- Diseño responsive (se usará desde el móvil durante las sesiones).

**Aceptación:** flujo completo registro → crear ficha → crear campaña → unir segundo usuario → DM ve la ficha; funciona en móvil y escritorio.

### Fase 7: Despliegue en Vercel

- `vercel.json`: `buildCommand` que compila `packages/shared` y `apps/web`; `outputDirectory` = `apps/web/dist`; reescritura de `/api/(.*)` a la función y del resto a `/index.html` (SPA).
- Función API con runtime **Node.js** (necesario para Prisma y argon2); región cercana a la de Neon para minimizar latencia.
- Variables de entorno configuradas en Vercel (Production y Preview con **bases de datos distintas**; nunca apuntar Preview a la BD de producción).
- Integración de Neon: crear proyecto con ramas `main` (producción) y `dev`.
- **Cron de limpieza** (Vercel Cron, endpoint protegido con `CRON_SECRET`): borrar sesiones caducadas y filas antiguas de `RateLimit`.

Pasos manuales del propietario (documentar en `docs/DESPLIEGUE.md`):

1. Crear el proyecto en Vercel conectado al repositorio de GitHub.
2. Añadir el dominio `rol.burgoslabs.es` en Vercel y crear en Cloudflare el registro `CNAME` con el valor que indique Vercel, en modo **DNS only** (sin proxy naranja).
3. Cargar las variables de entorno y ejecutar `prisma migrate deploy` contra la BD de producción.
4. Activar protección de rama `main` en GitHub.

**Aceptación:** `https://rol.burgoslabs.es` responde por HTTPS con certificado válido; el flujo completo funciona en producción.

### Fase 8: Backups y operación

- Documentar el periodo de restauración (point-in-time) del plan de Neon y **verificarlo en la documentación vigente**.
- Script `scripts/backup.sh` con `pg_dump` ejecutable por el propietario desde su máquina, con instrucciones de restauración. Las copias **no se guardan en el repositorio**.
- Probar una restauración en una rama o base vacía.

**Aceptación:** una restauración de prueba reproduce los datos.

## 5. Convenciones de código

- Funciones pequeñas con una sola responsabilidad; código en inglés, textos de interfaz en español.
- Sin `any`; prohibido `// @ts-ignore` salvo con comentario justificado.
- Sin lógica de negocio en los handlers: delegar en servicios del módulo.
- Commits pequeños y descriptivos, uno por tarea lógica.
- Nunca commitear `.env*`, volcados de BD ni claves.

## 6. Tests de seguridad obligatorios

Cada uno debe existir como test automatizado en la API:

1. Un usuario A **no puede** leer, editar ni borrar una ficha de B (esperado: 404).
2. Un usuario sin sesión recibe 401 en todas las rutas protegidas.
3. Una sesión caducada o borrada es rechazada.
4. El DM puede leer, pero **no editar**, las fichas de su campaña; un DM de otra campaña no puede leerlas.
5. No se puede asignar una ficha a una campaña de la que el usuario no es miembro.
6. Un `data` que excede 64 KB o incumple el esquema es rechazado con 400.
7. Superar el límite de intentos de login devuelve 429, también entre invocaciones distintas (el contador vive en BD).
8. Petición mutante con `Origin` no permitido o ausente es rechazada.
9. El endpoint de cron rechaza peticiones sin `CRON_SECRET` válido.

## 7. Definición de "terminado"

- [ ] Todas las fases cumplen sus criterios de aceptación.
- [ ] `npm run build`, `npm run lint` y `npm test` pasan en limpio.
- [ ] Los 9 tests de seguridad de la sección 6 están en verde.
- [ ] `npm audit` sin vulnerabilidades altas o críticas.
- [ ] Sin secretos en el historial de Git; Preview y Production usan BD distintas.
- [ ] Desplegado en `https://rol.burgoslabs.es` y restauración de backup probada.
- [ ] `docs/DESPLIEGUE.md` y `docs/DECISIONES.md` actualizados.

## 8. Nota sobre el plan Hobby de Vercel

El plan Hobby está pensado para uso **personal y no comercial**. Si el proyecto pasa a tener fines comerciales, el propietario debe revisar las condiciones y los precios vigentes antes de continuar.