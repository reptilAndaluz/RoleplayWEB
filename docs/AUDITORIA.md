# Informe de Auditoría de Código y Seguridad (Fase 4)

**Proyecto:** RoleplayWEB (rol.burgoslabs.es)  
**Fecha:** 27 de Octubre de 2026  
**Rama:** `fix/security-hardening`  
**Estado General:** Aprobado (100% de cumplimiento en todos los controles auditados)

---

## 1. Resumen de Cumplimiento

| Sección | Descripción | Estado |
|---|---|:---:|
| **4.1** | Autenticación y Criptografía | **Cumple** |
| **4.2** | Autorización y Anti-Enumeración | **Corregido / Cumple** |
| **4.3** | Validación de Entradas y Restricción de Payloads | **Cumple** |
| **4.4** | Protección CSRF y Rate Limiting Serverless | **Corregido / Cumple** |
| **4.5** | Endpoint de Mantenimiento (`/api/cron/cleanup`) | **Corregido / Cumple** |
| **4.6** | Manejo de Errores, Logs y Seguridad en Frontend | **Cumple** |
| **4.7** | Gestión de Dependencias y Fijación Estricta | **Cumple** |
| **4.8** | Suite de Tests de Seguridad Automatizados (9/9) | **Cumple** |

---

## 2. Detalle de Controles Auditados

### 4.1 Autenticación
- **Hash de contraseñas con argon2id**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/lib/hash.ts:4-11`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/lib/hash.ts#L4-L11).
  - *Detalle:* Configurado con `type: argon2.argon2id`, `memoryCost: 65536` (64 MB), `timeCost: 3`, `parallelism: 4`. Longitud mínima de 10 caracteres validada en [`packages/shared/src/auth.ts:14-17`](file:///home/reptil/Documentos/personal/Catalogo_D-D/packages/shared/src/auth.ts#L14-L17).
- **Almacenamiento de tokens de sesión**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/lib/tokens.ts:7-10`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/lib/tokens.ts#L7-L10), [`apps/api/src/modules/auth/auth.routes.ts:67-73`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/auth/auth.routes.ts#L67-L73).
  - *Detalle:* Se generan 32 bytes con `crypto.randomBytes(32).toString('hex')`. En PostgreSQL solo se persiste el hash SHA-256 (`tokenHash`); el token en claro nunca se almacena en base de datos.
- **Atributos de Cookie de Sesión**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/auth/auth.routes.ts:75-81`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/auth/auth.routes.ts#L75-L81).
  - *Detalle:* Emite cookie con atributos obligatorios `httpOnly: true`, `secure: true` (en producción), `sameSite: 'Lax'`, `path: '/'`, `maxAge: 604800` (7 días).
- **Mitigación de enumeración por tiempos en login**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/auth/auth.routes.ts:119-132`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/auth/auth.routes.ts#L119-L132).
  - *Detalle:* Si el usuario no existe, se ejecuta la verificación de contraseña contra un hash argon2id sintético constante (`DUMMY_HASH`), respondiendo el mensaje genérico 401 `Credenciales inválidas`.
- **Cierre de sesión seguro**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/auth/auth.routes.ts:173-186`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/auth/auth.routes.ts#L173-L186).
  - *Detalle:* Elimina la fila de la sesión en PostgreSQL por su hash SHA-256 y limpia la cookie del cliente.

---

### 4.2 Autorización
- **Políticas centralizadas en `lib/authz.ts`**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/lib/authz.ts:19-74`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/lib/authz.ts#L19-L74).
  - *Detalle:* Define de forma aislada `canReadCharacter`, `canEditCharacter`, `canManageCampaign`, `canReadCampaign` y `canAssignCharacterToCampaign`.
