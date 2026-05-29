const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

require('dotenv').config();

const app = express();

// Configuración de Seguridad
const ALGORITHM = "HS256";

// --- MIDDLEWARE DE CABECERAS DE SEGURIDAD ---
app.use((req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy", 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: blob: http: https:; " +
        "frame-src https://www.youtube.com https://youtube.com;"
    );
    next();
});

// Habilitar CORS y parsers de cuerpo
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- SISTEMA DE CONTRASEÑAS SEGURAS (SHA256 con PBKDF2 y Sal) ---
function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
    try {
        const [saltHex, hashHex] = storedHash.split(':');
        const salt = Buffer.from(saltHex, 'hex');
        const expectedHash = Buffer.from(hashHex, 'hex');
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
        return crypto.timingSafeEqual(hash, expectedHash);
    } catch (error) {
        return false;
    }
}

// --- CONFIGURACIÓN DE RUTAS DE PERSISTENCIA ---
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Cargar o generar SECRET_KEY criptográficamente segura
let SECRET_KEY = process.env.SECRET_KEY;
if (!SECRET_KEY) {
    const secretKeyFile = path.join(DATA_DIR, ".secret_key");
    if (fs.existsSync(secretKeyFile)) {
        try {
            SECRET_KEY = fs.readFileSync(secretKeyFile, "utf8").trim();
        } catch (e) {}
    }
    if (!SECRET_KEY) {
        SECRET_KEY = crypto.randomBytes(32).toString("hex");
        try {
            fs.writeFileSync(secretKeyFile, SECRET_KEY, "utf8");
        } catch (e) {}
    }
}

const USERS_FILE = path.join(DATA_DIR, "usuarios.json");
const CHARACTERS_FILE = path.join(DATA_DIR, "personajes.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sesiones.json");

// --- CONEXIÓN OPCIONAL A POSTGRESQL (MÁXIMA PRIORIDAD EN LA NUBE) ---
const { Pool } = require('pg');
let pgPool = null;
const POSTGRES_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

async function connectPostgres() {
    if (POSTGRES_URL) {
        try {
            pgPool = new Pool({
                connectionString: POSTGRES_URL,
                ssl: {
                    rejectUnauthorized: false
                }
            });
            // Probar conexión
            await pgPool.query('SELECT NOW()');
            console.log("🐘 Conexión exitosa a base de datos persistente PostgreSQL en la nube!");
            await initPostgresSchema();
        } catch (e) {
            console.error(`⚠️ Alerta: Error al conectar a PostgreSQL (cayendo a MongoDB / Disco): ${e.message}`);
            pgPool = null;
        }
    }
}

