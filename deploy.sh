#!/usr/bin/env bash

# =========================================================================
# SCRIPT DE DESPLIEGUE AUTOMATIZADO PARA EL CATÁLOGO D&D EN DEBIAN
# Uso: 
#   chmod +x deploy.sh
#   ./deploy.sh docker    <- Despliegue con Docker (Recomendado)
#   ./deploy.sh native    <- Despliegue Nativo con Systemd
# =========================================================================

# Colores místicos para la consola
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # Sin color
BOLD='\033[1m'

echo -e "${BLUE}${BOLD}================================================================${NC}"
echo -e "${BLUE}${BOLD}      DESPLIEGUE MÍSTICO DEL GREMIO DE HÉROES D&D               ${NC}"
echo -e "${BLUE}${BOLD}================================================================${NC}"

# Detectar el modo de despliegue
MODE=$1
if [ -z "$MODE" ]; then
    echo -e "${BOLD}¿Qué senda de despliegue deseas recorrer?${NC}"
    echo -e " 1) 🐋 Senda de Docker & Docker Compose (Aislado y Limpio)"
    echo -e " 2) ⚙️  Senda de Systemd Nativo (Servicio Debian clásico)"
    read -rp "Selecciona una opción (1 o 2): " CHOICE
    case $CHOICE in
        1) MODE="docker" ;;
        2) MODE="native" ;;
        *) echo -e "${RED}Opción inválida. Abortando misión.${NC}"; exit 1 ;;
    esac
fi

echo -e "\n${BLUE}Iniciando ritual de actualización desde Git...${NC}"
git pull origin main

if [ "$MODE" = "docker" ]; then
    echo -e "\n${GREEN}🐋 DESPLEGANDO CON DOCKER & DOCKER COMPOSE${NC}"
    
    # Verificar si docker está instalado
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker no está instalado en este servidor Debian.${NC}"
        exit 1
    fi

    echo -e "${BLUE}Reconstruyendo imágenes y levantando contenedores...${NC}"
    docker compose down
    docker compose up -d --build

    echo -e "\n${GREEN}¡Contenedores desplegados correctamente!${NC}"
    docker compose ps

elif [ "$MODE" = "native" ]; then
    echo -e "\n${GREEN}⚙️ DESPLEGANDO MODO NATIVO DEBIAN (SYSTEMD)${NC}"

    # Verificar si el entorno virtual existe
    if [ ! -d "venv" ]; then
        echo -e "${BLUE}Creando entorno virtual de Python por primera vez...${NC}"
        python3 -m venv venv
    fi

    echo -e "${BLUE}Actualizando pergaminos (dependencias pip)...${NC}"
    ./venv/bin/pip install --upgrade pip
    ./venv/bin/pip install -r requirements.txt

    echo -e "${BLUE} Reiniciando el servicio systemd gremio-heroes...${NC}"
    sudo systemctl daemon-reload
    sudo systemctl restart gremio-heroes.service

    echo -e "\n${GREEN}¡Servicio de systemd reiniciado!${NC}"
    sudo systemctl status gremio-heroes.service --no-pager -l
else
    echo -e "${RED}Modo desconocido. Usa 'docker' o 'native'.${NC}"
    exit 1
fi

echo -e "\n${GREEN}${BOLD}================================================================${NC}"
echo -e "${GREEN}${BOLD}¡El Portal del Gremio ha sido actualizado y está en pie! ${NC}"
echo -e "${GREEN}${BOLD}================================================================${NC}"