- **Filtro de pertenencia directo en queries**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/characters/characters.routes.ts:31-33`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/characters/characters.routes.ts#L31-L33).
  - *Detalle:* Listados filtran directamente por `where: { ownerId: user.id }`.
- **Anti-enumeración uniforme (404)**:
  - *Estado:* Corregido.
  - *Fichero/Línea:* [`apps/api/src/modules/campaigns/campaigns.routes.ts:182-205`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/campaigns/campaigns.routes.ts#L182-L205).
  - *Detalle:* `/api/campaigns/:id/characters` validaba únicamente si era el DM sin comprobar pertenencia previa, pudiendo filtrar la existencia de la campaña con 403 a usuarios no relacionados. Se corrigió para que si la campaña no existe o el usuario no pertenece a ella (`!canReadCampaign`), devuelva 404 Not Found idéntico (anti-enumeración). Si el usuario es miembro pero no es el DM, devuelve 403 Forbidden.
- **Acceso de solo lectura para el DM**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/characters/characters.routes.ts:160-169`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/characters/characters.routes.ts#L160-L169).
  - *Detalle:* El DM puede ver la ficha si está asignada a su campaña (`canReadCharacter`), pero las mutaciones PUT/DELETE exigen estrictamente `canEditCharacter` (solo propietario), devolviendo 404 al DM.
- **Asignación de personajes a campañas**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/characters/characters.routes.ts:83-103`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/characters/characters.routes.ts#L83-L103).
  - *Detalle:* Valida en `campaignMember` que el usuario sea miembro de la campaña antes de asignarla (rechazando con 400 en caso contrario).
- **Protección de campos sensibles en respuestas**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/auth/auth.routes.ts:84-93`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/auth/auth.routes.ts#L84-L93), [`apps/api/src/modules/campaigns/campaigns.routes.ts:25`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/campaigns/campaigns.routes.ts#L25).
  - *Detalle:* Ninguna ruta selecciona o serializa `passwordHash` ni `tokenHash`.

---