async function initPostgresSchema() {
    if (!pgPool) return;
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Tabla de Usuarios
        await client.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id VARCHAR(50) PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL,
                created_at VARCHAR(50) NOT NULL
            )
        `);
        
        // 2. Tabla de Configuración del portal
        await client.query(`
            CREATE TABLE IF NOT EXISTS config (
                id SERIAL PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                descripcion TEXT,
                tema VARCHAR(50) NOT NULL,
                logo TEXT
            )
        `);

        // 3. Tabla de Personajes
        await client.query(`
            CREATE TABLE IF NOT EXISTS personajes (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
                nombre VARCHAR(255) NOT NULL,
                apodo VARCHAR(255),
                campana VARCHAR(255) NOT NULL,
                clases JSONB NOT NULL,
                descripcion_habilidades TEXT,
                foto_principal TEXT,
                galeria JSONB NOT NULL,
                stats JSONB NOT NULL,
                created_at VARCHAR(50) NOT NULL
            )
        `);

        // 4. Tabla de Sesiones D&D
        await client.query(`
            CREATE TABLE IF NOT EXISTS sesiones (
                id VARCHAR(50) PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                descripcion TEXT,
                dm_id VARCHAR(50) REFERENCES usuarios(id) ON DELETE CASCADE,
                dm_username VARCHAR(100) NOT NULL,
                created_at VARCHAR(50) NOT NULL
            )
        `);

        // 5. Tabla de Unión Sesion-Personajes (Junction Table Relacional M:N)
        await client.query(`
            CREATE TABLE IF NOT EXISTS sesion_personajes (
                session_id VARCHAR(50) REFERENCES sesiones(id) ON DELETE CASCADE,
                character_id VARCHAR(50) REFERENCES personajes(id) ON DELETE CASCADE,
                PRIMARY KEY (session_id, character_id)
            )
        `);

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("⚠️ Error crítico inicializando esquema de base de datos en PostgreSQL:", e.message);
    } finally {
        client.release();
    }
}

// --- CONEXIÓN OPCIONAL A MONGODB ---
const MONGODB_URI = process.env.MONGODB_URI;
let mongoDb = null;
let mongoClient = null;

async function connectMongo() {
    if (MONGODB_URI) {
        try {
            const { MongoClient } = require('mongodb');
            mongoClient = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
            await mongoClient.connect();
            await mongoClient.db("admin").command({ ping: 1 });
            
            let dbName = "gremio_heroes";
            const parsedDb = mongoClient.options.dbName;
            if (parsedDb) dbName = parsedDb;
            
            mongoDb = mongoClient.db(dbName);
            console.log("💡 Conexión exitosa a base de datos persistente MongoDB en la nube!");
        } catch (e) {
            console.warn(`⚠️ Alerta: Error al conectar a MongoDB (cayendo a archivos locales): ${e.message}`);
            mongoDb = null;
        }
    }
}

// --- ADAPTADOR DE PERSISTENCIA POLIMÓRFICO ---
async function readJsonFile(filepath, defaultValue) {
    const filename = path.basename(filepath);

    // 1. Intentar leer desde PostgreSQL (MÁXIMA PRIORIDAD)
    if (pgPool !== null) {
        try {
            if (filename === "config.json") {
                const res = await pgPool.query('SELECT * FROM config LIMIT 1');
                let doc = res.rows[0] || null;
                if (!doc && fs.existsSync(filepath)) {
                    try {
                        const localData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                        if (localData) {
                            await pgPool.query(
                                'INSERT INTO config (titulo, descripcion, tema, logo) VALUES ($1, $2, $3, $4)',
                                [localData.titulo, localData.descripcion || "", localData.tema, localData.logo || ""]
                            );
                            return localData;
                        }
                    } catch (e) {}
                }
                return doc !== null ? { titulo: doc.titulo, descripcion: doc.descripcion, tema: doc.tema, logo: doc.logo } : defaultValue;
            } else if (filename === "usuarios.json") {
                const res = await pgPool.query('SELECT * FROM usuarios');
                let rows = res.rows;
                if (rows.length === 0 && fs.existsSync(filepath)) {
                    try {
                        const localData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                        if (localData && localData.length > 0) {
                            for (let u of localData) {
                                await pgPool.query(
                                    'INSERT INTO usuarios (id, username, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5)',
                                    [u.id, u.username, u.password_hash, u.role, u.created_at]
                                );
                            }
                            return localData;
                        }
                    } catch (e) {}
                }
                return rows;
            } else if (filename === "personajes.json") {
                const res = await pgPool.query('SELECT * FROM personajes');
                let rows = res.rows;
                if (rows.length === 0 && fs.existsSync(filepath)) {
                    try {
                        const localData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                        if (localData && localData.length > 0) {
                            for (let p of localData) {
                                await pgPool.query(
                                    'INSERT INTO personajes (id, user_id, nombre, apodo, campana, clases, descripcion_habilidades, foto_principal, galeria, stats, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
                                    [p.id, p.user_id, p.nombre, p.apodo || "", p.campana, JSON.stringify(p.clases || []), p.descripcion_habilidades || "", p.foto_principal || "", JSON.stringify(p.galeria || []), JSON.stringify(p.stats || {}), p.created_at]
                                );
                            }
                            return localData;
                        }
                    } catch (e) {}
                }
                return rows;
            } else if (filename === "sesiones.json") {
                const res = await pgPool.query('SELECT * FROM sesiones');
                let rows = res.rows;
                if (rows.length === 0 && fs.existsSync(filepath)) {
                    try {
                        const localData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                        if (localData && localData.length > 0) {
                            for (let s of localData) {
                                await pgPool.query(
                                    'INSERT INTO sesiones (id, nombre, descripcion, dm_id, dm_username, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
                                    [s.id, s.nombre, s.descripcion || "", s.dm_id, s.dm_username, s.created_at]
                                );
                                if (s.personajes && s.personajes.length > 0) {
                                    for (let cid of s.personajes) {
                                        await pgPool.query(
                                            'INSERT INTO sesion_personajes (session_id, character_id) VALUES ($1, $2)',
                                            [s.id, cid]
                                        );
                                    }
                                }
                            }
                            return localData;
                        }
                    } catch (e) {}
                }
                // Enlazar personajes participantes de la tabla junction relacional
                for (let s of rows) {
                    const charRes = await pgPool.query('SELECT character_id FROM sesion_personajes WHERE session_id = $1', [s.id]);
                    s.personajes = charRes.rows.map(r => r.character_id);
                }
                return rows;
            }
        } catch (e) {
            console.warn(`⚠️ Error leyendo de PostgreSQL: ${e.message}. Cayendo a MongoDB / Disco.`);
        }
    }

    // 2. Intentar leer desde MongoDB (Segunda prioridad)
    if (mongoDb !== null) {
        try {
            const collName = filename.replace(".json", "");
            if (collName === "config") {
                const doc = await mongoDb.collection("config").findOne({}, { projection: { _id: 0 } });
                if (!doc && fs.existsSync(filepath)) {
                    try {
                        const localData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                        if (localData) {
                            await mongoDb.collection("config").insertOne(localData);
                            return localData;
                        }
                    } catch (e) {}
                }
                return doc !== null ? doc : defaultValue;
            } else {
                const res = await mongoDb.collection(collName).find({}, { projection: { _id: 0 } }).toArray();
                if ((!res || res.length === 0) && fs.existsSync(filepath)) {
                    try {
                        const localData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                        if (localData && localData.length > 0) {
                            await mongoDb.collection(collName).insertMany(localData);
                            return localData;
                        }
                    } catch (e) {}
                }
                return res || [];
            }
        } catch (e) {
            console.warn(`⚠️ Error al leer de MongoDB: ${e.message}. Cayendo a copia local.`);
        }
    }

    // 3. Fallback local en disco
    if (fs.existsSync(filepath)) {
        try {
            return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        } catch (e) {
            return defaultValue;
        }
    }
    return defaultValue;
}

async function writeJsonFile(filepath, data) {
    const filename = path.basename(filepath);

    // 1. Intentar escribir en PostgreSQL (MÁXIMA PRIORIDAD)
    if (pgPool !== null) {
        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');
            if (filename === "config.json") {
                await client.query('DELETE FROM config');
                if (data && Object.keys(data).length > 0) {
                    await client.query(
                        'INSERT INTO config (titulo, descripcion, tema, logo) VALUES ($1, $2, $3, $4)',
                        [data.titulo, data.descripcion || "", data.tema, data.logo || ""]
                    );
                }
            } else if (filename === "usuarios.json") {
                const userIds = [];
                for (let u of data) {
                    userIds.push(u.id);
                    await client.query(`
                        INSERT INTO usuarios (id, username, password_hash, role, created_at)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (id) DO UPDATE SET
                            username = EXCLUDED.username,
                            password_hash = EXCLUDED.password_hash,
                            role = EXCLUDED.role
                    `, [u.id, u.username, u.password_hash, u.role, u.created_at]);
                }
                if (userIds.length > 0) {
                    await client.query('DELETE FROM usuarios WHERE id NOT IN (' + userIds.map((_, i) => `$${i + 1}`).join(',') + ')', userIds);
                } else {
                    await client.query('DELETE FROM usuarios');
                }
            } else if (filename === "personajes.json") {
                const charIds = [];
                for (let p of data) {
                    charIds.push(p.id);
                    await client.query(`
                        INSERT INTO personajes (id, user_id, nombre, apodo, campana, clases, descripcion_habilidades, foto_principal, galeria, stats, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        ON CONFLICT (id) DO UPDATE SET
                            user_id = EXCLUDED.user_id,
                            nombre = EXCLUDED.nombre,
                            apodo = EXCLUDED.apodo,
                            campana = EXCLUDED.campana,
                            clases = EXCLUDED.clases,
                            descripcion_habilidades = EXCLUDED.descripcion_habilidades,
                            foto_principal = EXCLUDED.foto_principal,
                            galeria = EXCLUDED.galeria,
                            stats = EXCLUDED.stats
                    `, [
                        p.id, p.user_id, p.nombre, p.apodo || "", p.campana, 
                        JSON.stringify(p.clases || []), p.descripcion_habilidades || "", 
                        p.foto_principal || "", JSON.stringify(p.galeria || []), 
                        JSON.stringify(p.stats || {}), p.created_at
                    ]);
                }
                if (charIds.length > 0) {
                    await client.query('DELETE FROM personajes WHERE id NOT IN (' + charIds.map((_, i) => `$${i + 1}`).join(',') + ')', charIds);
                } else {
                    await client.query('DELETE FROM personajes');
                }
            } else if (filename === "sesiones.json") {
                const sessionIds = [];
                for (let s of data) {
                    sessionIds.push(s.id);
                    await client.query(`
                        INSERT INTO sesiones (id, nombre, descripcion, dm_id, dm_username, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (id) DO UPDATE SET
                            nombre = EXCLUDED.nombre,
                            descripcion = EXCLUDED.descripcion,
                            dm_id = EXCLUDED.dm_id,
                            dm_username = EXCLUDED.dm_username
                    `, [s.id, s.nombre, s.descripcion || "", s.dm_id, s.dm_username, s.created_at]);

                    // Sincronizar tabla junction de personajes en sesiones
                    await client.query('DELETE FROM sesion_personajes WHERE session_id = $1', [s.id]);
                    if (s.personajes && s.personajes.length > 0) {
                        for (let cid of s.personajes) {
                            await client.query(
                                'INSERT INTO sesion_personajes (session_id, character_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                                [s.id, cid]
                            );
                        }
                    }
                }
                if (sessionIds.length > 0) {
                    await client.query('DELETE FROM sesiones WHERE id NOT IN (' + sessionIds.map((_, i) => `$${i + 1}`).join(',') + ')', sessionIds);
                } else {
                    await client.query('DELETE FROM sesiones');
                }
            }
            await client.query('COMMIT');
            return;
        } catch (e) {
            await client.query('ROLLBACK');
            console.warn(`⚠️ Error escribiendo en PostgreSQL: ${e.message}. Cayendo a MongoDB / Disco.`);
        } finally {
            client.release();
        }
    }

    // 2. Intentar escribir en MongoDB
    if (mongoDb !== null) {
        try {
            const collName = filename.replace(".json", "");
            await mongoDb.collection(collName).deleteMany({});
            if (collName === "config") {
                if (data && Object.keys(data).length > 0) {
                    await mongoDb.collection("config").insertOne(data);
                }
            } else {
                if (data && data.length > 0) {
                    await mongoDb.collection(collName).insertMany(data);
                }
            }
            return;
        } catch (e) {
            console.warn(`⚠️ Error al escribir en MongoDB: ${e.message}. Escribiendo copia en archivo local.`);
        }
    }

    // 3. Fallback local en disco
    fs.writeFileSync(filepath, JSON.stringify(data, null, 4), 'utf8');
}

// Inicializar archivos con datos por defecto
async function initDb() {
    // 1. Configuración por defecto
    const cfg = await readJsonFile(CONFIG_FILE, null);
    if (!cfg) {
        const defaultConfig = {
            "titulo": "Gremio de Héroes D&D",
            "descripcion": "El archivo místico donde descansan los registros de los aventureros de nuestras campañas.",
            "tema": "dragons_lair",
            "logo": ""
        };
        await writeJsonFile(CONFIG_FILE, defaultConfig);
    }

    // 2. Usuarios por defecto (Admin)
    const usuarios = await readJsonFile(USERS_FILE, []);
    const envAdminUser = process.env.ADMIN_USERNAME || "admin";
    const envAdminPass = process.env.ADMIN_PASSWORD || "1234";

    let adminFound = false;
    for (let u of usuarios) {
        if (u.role === "admin" || u.id === "usr_admin00") {
            if (process.env.ADMIN_USERNAME || process.env.ADMIN_PASSWORD) {
                u.username = envAdminUser;
                u.password_hash = hashPassword(envAdminPass);
            }
            adminFound = true;
            break;
        }
    }

    if (!adminFound) {
        const adminUser = {
            "id": "usr_admin00",
            "username": envAdminUser,
            "password_hash": hashPassword(envAdminPass),
            "role": "admin",
            "created_at": new Date().toISOString().split('.')[0] + 'Z'
        };
        usuarios.push(adminUser);
    }
    await writeJsonFile(USERS_FILE, usuarios);

    // 3. Personajes por defecto
    const chars = await readJsonFile(CHARACTERS_FILE, null);
    if (chars === null) {
        await writeJsonFile(CHARACTERS_FILE, []);
    }

    // 4. Sesiones por defecto
    const sesiones = await readJsonFile(SESSIONS_FILE, null);
    if (sesiones === null) {
        await writeJsonFile(SESSIONS_FILE, []);
    }
}

// --- AUTENTICACIÓN JWT MIDDLEWARE ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ detail: "No se proporcionaron credenciales de sesión" });
    }

    jwt.verify(token, SECRET_KEY, { algorithms: [ALGORITHM] }, async (err, payload) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ detail: "Sesión expirada. Vuelve a iniciar sesión." });
            }
            return res.status(401).json({ detail: "Firma de sesión inválida." });
        }

        const username = payload.sub;
        const role = payload.role;
        const userId = payload.user_id;

        if (!username || !role || !userId) {
            return res.status(401).json({ detail: "Token de sesión incompleto" });
        }

        // Verificar que el usuario exista
        const usuarios = await readJsonFile(USERS_FILE, []);
        const userExists = usuarios.some(u => u.id === userId);

        if (!userExists) {
            return res.status(401).json({ detail: "El usuario ya no existe" });
        }

        req.user = { id: userId, username, role };
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.role !== "admin") {
        return res.status(403).json({ detail: "Acceso denegado. Se requieren permisos de administrador." });
    }
    next();
}

function requireDM(req, res, next) {
    if (req.user.role !== "dm" && req.user.role !== "admin") {
        return res.status(403).json({ detail: "Acceso denegado. Se requieren permisos de Dungeon Master o Administrador." });
    }
    next();
}

// --- RUTAS DE AUTENTICACIÓN ---
app.post("/api/auth/login", async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
        return res.status(401).json({ detail: "Nombre de usuario o contraseña incorrectos" });
    }

    const usuarios = await readJsonFile(USERS_FILE, []);
    for (let u of usuarios) {
        if (u.username.toLowerCase() === username.toLowerCase()) {
            if (verifyPassword(password, u.password_hash)) {
                // Crear token con expiración de 7 días
                const tokenData = {
                    sub: u.username,
                    role: u.role,
                    user_id: u.id
                };
                const accessToken = jwt.sign(tokenData, SECRET_KEY, { algorithm: ALGORITHM, expiresIn: '7d' });
                return res.json({
                    access_token: accessToken,
                    token_type: "bearer",
                    id: u.id,
                    role: u.role,
                    username: u.username
                });
            }
        }
    }
    return res.status(401).json({ detail: "Nombre de usuario o contraseña incorrectos" });
});

app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || typeof username !== 'string') {
        return res.status(400).json({ detail: "El nombre de aventurero no puede estar vacío." });
    }
    const usernameClean = username.trim();
    if (!usernameClean) {
        return res.status(400).json({ detail: "El nombre de aventurero no puede estar vacío." });
    }

    if (usernameClean.toLowerCase() === "admin") {
        return res.status(400).json({ detail: "El nombre 'admin' está reservado para el Maestro del Gremio." });
    }

    const usuarios = await readJsonFile(USERS_FILE, []);
    if (usuarios.some(u => u.username.toLowerCase() === usernameClean.toLowerCase())) {
        return res.status(400).json({ detail: "Este aventurero ya ha sido alistado en el gremio." });
    }

    const newUser = {
        id: `usr_${crypto.randomBytes(4).toString('hex')}`,
        username: usernameClean,
        password_hash: hashPassword(password),
        role: "user",
        created_at: new Date().toISOString().split('.')[0] + 'Z'
    };

    usuarios.push(newUser);
    await writeJsonFile(USERS_FILE, usuarios);

    return res.json({
        status: "success",
        message: "Te has alistado correctamente. ¡Franquea la entrada!"
    });
});

// --- RUTAS DE CONFIGURACIÓN Y ADMINISTRACIÓN ---
app.get("/api/config", async (req, res) => {
    const cfg = await readJsonFile(CONFIG_FILE, {});
    return res.json(cfg);
});

app.post("/api/admin/config", authenticateToken, requireAdmin, async (req, res) => {
    const { titulo, descripcion, tema, logo } = req.body;
    
    if (!titulo || !descripcion || !tema) {
        return res.status(400).json({ detail: "Faltan campos de configuración obligatorios." });
    }

    const updatedConfig = {
        titulo,
        descripcion,
        tema,
        logo: logo || ""
    };

    await writeJsonFile(CONFIG_FILE, updatedConfig);
    return res.json({ status: "success", message: "Configuración del portal actualizada místicamente" });
});

app.get("/api/admin/usuarios", authenticateToken, requireAdmin, async (req, res) => {
    const usuarios = await readJsonFile(USERS_FILE, []);
    const cleanUsers = usuarios.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        created_at: u.created_at || ""
    }));
    return res.json(cleanUsers);
});

app.post("/api/admin/usuarios", authenticateToken, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ detail: "Todos los campos de registro de usuario son requeridos." });
    }

    const usuarios = await readJsonFile(USERS_FILE, []);
    if (usuarios.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ detail: "El nombre de usuario ya está registrado." });
    }

    if (!["user", "dm", "admin"].includes(role)) {
        return res.status(400).json({ detail: "Rol inválido. Debe ser 'user', 'dm' o 'admin'." });
    }

    const newUser = {
        id: `usr_${crypto.randomBytes(4).toString('hex')}`,
        username,
        password_hash: hashPassword(password),
        role,
        created_at: new Date().toISOString().split('.')[0] + 'Z'
    };

    usuarios.push(newUser);
    await writeJsonFile(USERS_FILE, usuarios);

    return res.json({
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        created_at: newUser.created_at
    });
});

app.delete("/api/admin/usuarios/:user_id", authenticateToken, requireAdmin, async (req, res) => {
    const userId = req.params.user_id;

    if (userId === req.user.id) {
        return res.status(400).json({ detail: "No puedes eliminarte a ti mismo, valiente líder." });
    }

    const usuarios = await readJsonFile(USERS_FILE, []);
    const filteredUsers = usuarios.filter(u => u.id !== userId);

    if (filteredUsers.length === usuarios.length) {
        return res.status(404).json({ detail: "Usuario no encontrado." });
    }

    // Eliminar también los personajes de ese usuario
    const personajes = await readJsonFile(CHARACTERS_FILE, []);
    const filteredPersonajes = personajes.filter(p => p.user_id !== userId);

    await writeJsonFile(USERS_FILE, filteredUsers);
    await writeJsonFile(CHARACTERS_FILE, filteredPersonajes);

    return res.json({ status: "success", message: "Usuario y sus héroes asociados eliminados con éxito" });
});

app.put("/api/admin/usuarios/:user_id/role", authenticateToken, requireAdmin, async (req, res) => {
    const userId = req.params.user_id;
    const { role } = req.body;

    if (userId === req.user.id) {
        return res.status(400).json({ detail: "No puedes alterar tu propio rango, sabio líder." });
    }

    if (!["user", "dm", "admin"].includes(role)) {
        return res.status(400).json({ detail: "Rango no permitido. Debe ser 'user', 'dm' o 'admin'." });
    }

    const usuarios = await readJsonFile(USERS_FILE, []);
    let found = false;
    for (let u of usuarios) {
        if (u.id === userId) {
            u.role = role;
            found = true;
            break;
        }
    }

    if (!found) {
        return res.status(404).json({ detail: "El aventurero especificado no existe en los registros." });
    }

    await writeJsonFile(USERS_FILE, usuarios);
    return res.json({ status: "success", message: "Rango del aventurero actualizado místicamente." });
});

// --- RUTAS DE PERSONAJES (CRUD) ---
app.get("/api/personajes", authenticateToken, async (req, res) => {
    const personajes = await readJsonFile(CHARACTERS_FILE, []);
    const userChars = personajes.filter(p => p.user_id === req.user.id);
    return res.json(userChars);
});

app.get("/api/personajes/:char_id", authenticateToken, async (req, res) => {
    const charId = req.params.char_id;
    const personajes = await readJsonFile(CHARACTERS_FILE, []);
    
    for (let p of personajes) {
        if (p.id === charId) {
            const isOwner = p.user_id === req.user.id;
            const isAdmin = req.user.role === "admin";

            let isDmOfCharSession = false;
            const sesiones = await readJsonFile(SESSIONS_FILE, []);
            for (let s of sesiones) {
                if (s.dm_id === req.user.id && s.personajes && s.personajes.includes(charId)) {
                    isDmOfCharSession = true;
                    break;
                }
            }

            if (!isOwner && !isAdmin && !isDmOfCharSession) {
                return res.status(403).json({ detail: "No tienes derecho a ver este registro mágico." });
            }
            return res.json(p);
        }
    }
    return res.status(404).json({ detail: "Personaje no encontrado en las crónicas." });
});

app.post("/api/personajes", authenticateToken, async (req, res) => {
    const { nombre, apodo, campana, clases, descripcion_habilidades, foto_principal, galeria, stats } = req.body;

    if (!nombre || !campana || !clases) {
        return res.status(400).json({ detail: "Los campos Nombre, Campana y Clases son requeridos." });
    }

    const personajes = await readJsonFile(CHARACTERS_FILE, []);
    
    // Evitar que el mismo usuario registre un duplicado (mismo nombre y campaña)
    const exists = personajes.some(p => 
        p.user_id === req.user.id && 
        p.nombre.toLowerCase().trim() === nombre.toLowerCase().trim() && 
        p.campana.toLowerCase().trim() === campana.toLowerCase().trim()
    );
    if (exists) {
        return res.status(400).json({ detail: `Ya tienes alistado un héroe llamado '${nombre}' en la campaña '${campana}'.` });
    }

    const newChar = {
        id: `char_${crypto.randomBytes(4).toString('hex')}`,
        user_id: req.user.id,
        nombre,
        apodo: apodo || "",
        campana,
        clases,
        descripcion_habilidades: descripcion_habilidades || "",
        foto_principal: foto_principal || "/html/img/default-avatar.svg",
        galeria: galeria || [],
        stats: stats || { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
        created_at: new Date().toISOString().split('.')[0] + 'Z'
    };

    personajes.push(newChar);
    await writeJsonFile(CHARACTERS_FILE, personajes);
    return res.json(newChar);
});

app.put("/api/personajes/:char_id", authenticateToken, async (req, res) => {
    const charId = req.params.char_id;
    const { nombre, apodo, campana, clases, descripcion_habilidades, foto_principal, galeria, stats } = req.body;

    if (!nombre || !campana || !clases) {
        return res.status(400).json({ detail: "Los campos Nombre, Campana y Clases son requeridos." });
    }

    const personajes = await readJsonFile(CHARACTERS_FILE, []);
    let foundIdx = -1;

    for (let i = 0; i < personajes.length; i++) {
        if (personajes[i].id === charId) {
            if (req.user.role !== "admin" && personajes[i].user_id !== req.user.id) {
                return res.status(403).json({ detail: "No tienes derecho a alterar este registro mágico." });
            }
            foundIdx = i;
            break;
        }
    }

    if (foundIdx === -1) {
        return res.status(404).json({ detail: "Personaje no encontrado." });
    }

    const updatedChar = {
        id: charId,
        user_id: personajes[foundIdx].user_id,
        nombre,
        apodo: apodo || "",
        campana,
        clases,
        descripcion_habilidades: descripcion_habilidades || "",
        foto_principal: foto_principal || "/html/img/default-avatar.svg",
        galeria: galeria || [],
        stats: stats || { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
        created_at: personajes[foundIdx].created_at || (new Date().toISOString().split('.')[0] + 'Z')
    };

    personajes[foundIdx] = updatedChar;
    await writeJsonFile(CHARACTERS_FILE, personajes);
    return res.json(updatedChar);
});

// Helper para borrar archivos locales de imagen subidos al servidor
function deleteLocalFile(publicUrl) {
    if (!publicUrl || typeof publicUrl !== 'string') return;
    
    // Corregir posibles typos históricos en la ruta
    let normalizedUrl = publicUrl;
    if (normalizedUrl.includes("/img/uploads/gallerys/")) {
        normalizedUrl = normalizedUrl.replace("/img/uploads/gallerys/", "/img/uploads/galleries/");
    }

    if (normalizedUrl.startsWith("/html/img/uploads/")) {
        const relativePath = normalizedUrl.substring(5); // Quitar "/html"
        const filePath = path.join(BASE_DIR, "html", relativePath);
        
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Archivo local eliminado con éxito: ${filePath}`);
            }
        } catch (err) {
            console.warn(`No se pudo borrar el archivo local ${filePath}: ${err.message}`);
        }
    }
}

