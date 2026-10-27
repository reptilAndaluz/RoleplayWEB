# Plan de implementación: rol.burgoslabs.es

> Documento para el agente de desarrollo. Ejecuta las fases **en orden** y no avances a la siguiente hasta cumplir los criterios de aceptación de la actual. Ante cualquier ambigüedad, elige la opción más segura y documéntala en `docs/DECISIONES.md`.

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
| API | Fastify |
| Validación | Zod (esquemas compartidos en `packages/shared`) |
| BD | PostgreSQL 16 + Prisma |
| Auth | Sesiones en servidor (tabla en Postgres) + cookie `HttpOnly`; hash con argon2id |
| Frontend | React + Vite + TypeScript |
| Tests | Vitest (API y shared) |
| Infra | Docker Compose + Caddy + Cloudflare Tunnel (`cloudflared`) |

**Restricciones:** no usar Laravel/PHP. No usar JWT en `localStorage`. No publicar el puerto de PostgreSQL. Usa versiones estables actuales de cada dependencia y **fija las versiones** (sin `latest`).

## 3. Estructura del repositorio (monorepo npm workspaces)

```
rol/
├─ apps/
│  ├─ api/            # Fastify + Prisma
│  │  ├─ prisma/schema.prisma
│  │  ├─ src/
│  │  │  ├─ server.ts
│  │  │  ├─ config/env.ts          # valida variables de entorno con Zod
│  │  │  ├─ plugins/               # auth, rate-limit, helmet, cors
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/
│  │  │  │  ├─ characters/
│  │  │  │  └─ campaigns/
│  │  │  └─ lib/                   # hash, tokens, authz (policies)
│  │  └─ Dockerfile
│  └─ web/            # React + Vite
├─ packages/
│  └─ shared/         # esquemas Zod y tipos (ficha, usuario, campaña)
├─ docs/DECISIONES.md
├─ Caddyfile
├─ docker-compose.yml
├─ .env.example       # sin secretos reales
├─ .gitignore         # incluye .env, node_modules, dist
└─ PLAN_IMPLEMENTACION.md
```

## 4. Fases

### Fase 0: Andamiaje

- Inicializa el monorepo con workspaces, `tsconfig.base.json` en modo `strict`, ESLint y Prettier.
- Crea `.gitignore` y `.env.example` **antes del primer commit**.
- `apps/api/src/config/env.ts`: valida `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`, `ALLOWED_ORIGIN`; la app **no arranca** si falta alguna.

**Aceptación:** `npm run build` y `npm run lint` pasan en limpio; no hay ningún secreto en el repositorio.

### Fase 1: Base de datos

