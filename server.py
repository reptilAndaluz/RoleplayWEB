from fastapi import FastAPI, Depends, HTTPException, status, Body, UploadFile, File, Form
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from pydantic import BaseModel, ValidationError
from typing import List, Optional, Union, Dict
from datetime import datetime, timedelta
import hashlib
import uuid
import shutil
import csv
import io
import jwt
import json
import os
import time
import tempfile

# Configuración de Seguridad
SECRET_KEY = os.environ.get("SECRET_KEY", "dnd_catalogo_secret_key_revelation_99_magic")
ALGORITHM = "HS256"

app = FastAPI(title="Catálogo de Personajes D&D")

# Middleware para inyectar Cabeceras de Seguridad y prevenir ataques
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: http: https:; "
            "frame-src https://www.youtube.com https://youtube.com;"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)

# --- SISTEMA DE CONTRASEÑAS SEGURAS (SHA256 con PBKDF2 y Sal) ---
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return f"{salt.hex()}:{pwd_hash.hex()}"

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, hash_hex = stored_hash.split(':')
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(hash_hex)
        pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
        return pwd_hash == expected_hash
    except Exception:
        return False

# --- PERSISTENCIA EN ARCHIVOS JSON ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IS_VERCEL = "VERCEL" in os.environ

if IS_VERCEL:
    DATA_DIR = "/tmp/data"
else:
    DATA_DIR = os.path.join(BASE_DIR, "data")

os.makedirs(DATA_DIR, exist_ok=True)

USERS_FILE = os.path.join(DATA_DIR, "usuarios.json")
CHARACTERS_FILE = os.path.join(DATA_DIR, "personajes.json")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")

# Copiar archivos JSON locales a /tmp/data en Vercel si existen
if IS_VERCEL:
    import shutil
    ORIG_DATA_DIR = os.path.join(BASE_DIR, "data")
    for filename in ["usuarios.json", "personajes.json", "config.json"]:
        orig_path = os.path.join(ORIG_DATA_DIR, filename)
        tmp_path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(tmp_path) and os.path.exists(orig_path):
            try:
                shutil.copy2(orig_path, tmp_path)
            except Exception:
                pass

def read_json_file(filepath: str, default_value: Union[list, dict]) -> Union[list, dict]:
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return default_value
    return default_value

def write_json_file(filepath: str, data: Union[list, dict]):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