app.delete("/api/personajes/:char_id", authenticateToken, async (req, res) => {
    const charId = req.params.char_id;
    const personajes = await readJsonFile(CHARACTERS_FILE, []);
    const filtered = [];
    let found = false;
    let charToDelete = null;

    for (let p of personajes) {
        if (p.id === charId) {
            if (req.user.role !== "admin" && p.user_id !== req.user.id) {
                return res.status(403).json({ detail: "No tienes derecho a borrar este registro del gremio." });
            }
            found = true;
            charToDelete = p;
        } else {
            filtered.push(p);
        }
    }

    if (!found) {
        return res.status(404).json({ detail: "Personaje no encontrado." });
    }

    // Borrar archivos asociados del almacenamiento local
    if (charToDelete) {
        if (charToDelete.foto_principal && charToDelete.foto_principal !== "/html/img/default-avatar.svg") {
            deleteLocalFile(charToDelete.foto_principal);
        }
        if (charToDelete.galeria && Array.isArray(charToDelete.galeria)) {
            for (let imgUrl of charToDelete.galeria) {
                deleteLocalFile(imgUrl);
            }
        }
    }

    await writeJsonFile(CHARACTERS_FILE, filtered);
    return res.json({ status: "success", message: "Ficha borrada exitosamente del gremio" });
});