### 4.3 Validación y Entrada
- **Validación con Zod en todas las rutas**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* Rutas de auth, characters y campaigns validan con `RegisterInputSchema`, `LoginInputSchema`, `CreateCharacterInputSchema`, `UpdateCharacterInputSchema`, `CreateCampaignInputSchema` y `JoinCampaignInputSchema`.
- **Límite de tamaño de ficha (64 KB)**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`packages/shared/src/character.ts:5-26`](file:///home/reptil/Documentos/personal/Catalogo_D-D/packages/shared/src/character.ts#L5-L26).
  - *Detalle:* `MAX_CHARACTER_DATA_BYTES = 64 * 1024`. Calculado por número de bytes UTF-8 reales mediante `TextEncoder` / `Buffer.byteLength`.
- **Paginación en listados**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/characters/characters.routes.ts:14-19`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/characters/characters.routes.ts#L14-L19).
  - *Detalle:* `ListQuerySchema` restringe `limit: z.coerce.number().int().min(1).max(50).default(20)`.
- **Generación de códigos de invitación**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/campaigns/campaigns.routes.ts:57`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/campaigns/campaigns.routes.ts#L57).
  - *Detalle:* Generado mediante `crypto.randomBytes(4).toString('hex').toUpperCase()`, sin usar `Math.random`.
- **Ausencia de inyección SQL / Raw Queries**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* Todo el proyecto.
  - *Detalle:* 0 usos de `$queryRawUnsafe` o concatenación de strings en SQL.

---

### 4.4 Protección CSRF y Anti-Abuso
- **Validación de cabecera Origin**:
  - *Estado:* Corregido.
  - *Fichero/Línea:* [`apps/api/src/middleware/csrf.ts:16-33`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/middleware/csrf.ts#L16-L33).
  - *Detalle:* Métodos mutantes (`POST`, `PUT`, `PATCH`, `DELETE`) exigen `Origin === env.ALLOWED_ORIGIN`. Se corrigió para asegurar `return await next()`.
- **Rate limiting persistido en PostgreSQL**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/middleware/rate-limit.ts:37-89`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/middleware/rate-limit.ts#L37-L89).
  - *Detalle:* Máximo 5 intentos/minuto en tabla `RateLimit`, coordinando lambdas serverless. IP obtenida con precedencia estricta de `x-real-ip` / `x-forwarded-for` / `cf-connecting-ip`.
- **Límite de tamaño de cuerpo HTTP (256 KB)**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/app.ts:46-60`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/app.ts#L46-L60).
  - *Detalle:* Middleware `bodyLimit` corta payloads superiores a 256 KB respondiendo 413.

---

### 4.5 Endpoint de Cron (`/api/cron/cleanup`)
- **Autenticación con `crypto.timingSafeEqual` y Fail-Closed**:
  - *Estado:* Corregido.
  - *Fichero/Línea:* [`apps/api/src/modules/cron/cron.routes.ts:7-22`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/cron/cron.routes.ts#L7-L22).
  - *Detalle:* Implementada función `safeCompareBearer` que verifica longitud de buffers y aplica `crypto.timingSafeEqual`. Falla cerrado (401) si `CRON_SECRET` es undefined o vacío.
- **Método HTTP exclusivo**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/cron/cron.routes.ts:8`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/cron/cron.routes.ts#L8).
  - *Detalle:* Exclusivamente expuesto bajo `GET`.
- **Criterio de borrado de mantenimiento**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/modules/cron/cron.routes.ts:25-38`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/modules/cron/cron.routes.ts#L25-L38).
  - *Detalle:* Purga solo sesiones con `expiresAt <= now` y rate limits con `windowStart <= oneHourAgo`.

---

### 4.6 Errores, Logs y Frontend
- **Manejador de errores sin stack traces**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/app.ts:66-80`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/app.ts#L66-L80).
  - *Detalle:* En `NODE_ENV === 'production'` responde texto genérico sin detalles de traza.
- **Ausencia de secretos en logs**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* Todo el backend.
  - *Detalle:* No se imprimen credenciales, tokens ni cuerpos de autenticación.
- **Seguridad en frontend (XSS / Almacenamiento)**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/web/src`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/web/src).
  - *Detalle:* Cero usos de `dangerouslySetInnerHTML`, cero tokens en `localStorage` o `sessionStorage`, y peticiones configuradas con `credentials: 'include'`.
- **Health check sin fuga de metadatos**:
  - *Estado:* Cumple.
  - *Fichero/Línea:* [`apps/api/src/app.ts:83-93`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/src/app.ts#L83-L93).
  - *Detalle:* Devuelve únicamente `{ status: 'ok', timestamp: '...' }`.

---

### 4.7 Dependencias
- **Auditoría de vulnerabilidades**:
  - *Estado:* Cumple.
  - *Comando:* `npm audit`.
  - *Resultado:* `0 vulnerabilities`.
- **Fijación estricta de versiones**:
  - *Estado:* Cumple.
  - *Detalle:* Cero rangos abiertos (`^`, `~`) y cero `latest` en dependencias críticas; `package-lock.json` versionado.

---

### 4.8 Tests de Seguridad Obligatorios
- *Suite:* [`apps/api/test/security.test.ts`](file:///home/reptil/Documentos/personal/Catalogo_D-D/apps/api/test/security.test.ts).
- *Resultado:* **9 tests passing de 9 (100%)**.
  1. Usuario A no lee, edita ni borra ficha de B (404).
  2. Peticiones sin sesión reciben 401 en rutas protegidas.
  3. Sesión caducada o borrada rechazada con 401.
  4. DM lee (no edita) fichas de su campaña; DM ajeno recibe 404.
  5. Ficha rechazada con 400 si se intenta asignar a campaña sin ser miembro.
  6. Payload `data` > 64 KB o inválido rechazado con 400.
  7. Límite de login devuelve 429 persistido en PostgreSQL.
  8. Petición mutante con Origin ausente o ajeno rechazada con 403.
  9. Cron rechaza accesos sin secreto o con secreto vacío con 401.
