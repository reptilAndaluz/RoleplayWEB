#!/bin/bash

# --- COLOR DEFINITIONS ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0;35m' # No Color
CYAN='\033[0;36m'
BOLD='\033[1m'

echo -e "${MAGENTA}${BOLD}🔮 INICIANDO CONFIGURACIÓN MÍSTICA DE GIT & GITHUB 🔮${NC}\n"

# 1. Verificar si git está instalado
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Error: Git no está instalado en este plano físico. Instálalo e inténtalo de nuevo.${NC}"
    exit 1
fi

# 2. Inicializar repositorio si no existe
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}📦 Inicializando nuevo repositorio Git...${NC}"
    git init
    git branch -M main
    echo -e "${GREEN}✅ Repositorio Git inicializado con éxito en la rama 'main'.${NC}"
else
    echo -e "${GREEN}✅ Ya existe un repositorio Git activo.${NC}"
fi

# 3. Configurar usuario local si no está configurado globalmente
USER_NAME=$(git config user.name)
USER_EMAIL=$(git config user.email)

if [ -z "$USER_NAME" ] || [ -z "$USER_EMAIL" ]; then
    echo -e "${YELLOW}📝 Configurando credenciales locales de Git...${NC}"
    read -p "Ingresa tu Nombre / Alias para los commits: " git_name
    read -p "Ingresa tu Email de GitHub: " git_email
    git config user.name "$git_name"
    git config user.email "$git_email"
    echo -e "${GREEN}✅ Configuración local guardada: $git_name <$git_email>${NC}"
fi

# 4. Preguntar por la URL de GitHub
echo -e "\n${CYAN}🔗 Vinculación con GitHub:${NC}"
read -p "Ingresa la URL de tu repositorio de GitHub (ej. https://github.com/tu-usuario/nombre-repo.git): " GITHUB_URL

if [ -n "$GITHUB_URL" ]; then
    # Remover remote existente si lo hay
    git remote remove origin 2>/dev/null
    git remote add origin "$GITHUB_URL"
    echo -e "${GREEN}✅ Repositorio remoto 'origin' apuntando a: $GITHUB_URL${NC}"
else
    echo -e "${YELLOW}⚠️ No ingresaste ninguna URL. Se omitirá la vinculación remota por ahora.${NC}"
fi

# 5. Crear el primer commit formal
echo -e "\n${YELLOW}💾 Preparando archivos para el primer commit...${NC}"
git add .

# Hacer commit formal siguiendo Conventional Commits
COMMIT_MSG="feat: implement D&D character sheets portal with dynamic stats, auth roles, and modular themes"

echo -e "${BLUE}📝 Creando commit con formato formal de buenas prácticas...${NC}"
git commit -m "$COMMIT_MSG"

echo -e "\n${GREEN}🎉 ¡Archivos sellados y guardados en tu historial local con éxito!${NC}"
echo -e "${BOLD}Mensaje de commit:${NC} ${CYAN}$COMMIT_MSG${NC}\n"

# 6. Push a GitHub
if [ -n "$GITHUB_URL" ]; then
    echo -e "${YELLOW}🚀 Subiendo tus crónicas a GitHub (main)...${NC}"
    echo -e "${CYAN}Nota: Si es necesario, se te solicitará tu token de acceso personal de GitHub.${NC}"
    git push -u origin main
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}${BOLD}✨ ¡Proyecto conectado y subido con éxito a GitHub! ✨${NC}"
    else
        echo -e "${RED}❌ Ocurrió un error al subir los archivos. Verifica tu conexión o token de acceso.${NC}"
    fi
else
    echo -e "${BLUE}💡 Para subir tus cambios a GitHub en el futuro, ejecuta:${NC}"
    echo -e "${BOLD}   git push -u origin main${NC}"
fi

exit 0