// --- RUTAS DE SESIONES D&D ---
app.get("/api/sesiones", authenticateToken, async (req, res) => {
    const sesiones = await readJsonFile(SESSIONS_FILE, []);
    const personajes = await readJsonFile(CHARACTERS_FILE, []);

    // IDs de personajes que pertenecen al usuario
    const userCharIds = new Set(personajes.filter(p => p.user_id === req.user.id).map(p => p.id));

    const response = sesiones.map(s => {
        const joinedChars = s.personajes || [];
        const joinedCount = joinedChars.length;
        const hasJoined = joinedChars.some(cid => userCharIds.has(cid));

        return {
            id: s.id,
            nombre: s.nombre,
            descripcion: s.descripcion,
            dm_id: s.dm_id,
            dm_username: s.dm_username,
            created_at: s.created_at,
            personajes: joinedChars,
            joined_characters_count: joinedCount,
            user_joined: hasJoined
        };
    });
    return res.json(response);
});

app.post("/api/sesiones", authenticateToken, requireDM, async (req, res) => {
    const { nombre, descripcion } = req.body;

    if (!nombre || typeof nombre !== 'string') {
        return res.status(400).json({ detail: "El nombre de la sesión no puede estar vacío." });
    }

    const nombreClean = nombre.trim();
    if (!nombreClean) {
        return res.status(400).json({ detail: "El nombre de la sesión no puede estar vacío." });
    }

    const sesiones = await readJsonFile(SESSIONS_FILE, []);

    const newSess = {
        id: `sess_${crypto.randomBytes(4).toString('hex')}`,
        nombre: nombreClean,
        descripcion: (descripcion || "").trim(),
        dm_id: req.user.id,
        dm_username: req.user.username,
        created_at: new Date().toISOString().split('.')[0] + 'Z',
        personajes: []
    };

    sesiones.push(newSess);
    await writeJsonFile(SESSIONS_FILE, sesiones);

    return res.json({
        ...newSess,
        joined_characters_count: 0,
        user_joined: false
    });
});