Define este esquema en `prisma/schema.prisma` (ajusta nombres solo si hay motivo justificado):

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
  data       Json                      // contenido validado con Zod según `system`
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([ownerId])
  @@index([campaignId])
}
```

**Aceptación:** `prisma migrate dev` genera la migración inicial y se versiona en el repositorio.

### Fase 2: Esquemas compartidos (`packages/shared`)

- Esquemas Zod para registro, login, campaña y ficha.
- Esquema de ficha `dnd5e`: nombre, clase, nivel, raza, trasfondo, alineamiento, atributos, competencias, puntos de golpe, CA, ataques, inventario, conjuros, rasgos y notas.
- Límites estrictos: longitudes máximas de strings, rangos numéricos (atributos 1-30, nivel 1-20), tamaño máximo de `data` de **64 KB**.
- Para otros sistemas, usar un esquema genérico (`name` + pares clave/valor acotados) hasta que se definan específicos.

**Aceptación:** tests Vitest cubren entradas válidas e inválidas, incluidos casos límite.

### Fase 3: Autenticación

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Contraseñas con **argon2id**; mínimo 10 caracteres.
- Al hacer login: generar token aleatorio de 32 bytes (`crypto.randomBytes`), guardar **solo su SHA-256** en `Session`, enviar el token en cookie `HttpOnly; Secure; SameSite=Lax; Path=/`, caducidad 7 días.
- Rotar sesión al hacer login; borrar la fila al hacer logout.
- Mensajes de error **genéricos** en login ("credenciales inválidas"), sin revelar si el email existe.
- Protección CSRF: en métodos mutantes (`POST/PUT/PATCH/DELETE`) validar que la cabecera `Origin` coincide con `ALLOWED_ORIGIN`.

**Aceptación:** tests de registro, login correcto/incorrecto, sesión caducada y logout.

### Fase 4: Autorización y módulos de negocio

Centraliza **todas** las reglas en `src/lib/authz.ts` (funciones `canReadCharacter`, `canEditCharacter`, `canManageCampaign`). Ningún handler decide permisos por su cuenta.

| Recurso | Leer | Editar/Borrar |
|---|---|---|
| Ficha | Propietario, o DM de la campaña a la que está asignada | Solo propietario |
| Campaña | DM y miembros | Solo DM |
| Asignar ficha a campaña | Propietario, y debe ser miembro de esa campaña | Solo propietario |

Endpoints:

- `/api/characters` (GET lista propia, POST), `/api/characters/:id` (GET, PUT, DELETE).
- `/api/campaigns` (GET, POST), `/api/campaigns/:id`, `/api/campaigns/join` (POST con `inviteCode`), `/api/campaigns/:id/characters` (GET para el DM).

Reglas obligatorias:

- Toda consulta incluye el filtro de pertenencia en la propia query Prisma (`where: { id, ownerId }`), no solo una comprobación posterior.
- Si el recurso no existe **o** no pertenece al usuario, responder **404** idéntico (evita enumeración).
- Validar `body`, `params` y `query` con Zod en cada ruta.
- Paginación en listados (máximo 50 por página).
- `inviteCode` generado con `crypto.randomBytes`, no con `Math.random`.

**Aceptación:** suite de tests de autorización (ver sección 6) en verde.

### Fase 5: Seguridad transversal

- `@fastify/helmet`, `@fastify/rate-limit` (límite estricto en login y registro, p. ej. 5 intentos/minuto por IP), `@fastify/cors` restringido a `ALLOWED_ORIGIN`.
- `bodyLimit` global de 256 KB.
- Detrás del túnel de Cloudflare, configurar `trustProxy` y leer la IP real desde `CF-Connecting-IP`.
- Logging con `pino`; **nunca** registrar contraseñas, tokens ni cookies (usar `redact`).
- Manejador de errores global: respuestas sin stack traces en producción.
- Ejecutar `npm audit` y resolver vulnerabilidades altas/críticas.

**Aceptación:** pruebas manuales o automáticas confirman cabeceras de seguridad, rate limit activo y ausencia de datos sensibles en logs.

### Fase 6: Frontend

- Páginas: login/registro, listado de fichas, editor de ficha D&D 5e, campañas y detalle de campaña.
- Validar con los **mismos esquemas Zod** de `packages/shared`.
- Cliente HTTP con `credentials: 'include'`; sin guardar tokens en `localStorage`/`sessionStorage`.
- Renderizar datos de usuario siempre como texto (no usar `dangerouslySetInnerHTML`).
- Diseño responsive (se usará desde el móvil durante las sesiones).

**Aceptación:** flujo completo registro → crear ficha → crear campaña → unir segundo usuario → DM ve la ficha, funciona en móvil y escritorio.

### Fase 7: Infraestructura y despliegue

`docker-compose.yml` con servicios `db`, `api`, `caddy`, `cloudflared` en una red interna `internal`:

- `db`: `postgres:16-alpine`, volumen `pgdata`, **sin `ports`**, credenciales desde `.env`.
- `api`: build multi-stage, ejecución como **usuario no root**, `NODE_ENV=production`, ejecuta `prisma migrate deploy` al arrancar.
- `caddy`: sirve `apps/web/dist` y hace proxy de `/api/*` a `api:3000` (SPA con `try_files {path} /index.html`).
- `cloudflared`: imagen con **versión fijada**, `TUNNEL_TOKEN` desde `.env`.
- Healthchecks en `db` y `api`; `depends_on` con `condition: service_healthy`.

Pasos manuales del propietario (documéntalos en `docs/DESPLIEGUE.md`):

1. Crear el túnel en Cloudflare Zero Trust y apuntar `rol.burgoslabs.es` a `http://caddy:80`.
2. SSL/TLS de Cloudflare en modo **Full (strict)**.
3. En el servidor: firewall cerrado a todo excepto SSH por clave; desactivar login SSH por contraseña.
4. Copiar `.env.example` a `.env` y rellenar valores generados con `openssl rand -base64 32`.

**Aceptación:** `https://rol.burgoslabs.es` responde por HTTPS; `nmap` al servidor no muestra puertos distintos de SSH.

### Fase 8: Backups y operación

- Script `scripts/backup.sh`: `pg_dump` comprimido y diario con rotación (7 diarios, 4 semanales).
- Las copias deben guardarse **fuera del servidor** (almacenamiento externo).
- Documentar el procedimiento de restauración y **probarlo una vez**.

**Aceptación:** una restauración de prueba en una base vacía reproduce los datos.

## 5. Convenciones de código

- Funciones pequeñas y con una sola responsabilidad; nombres descriptivos en inglés para el código, textos de interfaz en español.
- Sin `any`; prohibido `// @ts-ignore` salvo con comentario justificado.
- Sin lógica de negocio en los handlers: delegar en servicios del módulo.
- Commits pequeños con mensajes descriptivos; un commit por tarea lógica.
- Nunca commitear `.env`, volcados de BD ni claves.

## 6. Tests de seguridad obligatorios

Cada uno debe existir como test automatizado en la API:

1. Un usuario A **no puede** leer, editar ni borrar una ficha de B (esperado: 404).
2. Un usuario sin sesión recibe 401 en todas las rutas protegidas.
3. Una sesión caducada o borrada es rechazada.
4. El DM puede leer, pero **no editar**, las fichas de su campaña; un DM de otra campaña no puede leerlas.
5. No se puede asignar una ficha a una campaña de la que el usuario no es miembro.
6. Un `data` que excede 64 KB o incumple el esquema es rechazado con 400.
7. Superar el límite de intentos de login devuelve 429.
8. Petición mutante con `Origin` no permitido es rechazada.

## 7. Definición de "terminado"

- [ ] Todas las fases cumplen sus criterios de aceptación.
- [ ] `npm run build`, `npm run lint` y `npm test` pasan en limpio.
- [ ] Los 8 tests de seguridad de la sección 6 están en verde.
- [ ] `npm audit` sin vulnerabilidades altas o críticas.
- [ ] No hay secretos en el historial de Git.
- [ ] Desplegado en `https://rol.burgoslabs.es` y backup restaurado con éxito.
- [ ] `docs/DESPLIEGUE.md` y `docs/DECISIONES.md` actualizados.