# Inicializar archivos con datos por defecto
def init_db():
    # 1. Configuración por defecto
    if not os.path.exists(CONFIG_FILE):
        default_config = {
            "titulo": "Gremio de Héroes D&D",
            "descripcion": "El archivo místico donde descansan los registros de los aventureros de nuestras campañas.",
            "tema": "dragons_lair",  # Tema inicial
            "logo": ""
        }
        write_json_file(CONFIG_FILE, default_config)

    # 2. Usuarios por defecto (Admin)
    usuarios = read_json_file(USERS_FILE, [])
    if not usuarios:
        # Contraseña por defecto: 1234
        admin_user = {
            "id": f"usr_{uuid.uuid4().hex[:8]}",
            "username": "admin",
            "password_hash": hash_password("1234"),
            "role": "admin",
            "created_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        }
        usuarios.append(admin_user)
        write_json_file(USERS_FILE, usuarios)

    # 3. Personajes por defecto
    if not os.path.exists(CHARACTERS_FILE):
        write_json_file(CHARACTERS_FILE, [])

init_db()

# --- AUTENTICACIÓN JWT ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

def get_current_user(token: Optional[str] = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se proporcionaron credenciales de sesión",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        user_id: str = payload.get("user_id")
        if username is None or role is None or user_id is None:
            raise HTTPException(status_code=401, detail="Token de sesión incompleto")
        
        # Verificar que el usuario exista
        usuarios = read_json_file(USERS_FILE, [])
        user_exists = any(u["id"] == user_id for u in usuarios)
        if not user_exists:
            raise HTTPException(status_code=401, detail="El usuario ya no existe")
            
        return {"id": user_id, "username": username, "role": role}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada. Vuelve a iniciar sesión.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Firma de sesión inválida.")

def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado. Se requieren permisos de administrador.")
    return current_user

# --- MODELOS PYDANTIC ---
class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str  # 'user' o 'admin'

class UserResponse(BaseModel):
    id: str
    username: str
    role: str
    created_at: str

class ConfigUpdate(BaseModel):
    titulo: str
    descripcion: str
    tema: str  # 'dragons_lair', 'elven_forest', 'mystic_underdark', 'tavern_parchment'
    logo: Optional[str] = ""

class CharacterModel(BaseModel):
    id: Optional[str] = None
    user_id: Optional[str] = None
    nombre: str
    apodo: str
    campana: str
    clases: List[str]
    descripcion_habilidades: str
    foto_principal: Optional[str] = ""
    galeria: Optional[List[str]] = []
    created_at: Optional[str] = None
    stats: Optional[Dict[str, int]] = None

# --- RUTAS DE AUTENTICACIÓN ---
@app.post("/api/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    usuarios = read_json_file(USERS_FILE, [])
    for u in usuarios:
        if u["username"].lower() == form_data.username.lower():
            if verify_password(form_data.password, u["password_hash"]):
                # Crear token
                token_data = {
                    "sub": u["username"],
                    "role": u["role"],
                    "user_id": u["id"]
                }
                access_token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)
                return {
                    "access_token": access_token,
                    "token_type": "bearer",
                    "role": u["role"],
                    "username": u["username"]
                }
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Nombre de usuario o contraseña incorrectos"
    )

class UserRegister(BaseModel):
    username: str
    password: str

@app.post("/api/auth/register")
async def register(payload: UserRegister):
    username_clean = payload.username.strip()
    if not username_clean:
        raise HTTPException(status_code=400, detail="El nombre de aventurero no puede estar vacío.")
    
    if username_clean.lower() == "admin":
        raise HTTPException(status_code=400, detail="El nombre 'admin' está reservado para el Maestro del Gremio.")
        
    usuarios = read_json_file(USERS_FILE, [])
    if any(u["username"].lower() == username_clean.lower() for u in usuarios):
        raise HTTPException(status_code=400, detail="Este aventurero ya ha sido alistado en el gremio.")
        
    new_user = {
        "id": f"usr_{uuid.uuid4().hex[:8]}",
        "username": username_clean,
        "password_hash": hash_password(payload.password),
        "role": "user",  # Forzado estrictamente a "user"
        "created_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    }
    
    usuarios.append(new_user)
    write_json_file(USERS_FILE, usuarios)
    return {"status": "success", "message": "Te has alistado correctamente. ¡Franquea la entrada!"}

# --- RUTAS DE ADMINISTRACIÓN (CONFIGURACIÓN Y USUARIOS) ---
@app.get("/api/config")
async def get_config():
    return read_json_file(CONFIG_FILE, {})

@app.post("/api/admin/config")
async def update_config(payload: ConfigUpdate, admin: dict = Depends(get_admin_user)):
    write_json_file(CONFIG_FILE, payload.dict())
    return {"status": "success", "message": "Configuración del portal actualizada místicamente"}

@app.get("/api/admin/usuarios", response_model=List[UserResponse])
async def list_users(admin: dict = Depends(get_admin_user)):
    usuarios = read_json_file(USERS_FILE, [])
    # Excluir contraseñas de la respuesta
    return [
        {
            "id": u["id"],
            "username": u["username"],
            "role": u["role"],
            "created_at": u.get("created_at", "")
        }
        for u in usuarios
    ]

@app.post("/api/admin/usuarios", response_model=UserResponse)
async def create_user(payload: UserCreate, admin: dict = Depends(get_admin_user)):
    usuarios = read_json_file(USERS_FILE, [])
    
    # Validar que no exista
    if any(u["username"].lower() == payload.username.lower() for u in usuarios):
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado.")
        
    if payload.role not in ["user", "admin"]:
        raise HTTPException(status_code=400, detail="Rol inválido. Debe ser 'user' o 'admin'.")
        
    new_user = {
        "id": f"usr_{uuid.uuid4().hex[:8]}",
        "username": payload.username,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "created_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    }
    
    usuarios.append(new_user)
    write_json_file(USERS_FILE, usuarios)
    
    return {
        "id": new_user["id"],
        "username": new_user["username"],
        "role": new_user["role"],
        "created_at": new_user["created_at"]
    }

@app.delete("/api/admin/usuarios/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(get_admin_user)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo, valiente líder.")
        
    usuarios = read_json_file(USERS_FILE, [])
    filtered_users = [u for u in usuarios if u["id"] != user_id]
    
    if len(filtered_users) == len(usuarios):
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        
    # Eliminar también los personajes de ese usuario
    personajes = read_json_file(CHARACTERS_FILE, [])
    filtered_personajes = [p for p in personajes if p.get("user_id") != user_id]
    
    write_json_file(USERS_FILE, filtered_users)
    write_json_file(CHARACTERS_FILE, filtered_personajes)
    
    return {"status": "success", "message": "Usuario y sus héroes asociados eliminados con éxito"}

class RoleUpdateRequest(BaseModel):
    role: str  # 'user' o 'admin'

@app.put("/api/admin/usuarios/{user_id}/role")
async def update_user_role(user_id: str, payload: RoleUpdateRequest, admin: dict = Depends(get_admin_user)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="No puedes alterar tu propio rango, sabio líder.")
        
    if payload.role not in ["user", "admin"]:
        raise HTTPException(status_code=400, detail="Rango no permitido. Debe ser 'user' o 'admin'.")
        
    usuarios = read_json_file(USERS_FILE, [])
    found = False
    
    for u in usuarios:
        if u["id"] == user_id:
            u["role"] = payload.role
            found = True
            break
            
    if not found:
        raise HTTPException(status_code=404, detail="El aventurero especificado no existe en los registros.")
        
    write_json_file(USERS_FILE, usuarios)
    return {"status": "success", "message": "Rango del aventurero actualizado místicamente."}

# --- RUTAS DE PERSONAJES (CRUD) ---
@app.get("/api/personajes", response_model=List[CharacterModel])
async def list_characters(user: dict = Depends(get_current_user)):
    personajes = read_json_file(CHARACTERS_FILE, [])
    
    # Si es admin, puede ver todo. Si es usuario regular, solo sus propios personajes.
    if user["role"] == "admin":
        return personajes
    else:
        return [p for p in personajes if p.get("user_id") == user["id"]]

@app.get("/api/personajes/{char_id}", response_model=CharacterModel)
async def get_character(char_id: str, user: dict = Depends(get_current_user)):
    personajes = read_json_file(CHARACTERS_FILE, [])
    for p in personajes:
        if p["id"] == char_id:
            # Control de acceso
            if user["role"] != "admin" and p.get("user_id") != user["id"]:
                raise HTTPException(status_code=403, detail="No tienes derecho a ver este registro mágico.")
            return p
    raise HTTPException(status_code=404, detail="Personaje no encontrado en las crónicas.")

@app.post("/api/personajes", response_model=CharacterModel)
async def create_character(payload: CharacterModel, user: dict = Depends(get_current_user)):
    personajes = read_json_file(CHARACTERS_FILE, [])
    
    new_char = payload.dict()
    new_char["id"] = f"char_{uuid.uuid4().hex[:8]}"
    new_char["user_id"] = user["id"]
    new_char["created_at"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    
    # Valores por defecto para foto si está vacía
    if not new_char.get("foto_principal"):
        new_char["foto_principal"] = "/html/img/default-avatar.svg"
        
    personajes.append(new_char)
    write_json_file(CHARACTERS_FILE, personajes)
    return new_char

@app.put("/api/personajes/{char_id}", response_model=CharacterModel)
async def update_character(char_id: str, payload: CharacterModel, user: dict = Depends(get_current_user)):
    personajes = read_json_file(CHARACTERS_FILE, [])
    found_idx = -1
    
    for idx, p in enumerate(personajes):
        if p["id"] == char_id:
            if user["role"] != "admin" and p.get("user_id") != user["id"]:
                raise HTTPException(status_code=403, detail="No tienes derecho a alterar este registro mágico.")
            found_idx = idx
            break
            
    if found_idx == -1:
        raise HTTPException(status_code=404, detail="Personaje no encontrado.")
        
    updated_char = payload.dict()
    # Mantener metadatos originales
    updated_char["id"] = char_id
    updated_char["user_id"] = personajes[found_idx]["user_id"]
    updated_char["created_at"] = personajes[found_idx].get("created_at", datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"))
    
    if not updated_char.get("foto_principal"):
        updated_char["foto_principal"] = "/html/img/default-avatar.svg"
        
    personajes[found_idx] = updated_char
    write_json_file(CHARACTERS_FILE, personajes)
    return updated_char

@app.delete("/api/personajes/{char_id}")
async def delete_character(char_id: str, user: dict = Depends(get_current_user)):
    personajes = read_json_file(CHARACTERS_FILE, [])
    filtered = []
    found = False
    
    for p in personajes:
        if p["id"] == char_id:
            if user["role"] != "admin" and p.get("user_id") != user["id"]:
                raise HTTPException(status_code=403, detail="No tienes derecho a borrar este registro del gremio.")
            found = True
        else:
            filtered.append(p)
            
    if not found:
        raise HTTPException(status_code=404, detail="Personaje no encontrado.")
        
    write_json_file(CHARACTERS_FILE, filtered)
    return {"status": "success", "message": "Ficha borrada exitosamente del gremio"}

# --- RUTA PARA SUBIR IMÁGENES (AVATARS Y GALERÍA MULTIPART) ---
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

if IS_VERCEL:
    AVATARS_DIR = "/tmp/uploads/avatars"
    GALLERIES_DIR = "/tmp/uploads/galleries"
else:
    AVATARS_DIR = os.path.join(BASE_DIR, "html", "img", "uploads", "avatars")
    GALLERIES_DIR = os.path.join(BASE_DIR, "html", "img", "uploads", "galleries")

os.makedirs(AVATARS_DIR, exist_ok=True)
os.makedirs(GALLERIES_DIR, exist_ok=True)

@app.post("/api/upload/{upload_type}")
async def upload_image(upload_type: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if upload_type not in ["avatar", "gallery"]:
        raise HTTPException(status_code=400, detail="Tipo de subida no permitido")
        
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Solo se permiten formatos: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}")
        
    # Nombre de archivo único
    unique_name = f"{uuid.uuid4().hex}{ext}"
    
    if upload_type == "avatar":
        target_path = os.path.join(AVATARS_DIR, unique_name)
        public_url = f"/html/img/uploads/avatars/{unique_name}"
    else:
        target_path = os.path.join(GALLERIES_DIR, unique_name)
        public_url = f"/html/img/uploads/galleries/{unique_name}"
        
    # Límite de 5MB
    MAX_SIZE = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="El archivo supera el tamaño máximo permitido (5 MB).")
        
    with open(target_path, "wb") as f:
        f.write(content)
        
    return {"status": "success", "url": public_url}

# --- ENDPOINTS DE EXPORTACIÓN (JSON Y CSV) ---
@app.get("/api/personajes/export/json")
async def export_characters_json(user: dict = Depends(get_current_user)):
    personajes = read_json_file(CHARACTERS_FILE, [])
    # Filtrar personajes del usuario
    if user["role"] != "admin":
        personajes = [p for p in personajes if p.get("user_id") == user["id"]]
        
    fd, path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(personajes, f, ensure_ascii=False, indent=4)
        
    return FileResponse(path, media_type="application/json", filename="backup_personajes.json")

@app.get("/api/personajes/export/csv")
async def export_characters_csv(user: dict = Depends(get_current_user)):
    personajes = read_json_file(CHARACTERS_FILE, [])
    if user["role"] != "admin":
        personajes = [p for p in personajes if p.get("user_id") == user["id"]]
        
    cabeceras = ["Nombre", "Apodo", "Campana", "Clases", "Descripcion_Habilidades", "Foto_Principal", "Galeria"]
    
    fd, path = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(cabeceras)
        for p in personajes:
            clases_str = ", ".join(p.get("clases", []))
            galeria_str = ", ".join(p.get("galeria", []))
            writer.writerow([
                p.get("nombre", ""),
                p.get("apodo", ""),
                p.get("campana", ""),
                clases_str,
                p.get("descripcion_habilidades", ""),
                p.get("foto_principal", ""),
                galeria_str
            ])
            
    return FileResponse(path, media_type="text/csv", filename="backup_personajes.csv")

# --- DESCARGA DE PLANTILLAS Y CARGA MASIVA ---
@app.get("/api/personajes/template/csv")
async def get_csv_template():
    # Retornar una plantilla CSV predefinida
    cabeceras = ["Nombre", "Apodo", "Campana", "Clases", "Descripcion_Habilidades", "Foto_Principal", "Galeria"]
    ejemplo = [
        "Regdar", 
        "El Indomable", 
        "La Tumba de la Aniquilación", 
        "Guerrero, Campeón", 
        "Fuerte, porta espadas mandoble de gran filo. Lidera las embestidas.", 
        "/html/img/default-avatar.svg", 
        ""
    ]
    
    fd, path = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(cabeceras)
        writer.writerow(ejemplo)
        
    return FileResponse(path, media_type="text/csv", filename="plantilla_carga_masiva.csv")

@app.post("/api/personajes/import")
async def import_characters(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    filename = (file.filename or "").lower()
    contents = await file.read()
    
    importados = 0
    nuevos_personajes = []
    
    # 1. Carga masiva desde JSON
    if filename.endswith('.json'):
        try:
            data = json.loads(contents.decode('utf-8'))
            if not isinstance(data, list):
                # Si es un solo objeto lo envolvemos en lista
                data = [data]
                
            for char_data in data:
                # Validar campos obligatorios
                if "nombre" not in char_data or "campana" not in char_data:
                    continue
                
                clases = char_data.get("clases", [])
                if isinstance(clases, str):
                    clases = [c.strip() for c in clases.split(",") if c.strip()]
                    
                galeria = char_data.get("galeria", [])
                if isinstance(galeria, str):
                    galeria = [g.strip() for g in galeria.split(",") if g.strip()]
                    
                nuevo = {
                    "id": f"char_{uuid.uuid4().hex[:8]}",
                    "user_id": user["id"],
                    "nombre": char_data.get("nombre", "Sin Nombre"),
                    "apodo": char_data.get("apodo", ""),
                    "campana": char_data.get("campana", "General"),
                    "clases": clases,
                    "descripcion_habilidades": char_data.get("descripcion_habilidades", ""),
                    "foto_principal": char_data.get("foto_principal") or "/html/img/default-avatar.svg",
                    "galeria": galeria,
                    "created_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
                }
                nuevos_personajes.append(nuevo)
                importados += 1
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error parseando el archivo JSON: {str(e)}")
            
    # 2. Carga masiva desde CSV
    elif filename.endswith('.csv'):
        try:
            content_str = contents.decode('utf-8')
        except UnicodeDecodeError:
            try:
                content_str = contents.decode('latin-1')
            except Exception:
                raise HTTPException(status_code=400, detail="No se pudo decodificar el CSV. Utiliza UTF-8.")
                
        csv_file = io.StringIO(content_str)
        first_line = csv_file.readline()
        delimiter = ';' if ';' in first_line else ','
        csv_file.seek(0)
        
        reader = csv.reader(csv_file, delimiter=delimiter)
        try:
            cabeceras = next(reader)
        except StopIteration:
            raise HTTPException(status_code=400, detail="El archivo CSV está vacío.")
            
        # Limpieza de cabeceras
        cabeceras_clean = [c.strip().lower().replace("_", "") for c in cabeceras]
        
        # Buscar mapeos de columnas
        col_map = {}
        for idx, h in enumerate(cabeceras_clean):
            if h in ["nombre", "name"]: col_map["nombre"] = idx
            elif h in ["apodo", "nickname"]: col_map["apodo"] = idx
            elif h in ["campana", "campaign"]: col_map["campana"] = idx
            elif h in ["clases", "classes"]: col_map["clases"] = idx
            elif h in ["descripcionhabilidades", "descripcion", "skills"]: col_map["descripcion"] = idx
            elif h in ["fotoprincipal", "avatar"]: col_map["foto_principal"] = idx
            elif h in ["galeria", "gallery"]: col_map["galeria"] = idx
            
        # Campos requeridos mínimos
        if "nombre" not in col_map or "campana" not in col_map:
            raise HTTPException(status_code=400, detail="El CSV debe tener al menos las columnas 'Nombre' y 'Campana'.")
            
        for row in reader:
            if not row or len(row) <= max(col_map.values()):
                continue
                
            nombre = row[col_map["nombre"]].strip()
            campana = row[col_map["campana"]].strip()
            
            if not nombre or not campana:
                continue
                
            apodo = row[col_map["apodo"]].strip() if "apodo" in col_map else ""
            
            clases_raw = row[col_map["clases"]].strip() if "clases" in col_map else ""
            clases = [c.strip() for c in clases_raw.split(",") if c.strip()]
            
            desc = row[col_map["descripcion"]].strip() if "descripcion" in col_map else ""
            
            foto = row[col_map["foto_principal"]].strip() if "foto_principal" in col_map else ""
            if not foto:
                foto = "/html/img/default-avatar.svg"
                
            galeria_raw = row[col_map["galeria"]].strip() if "galeria" in col_map else ""
            galeria = [g.strip() for g in galeria_raw.split(",") if g.strip()]
            
            nuevo = {
                "id": f"char_{uuid.uuid4().hex[:8]}",
                "user_id": user["id"],
                "nombre": nombre,
                "apodo": apodo,
                "campana": campana,
                "clases": clases,
                "descripcion_habilidades": desc,
                "foto_principal": foto,
                "galeria": galeria,
                "created_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            }
            nuevos_personajes.append(nuevo)
            importados += 1
            
    else:
        raise HTTPException(status_code=400, detail="Formato de archivo no soportado. Usa .csv o .json.")
        
    if nuevos_personajes:
        personajes = read_json_file(CHARACTERS_FILE, [])
        personajes.extend(nuevos_personajes)
        write_json_file(CHARACTERS_FILE, personajes)
        
    return {
        "status": "success", 
        "message": f"Se han importado exitosamente {importados} nuevos personajes a tus crónicas.",
        "count": importados
    }

# --- SERVIDOR DE IMÁGENES TEMPORALES (SOLO PARA VERCEL) ---
@app.get("/html/img/uploads/avatars/{filename}")
async def get_uploaded_avatar(filename: str):
    file_path = os.path.join(AVATARS_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    fallback_path = os.path.join(BASE_DIR, "html", "img", "uploads", "avatars", filename)
    if os.path.exists(fallback_path):
        return FileResponse(fallback_path)
    raise HTTPException(status_code=404, detail="Imagen no encontrada")

@app.get("/html/img/uploads/galleries/{filename}")
async def get_uploaded_gallery(filename: str):
    file_path = os.path.join(GALLERIES_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    fallback_path = os.path.join(BASE_DIR, "html", "img", "uploads", "galleries", filename)
    if os.path.exists(fallback_path):
        return FileResponse(fallback_path)
    raise HTTPException(status_code=404, detail="Imagen no encontrada")

# --- SERVIDOR DE ARCHIVOS ESTÁTICOS ---
HTML_DIR = os.path.join(BASE_DIR, "html")
app.mount("/html", StaticFiles(directory=HTML_DIR), name="html")

@app.get("/")
async def root():
    return RedirectResponse(url="/html/index.html")

if __name__ == "__main__":
    import uvicorn
    print("\n Iniciando el Portal del Gremio de Héroes D&D...")
    ssl_key = os.path.join(BASE_DIR, "key.pem")
    ssl_cert = os.path.join(BASE_DIR, "cert.pem")
    if os.path.exists(ssl_key) and os.path.exists(ssl_cert):
        print("Accede en: https://127.0.0.1:8081 (Conexion Segura HTTPS)\n")
        uvicorn.run(
            "server:app",
            host="127.0.0.1",
            port=8081,
            reload=True,
            ssl_keyfile=ssl_key,
            ssl_certfile=ssl_cert
        )
    else:
        print("Accede en: http://127.0.0.1:8081 (Conexion Estandar HTTP)\n")
        uvicorn.run(
            "server:app",
            host="127.0.0.1",
            port=8081,
            reload=True
        )