app.delete("/api/sesiones/:session_id", authenticateToken, requireDM, async (req, res) => {
    const sessId = req.params.session_id;
    const sesiones = await readJsonFile(SESSIONS_FILE, []);
    const filtered = [];
    let found = false;

    for (let s of sesiones) {
        if (s.id === sessId) {
            if (req.user.role !== "admin" && s.dm_id !== req.user.id) {
                return res.status(403).json({ detail: "No tienes derecho a disolver esta sesión mágica." });
            }
            found = true;
        } else {
            filtered.push(s);
        }
    }

    if (!found) {
        return res.status(404).json({ detail: "Sesión no encontrada." });
    }

    await writeJsonFile(SESSIONS_FILE, filtered);
    return res.json({ status: "success", message: "Sesión de juego disuelta con éxito." });
});

app.post("/api/sesiones/:session_id/personajes/:char_id", authenticateToken, async (req, res) => {
    const { session_id, char_id } = req.params;
    const sesiones = await readJsonFile(SESSIONS_FILE, []);
    const personajes = await readJsonFile(CHARACTERS_FILE, []);

    const character = personajes.find(p => p.id === char_id);
    if (!character) {
        return res.status(404).json({ detail: "El personaje no existe." });
    }

    if (character.user_id !== req.user.id) {
        return res.status(403).json({ detail: "No eres el propietario de esta ficha de personaje." });
    }

    let found = false;
    for (let s of sesiones) {
        if (s.id === session_id) {
            found = true;
            if (!s.personajes) s.personajes = [];
            if (!s.personajes.includes(char_id)) {
                s.personajes.push(char_id);
            }
            break;
        }
    }

    if (!found) {
        return res.status(404).json({ detail: "Sesión de juego no encontrada." });
    }

    await writeJsonFile(SESSIONS_FILE, sesiones);
    return res.json({ status: "success", message: `${character.nombre} se ha unido a la sesión con éxito.` });
});

app.delete("/api/sesiones/:session_id/personajes/:char_id", authenticateToken, async (req, res) => {
    const { session_id, char_id } = req.params;
    const sesiones = await readJsonFile(SESSIONS_FILE, []);
    const personajes = await readJsonFile(CHARACTERS_FILE, []);

    const session = sesiones.find(s => s.id === session_id);
    if (!session) {
        return res.status(404).json({ detail: "Sesión de juego no encontrada." });
    }

    const character = personajes.find(p => p.id === char_id);
    const isOwner = character && character.user_id === req.user.id;
    const isDmOrAdmin = req.user.role === "admin" || session.dm_id === req.user.id;

    if (!isOwner && !isDmOrAdmin) {
        return res.status(403).json({ detail: "No tienes permisos para retirar a este personaje de la sesión." });
    }

    if (session.personajes && session.personajes.includes(char_id)) {
        session.personajes = session.personajes.filter(id => id !== char_id);
    }

    await writeJsonFile(SESSIONS_FILE, sesiones);
    const charName = character ? character.nombre : "El personaje";
    return res.json({ status: "success", message: `${charName} ha sido retirado de la sesión.` });
});

app.get("/api/sesiones/:session_id/personajes", authenticateToken, async (req, res) => {
    const sessId = req.params.session_id;
    const sesiones = await readJsonFile(SESSIONS_FILE, []);
    const personajes = await readJsonFile(CHARACTERS_FILE, []);
    const usuarios = await readJsonFile(USERS_FILE, []);

    const userMap = {};
    for (let u of usuarios) {
        userMap[u.id] = u.username;
    }

    const session = sesiones.find(s => s.id === sessId);
    if (!session) {
        return res.status(404).json({ detail: "Sesión no encontrada." });
    }

    if (req.user.role !== "admin" && session.dm_id !== req.user.id) {
        return res.status(403).json({ detail: "No tienes derecho a inspeccionar las fichas de esta sesión." });
    }

    const sessionCharIds = new Set(session.personajes || []);
    const sessionCharacters = [];

    for (let p of personajes) {
        if (sessionCharIds.has(p.id)) {
            const pCopy = { ...p };
            pCopy.owner_username = userMap[p.user_id] || "Desconocido";
            sessionCharacters.push(pCopy);
        }
    }

    return res.json(sessionCharacters);
});

// --- RUTA PARA SUBIR IMÁGENES (AVATARS Y GALERÍA MULTIPART) ---
const AVATARS_DIR = path.join(BASE_DIR, "html", "img", "uploads", "avatars");
const GALLERIES_DIR = path.join(BASE_DIR, "html", "img", "uploads", "galleries");

if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });
if (!fs.existsSync(GALLERIES_DIR)) fs.mkdirSync(GALLERIES_DIR, { recursive: true });

const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadType = req.params.upload_type;
        if (uploadType === "avatar") {
            cb(null, AVATARS_DIR);
        } else {
            cb(null, GALLERIES_DIR);
        }
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = crypto.randomBytes(16).toString("hex") + ext;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const uploadType = req.params.upload_type;
    if (uploadType !== "avatar" && uploadType !== "gallery") {
        return cb(new Error("Tipo de subida no permitido"), false);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        return cb(new Error(`Solo se permiten formatos: ${ALLOWED_IMAGE_EXTENSIONS.join(", ")}`), false);
    }
    cb(null, true);
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // Límite de 5MB
});

app.post("/api/upload/:upload_type", authenticateToken, (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ detail: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ detail: "No se proporcionó ningún archivo de imagen." });
        }
        
        const uploadType = req.params.upload_type;
        const folderName = uploadType === "avatar" ? "avatars" : "galleries";
        const publicUrl = `/html/img/uploads/${folderName}/${req.file.filename}`;
        return res.json({ status: "success", url: publicUrl });
    });
});

// --- ENDPOINTS DE EXPORTACIÓN (JSON Y CSV) ---
app.get("/api/personajes/export/json", authenticateToken, async (req, res) => {
    let personajes = await readJsonFile(CHARACTERS_FILE, []);
    
    if (req.user.role !== "admin") {
        personajes = personajes.filter(p => p.user_id === req.user.id);
    }

    res.setHeader('Content-disposition', 'attachment; filename=backup_personajes.json');
    res.setHeader('Content-type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify(personajes, null, 4));
});

app.get("/api/personajes/export/csv", authenticateToken, async (req, res) => {
    let personajes = await readJsonFile(CHARACTERS_FILE, []);
    
    if (req.user.role !== "admin") {
        personajes = personajes.filter(p => p.user_id === req.user.id);
    }

    const cabeceras = ["Nombre", "Apodo", "Campana", "Clases", "Descripcion_Habilidades", "Foto_Principal", "Galeria", "FUE", "DES", "CON", "INT", "SAB", "CAR"];
    let csvContent = cabeceras.join(";") + "\n";

    for (let p of personajes) {
        const clasesStr = (p.clases || []).join(", ");
        const galeriaStr = (p.galeria || []).join(", ");
        const stats = p.stats || {};
        
        const row = [
            p.nombre || "",
            p.apodo || "",
            p.campana || "",
            clasesStr,
            p.descripcion_habilidades || "",
            p.foto_principal || "",
            galeriaStr,
            stats.fue !== undefined ? stats.fue : 10,
            stats.des !== undefined ? stats.des : 10,
            stats.con !== undefined ? stats.con : 10,
            stats.int !== undefined ? stats.int : 10,
            stats.sab !== undefined ? stats.sab : 10,
            stats.car !== undefined ? stats.car : 10
        ];
        
        // Escapar valores para CSV (reemplazar saltos de línea y puntos y comas)
        const escapedRow = row.map(val => {
            const valStr = String(val).replace(/;/g, ",").replace(/\r?\n/g, " ");
            return valStr;
        });

        csvContent += escapedRow.join(";") + "\n";
    }

    res.setHeader('Content-disposition', 'attachment; filename=backup_personajes.csv');
    res.setHeader('Content-type', 'text/csv; charset=utf-8');
    return res.send(csvContent);
});

// --- DESCARGA DE PLANTILLAS Y CARGA MASIVA ---
app.get("/api/personajes/template/csv", async (req, res) => {
    const cabeceras = ["Nombre", "Apodo", "Campana", "Clases", "Descripcion_Habilidades", "Foto_Principal", "Galeria", "FUE", "DES", "CON", "INT", "SAB", "CAR"];
    const ejemplo = [
        "Regdar", 
        "El Indomable", 
        "La Tumba de la Aniquilación", 
        "Guerrero, Campeón", 
        "Fuerte, porta espadas mandoble de gran filo. Lidera las embestidas.", 
        "/html/img/default-avatar.svg", 
        "",
        "18", "12", "16", "8", "10", "12"
    ];

    const csvContent = cabeceras.join(";") + "\n" + ejemplo.join(";") + "\n";
    res.setHeader('Content-disposition', 'attachment; filename=plantilla_carga_masiva.csv');
    res.setHeader('Content-type', 'text/csv; charset=utf-8');
    return res.send(csvContent);
});

// Helper para parsear listas de strings de forma robusta y libre de duplicados (soporta arrays JSON o strings delimitados por comas/puntos y comas)
function parseStringList(rawInput) {
    let result = [];
    if (!rawInput) return [];
    if (Array.isArray(rawInput)) {
        result = rawInput.map(item => String(item).trim()).filter(item => item);
    } else {
        const trimmed = String(rawInput).trim();
        if (trimmed) {
            // Si parece un array JSON, intentar parsearlo
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        result = parsed.map(x => String(x).trim()).filter(x => x);
                    }
                } catch (e) {
                    // Caer al split simple si falla
                }
            }
            if (result.length === 0) {
                result = trimmed.split(/[;,]+/).map(item => item.trim()).filter(item => item);
            }
        }
    }
    // Eliminar duplicados de manera limpia
    return Array.from(new Set(result));
}

// Helper manual de parseo CSV robusto libre de dependencias
function parseCSV(contentStr) {
    const firstLine = contentStr.split(/\r?\n/)[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const lines = [];
    let currentLine = [];
    let currentVal = "";
    let insideQuotes = false;

    for (let i = 0; i < contentStr.length; i++) {
        const char = contentStr[i];
        const nextChar = contentStr[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentVal += '"';
                i++; // Salta la segunda comilla
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === delimiter && !insideQuotes) {
            currentLine.push(currentVal.trim());
            currentVal = "";
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            currentLine.push(currentVal.trim());
            if (currentLine.some(cell => cell !== "")) {
                lines.push(currentLine);
            }
            currentLine = [];
            currentVal = "";
        } else {
            currentVal += char;
        }
    }
    if (currentVal !== "" || currentLine.length > 0) {
        currentLine.push(currentVal.trim());
        if (currentLine.some(cell => cell !== "")) {
            lines.push(currentLine);
        }
    }
    return { lines, delimiter };
}

const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.post("/api/personajes/import", authenticateToken, memoryUpload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ detail: "No se proporcionó ningún archivo para importar." });
    }

    const filename = req.file.originalname.toLowerCase();
    const buffer = req.file.buffer;
    let importados = 0;
    const nuevosPersonajes = [];

    const personajesExistentes = await readJsonFile(CHARACTERS_FILE, []);

    // 1. Carga masiva desde JSON
    if (filename.endsWith('.json')) {
        try {
            const contentStr = buffer.toString('utf8');
            let data = JSON.parse(contentStr);
            if (!Array.isArray(data)) {
                data = [data];
            }

            for (let charData of data) {
                if (!charData.nombre || !charData.campana) {
                    continue;
                }

                const nombreClean = charData.nombre.trim();
                const campanaClean = charData.campana.trim();

                // Evitar duplicados
                const esDuplicado = personajesExistentes.some(p => 
                    p.user_id === req.user.id && 
                    p.nombre.toLowerCase().trim() === nombreClean.toLowerCase() && 
                    p.campana.toLowerCase().trim() === campanaClean.toLowerCase()
                ) || nuevosPersonajes.some(p => 
                    p.nombre.toLowerCase().trim() === nombreClean.toLowerCase() && 
                    p.campana.toLowerCase().trim() === campanaClean.toLowerCase()
                );

                if (esDuplicado) {
                    continue; // Saltar duplicado
                }

                let clases = parseStringList(charData.clases);
                let galeria = parseStringList(charData.galeria);

                let stats = { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 };
                if (charData.stats && typeof charData.stats === 'object') {
                    for (let key of ["fue", "des", "con", "int", "sab", "car"]) {
                        if (charData.stats[key] !== undefined) {
                            stats[key] = parseInt(charData.stats[key], 10) || 10;
                        }
                    }
                }

                const nuevo = {
                    id: `char_${crypto.randomBytes(4).toString('hex')}`,
                    user_id: req.user.id,
                    nombre: nombreClean,
                    apodo: charData.apodo || "",
                    campana: campanaClean,
                    clases: clases,
                    descripcion_habilidades: charData.descripcion_habilidades || "",
                    foto_principal: charData.foto_principal || "/html/img/default-avatar.svg",
                    galeria: galeria,
                    stats: stats,
                    created_at: new Date().toISOString().split('.')[0] + 'Z'
                };
                nuevosPersonajes.push(nuevo);
                importados++;
            }
        } catch (e) {
            return res.status(400).json({ detail: `Error parseando el archivo JSON: ${e.message}` });
        }
    } 
    // 2. Carga masiva desde CSV
    else if (filename.endsWith('.csv')) {
        let contentStr;
        try {
            contentStr = buffer.toString('utf8');
        } catch (e) {
            try {
                contentStr = buffer.toString('latin1');
            } catch (err) {
                return res.status(400).json({ detail: "No se pudo decodificar el CSV. Utiliza UTF-8." });
            }
        }

        const { lines } = parseCSV(contentStr);
        if (lines.length === 0) {
            return res.status(400).json({ detail: "El archivo CSV está vacío." });
        }

        const cabeceras = lines[0];
        const cabecerasClean = cabeceras.map(c => c.trim().toLowerCase().replace(/_/g, ""));
        
        // Mapear columnas
        const colMap = {};
        cabecerasClean.forEach((h, idx) => {
            if (h === "nombre" || h === "name") colMap["nombre"] = idx;
            else if (h === "apodo" || h === "nickname") colMap["apodo"] = idx;
            else if (h === "campana" || h === "campaign") colMap["campana"] = idx;
            else if (h === "clases" || h === "classes") colMap["clases"] = idx;
            else if (h === "descripcionhabilidades" || h === "descripcion" || h === "skills") colMap["descripcion"] = idx;
            else if (h === "fotoprincipal" || h === "avatar") colMap["foto_principal"] = idx;
            else if (h === "galeria" || h === "gallery") colMap["galeria"] = idx;
            else if (h === "fue" || h === "fuerza") colMap["fue"] = idx;
            else if (h === "des" || h === "destreza") colMap["des"] = idx;
            else if (h === "con" || h === "constitucion") colMap["con"] = idx;
            else if (h === "int" || h === "inteligencia") colMap["int"] = idx;
            else if (h === "sab" || h === "sabiduria") colMap["sab"] = idx;
            else if (h === "car" || h === "carisma") colMap["car"] = idx;
        });

        if (colMap["nombre"] === undefined || colMap["campana"] === undefined) {
            return res.status(400).json({ detail: "El CSV debe tener al menos las columnas 'Nombre' y 'Campana'." });
        }

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            if (!row || row.length <= Math.max(...Object.values(colMap))) {
                continue;
            }

            const nombre = row[colMap["nombre"]].trim();
            const campana = row[colMap["campana"]].trim();
            if (!nombre || !campana) {
                continue;
            }

            // Evitar duplicados
            const esDuplicado = personajesExistentes.some(p => 
                p.user_id === req.user.id && 
                p.nombre.toLowerCase().trim() === nombre.toLowerCase() && 
                p.campana.toLowerCase().trim() === campana.toLowerCase()
            ) || nuevosPersonajes.some(p => 
                p.nombre.toLowerCase().trim() === nombre.toLowerCase() && 
                p.campana.toLowerCase().trim() === campana.toLowerCase()
            );

            if (esDuplicado) {
                continue; // Saltar duplicado
            }

            const apodo = colMap["apodo"] !== undefined ? row[colMap["apodo"]].trim() : "";
            
            const clasesRaw = colMap["clases"] !== undefined ? row[colMap["clases"]].trim() : "";
            const clases = parseStringList(clasesRaw);

            const desc = colMap["descripcion"] !== undefined ? row[colMap["descripcion"]].trim() : "";
            
            let foto = colMap["foto_principal"] !== undefined ? row[colMap["foto_principal"]].trim() : "";
            if (!foto) {
                foto = "/html/img/default-avatar.svg";
            }

            const galeriaRaw = colMap["galeria"] !== undefined ? row[colMap["galeria"]].trim() : "";
            const galeria = parseStringList(galeriaRaw);

            function parseStat(val) {
                if (!val) return 10;
                const parsed = parseInt(val, 10);
                return isNaN(parsed) ? 10 : parsed;
            }

            const stats = {
                fue: colMap["fue"] !== undefined ? parseStat(row[colMap["fue"]]) : 10,
                des: colMap["des"] !== undefined ? parseStat(row[colMap["des"]]) : 10,
                con: colMap["con"] !== undefined ? parseStat(row[colMap["con"]]) : 10,
                int: colMap["int"] !== undefined ? parseStat(row[colMap["int"]]) : 10,
                sab: colMap["sab"] !== undefined ? parseStat(row[colMap["sab"]]) : 10,
                car: colMap["car"] !== undefined ? parseStat(row[colMap["car"]]) : 10
            };

            const nuevo = {
                id: `char_${crypto.randomBytes(4).toString('hex')}`,
                user_id: req.user.id,
                nombre,
                apodo,
                campana,
                clases,
                descripcion_habilidades: desc,
                foto_principal: foto,
                galeria,
                stats,
                created_at: new Date().toISOString().split('.')[0] + 'Z'
            };
            nuevosPersonajes.push(nuevo);
            importados++;
        }
    } else {
        return res.status(400).json({ detail: "Formato de archivo no soportado. Usa .csv o .json." });
    }

    if (nuevosPersonajes.length > 0) {
        const personajes = await readJsonFile(CHARACTERS_FILE, []);
        personajes.push(...nuevosPersonajes);
        await writeJsonFile(CHARACTERS_FILE, personajes);
    }

    return res.json({
        status: "success",
        message: `Se han importado exitosamente ${importados} nuevos personajes a tus crónicas.`,
        count: importados
    });
});

// --- SERVIDOR DE IMÁGENES LOCALES DE SUBIDA ---
app.get("/html/img/uploads/avatars/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(AVATARS_DIR, filename);
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
    }
    const fallbackPath = path.join(BASE_DIR, "html", "img", "uploads", "avatars", filename);
    if (fs.existsSync(fallbackPath)) {
        return res.sendFile(fallbackPath);
    }
    return res.status(404).send("Imagen no encontrada");
});

app.get("/html/img/uploads/galleries/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(GALLERIES_DIR, filename);
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
    }
    const fallbackPath = path.join(BASE_DIR, "html", "img", "uploads", "galleries", filename);
    if (fs.existsSync(fallbackPath)) {
        return res.sendFile(fallbackPath);
    }
    return res.status(404).send("Imagen no encontrada");
});

app.get("/html/img/uploads/gallerys/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(GALLERIES_DIR, filename);
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
    }
    const fallbackPath = path.join(BASE_DIR, "html", "img", "uploads", "galleries", filename);
    if (fs.existsSync(fallbackPath)) {
        return res.sendFile(fallbackPath);
    }
    return res.status(404).send("Imagen no encontrada");
});

// --- SERVIDOR DE ARCHIVOS ESTÁTICOS ---
const HTML_DIR = path.join(BASE_DIR, "html");
app.use("/html", express.static(HTML_DIR));

app.get("/", (req, res) => {
    return res.redirect("/html/index.html");
});

// Iniciar base de datos y arrancar el servidor
const PORT = 8081;
const HOST = '0.0.0.0';

async function startServer() {
    await connectPostgres();
    await connectMongo();
    await initDb();

    const sslKey = path.join(BASE_DIR, "key.pem");
    const sslCert = path.join(BASE_DIR, "cert.pem");

    if (fs.existsSync(sslKey) && fs.existsSync(sslCert)) {
        const options = {
            key: fs.readFileSync(sslKey),
            cert: fs.readFileSync(sslCert)
        };
        console.log("\n Iniciando el Portal del Gremio de Héroes D&D...");
        console.log(`Accede en: https://127.0.0.1:${PORT} (Conexion Segura HTTPS)\n`);
        https.createServer(options, app).listen(PORT, HOST);
    } else {
        console.log("\n Iniciando el Portal del Gremio de Héroes D&D...");
        console.log(`Accede en: http://127.0.0.1:${PORT} (Conexion Estandar HTTP)\n`);
        http.createServer(app).listen(PORT, HOST);
    }
}

startServer().catch(err => {
    console.error("⚠️ Error crítico al arrancar el servidor:", err);
});
