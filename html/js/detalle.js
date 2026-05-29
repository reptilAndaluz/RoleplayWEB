// --- CHARACTER INDIVIDUAL DETAILS CONTROLLER ---

let currentCharacter = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Asegurar sesión activa
  if (!Auth.checkAuthAndSetupUI()) return;

  // Obtener ID del personaje de la URL
  const urlParams = new URLSearchParams(window.location.search);
  const charId = urlParams.get("id");

  if (!charId) {
    Auth.showToast("No se ha especificado ningún héroe para consultar.", "error");
    setTimeout(() => {
      window.location.href = "/html/portal.html";
    }, 1500);
    return;
  }

  // Cargar detalles del personaje
  await loadCharacterDetail(charId);
});

// Cargar Personaje por ID
async function loadCharacterDetail(charId) {
  const container = document.getElementById("detail-card-content");
  
  try {
    const response = await Auth.fetch(`/api/personajes/${charId}`);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("El personaje solicitado no existe en los pergaminos.");
      }
      throw new Error("No tienes autorización para leer este registro.");
    }

    currentCharacter = await response.json();
    renderDetail(currentCharacter);
    setupActionButtons(currentCharacter);
  } catch (e) {
    console.error(e);
    container.innerHTML = `
      <div style="padding: 40px; text-align: center;">
        <span style="font-size: 3rem; opacity: 0.8;">[!]</span>
        <h3 style="font-family: 'Cinzel', serif; color: var(--primary); margin-top: 15px;">Ficha Inaccesible</h3>
        <p style="color: var(--text-muted); margin-top: 8px;">${e.message || "Ha ocurrido una interferencia astral al leer el registro."}</p>
        <a href="/html/portal.html" class="btn btn-secondary" style="margin-top: 20px; display: inline-block;">Volver a las Crónicas</a>
      </div>
    `;
  }
}

// Renderizar contenido en el DOM
function renderDetail(char) {
  const container = document.getElementById("detail-card-content");

  // Crear estructura base con marcadores de posición vacíos o IDs locales
  container.innerHTML = `
    <div class="detail-layout-grid">
      
      <!-- Columna Izquierda: Retrato y Campaña -->
      <div class="detail-avatar-container">
        <img id="detail-main-avatar" class="detail-big-avatar" alt="">
        <span class="char-campaign-badge" style="position: static; font-size: 0.85rem; padding: 6px 14px;"></span>
        <div class="char-classes-detail" style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 5px;"></div>
      </div>

      <!-- Columna Derecha: Historia e Ilustraciones -->
      <div class="detail-info-container">
        <h2 class="char-name-detail"></h2>
        <p class="detail-apodo-txt char-apodo-detail"></p>
        
        <h4 class="detail-section-header">Crónicas e Habilidades</h4>
        <p class="detail-story-desc char-desc-detail"></p>
        
        <div class="stats-container-detail"></div>
        <div class="gallery-container-detail"></div>
      </div>

    </div>
  `;

  // Asignar de forma 100% segura usando textContent/src/alt
  const mainAvatar = container.querySelector("#detail-main-avatar");
  mainAvatar.src = char.foto_principal || '/html/img/default-avatar.svg';
  mainAvatar.alt = `Retrato de ${char.nombre}`;

  container.querySelector(".char-campaign-badge").textContent = char.campana;
  container.querySelector(".char-name-detail").textContent = char.nombre;
  container.querySelector(".char-apodo-detail").textContent = char.apodo || 'Aventurero sin apodo';
  container.querySelector(".char-desc-detail").textContent = char.descripcion_habilidades;

  // Renderizar clases seguras
  const classesWrapper = container.querySelector(".char-classes-detail");
  if (char.clases && Array.isArray(char.clases)) {
    char.clases.forEach(tag => {
      const badge = document.createElement("span");
      badge.className = "class-badge";
      badge.style.fontSize = "0.85rem";
      badge.style.padding = "4px 12px";
      badge.textContent = tag;
      classesWrapper.appendChild(badge);
    });
  }

  // Renderizar estadísticas seguras
  if (char.stats) {
    const formatMod = (val) => {
      const mod = Math.floor((val - 10) / 2);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    };

    const statsWrapper = container.querySelector(".stats-container-detail");
    statsWrapper.innerHTML = `
      <div style="margin-top: 30px; margin-bottom: 30px;">
        <h4 class="detail-section-header">Atributos del Aventurero</h4>
        <div class="stats-grid-dnd" style="margin-top: 15px;">
          <!-- Fuerza -->
          <div class="stat-shield-box">
            <span class="stat-label-abbr">FUE</span>
            <span class="stat-label-full">Fuerza</span>
            <span class="stat-fue-val" style="font-size: 1.6rem; font-weight: bold; color: var(--text);"></span>
            <span class="stat-fue-mod stat-modifier-badge"></span>
          </div>
          <!-- Destreza -->
          <div class="stat-shield-box">
            <span class="stat-label-abbr">DES</span>
            <span class="stat-label-full">Destreza</span>
            <span class="stat-des-val" style="font-size: 1.6rem; font-weight: bold; color: var(--text);"></span>
            <span class="stat-des-mod stat-modifier-badge"></span>
          </div>
          <!-- Constitución -->
          <div class="stat-shield-box">
            <span class="stat-label-abbr">CON</span>
            <span class="stat-label-full">Constitución</span>
            <span class="stat-con-val" style="font-size: 1.6rem; font-weight: bold; color: var(--text);"></span>
            <span class="stat-con-mod stat-modifier-badge"></span>
          </div>
          <!-- Inteligencia -->
          <div class="stat-shield-box">
            <span class="stat-label-abbr">INT</span>
            <span class="stat-label-full">Inteligencia</span>
            <span class="stat-int-val" style="font-size: 1.6rem; font-weight: bold; color: var(--text);"></span>
            <span class="stat-int-mod stat-modifier-badge"></span>
          </div>
          <!-- Sabiduría -->
          <div class="stat-shield-box">
            <span class="stat-label-abbr">SAB</span>
            <span class="stat-label-full">Sabiduría</span>
            <span class="stat-sab-val" style="font-size: 1.6rem; font-weight: bold; color: var(--text);"></span>
            <span class="stat-sab-mod stat-modifier-badge"></span>
          </div>
          <!-- Carisma -->
          <div class="stat-shield-box">
            <span class="stat-label-abbr">CAR</span>
            <span class="stat-label-full">Carisma</span>
            <span class="stat-car-val" style="font-size: 1.6rem; font-weight: bold; color: var(--text);"></span>
            <span class="stat-car-mod stat-modifier-badge"></span>
          </div>
        </div>
      </div>
    `;

    statsWrapper.querySelector(".stat-fue-val").textContent = char.stats.fue || 10;
    statsWrapper.querySelector(".stat-fue-mod").textContent = formatMod(char.stats.fue || 10);
    statsWrapper.querySelector(".stat-des-val").textContent = char.stats.des || 10;
    statsWrapper.querySelector(".stat-des-mod").textContent = formatMod(char.stats.des || 10);
    statsWrapper.querySelector(".stat-con-val").textContent = char.stats.con || 10;
    statsWrapper.querySelector(".stat-con-mod").textContent = formatMod(char.stats.con || 10);
    statsWrapper.querySelector(".stat-int-val").textContent = char.stats.int || 10;
    statsWrapper.querySelector(".stat-int-mod").textContent = formatMod(char.stats.int || 10);
    statsWrapper.querySelector(".stat-sab-val").textContent = char.stats.sab || 10;
    statsWrapper.querySelector(".stat-sab-mod").textContent = formatMod(char.stats.sab || 10);
    statsWrapper.querySelector(".stat-car-val").textContent = char.stats.car || 10;
    statsWrapper.querySelector(".stat-car-mod").textContent = formatMod(char.stats.car || 10);
  }

  // Renderizar galería segura
  if (char.galeria && char.galeria.length > 0) {
    const galleryWrapper = container.querySelector(".gallery-container-detail");
    galleryWrapper.innerHTML = `
      <div style="margin-top: 35px;">
        <h4 class="detail-section-header">Galería de Hazañas</h4>
        <div class="modal-gallery-grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 15px; margin-top: 15px;">
        </div>
      </div>
    `;

    const grid = galleryWrapper.querySelector(".modal-gallery-grid");
    char.galeria.forEach(imgUrl => {
      const thumbContainer = document.createElement("div");
      thumbContainer.className = "gallery-thumbnail-container";
      thumbContainer.style.height = "110px";
      thumbContainer.addEventListener("click", () => {
        zoomGalleryImage(imgUrl);
      });

      const img = document.createElement("img");
      img.src = imgUrl;
      img.className = "gallery-thumb";
      img.alt = "Ilustración secundaria";

      thumbContainer.appendChild(img);
      grid.appendChild(thumbContainer);
    });
  }
}

// Zoom interactivo de imágenes de la galería en el contenedor del avatar
window.zoomGalleryImage = function(imgUrl) {
  const mainAvatar = document.getElementById("detail-main-avatar");
  if (mainAvatar) {
    mainAvatar.src = imgUrl;
    mainAvatar.style.borderColor = "var(--primary)";
    Auth.showToast("Visualizando ilustración ampliada del héroe.", "success");
  }
};

// Configurar botones superiores de edición y eliminación si corresponde
function setupActionButtons(char) {
  const actionsGroup = document.getElementById("detail-actions-group");
  actionsGroup.innerHTML = "";

  const currentUser = Auth.getUserInfo();
  
  // El propietario y los administradores pueden editar o eliminar fichas
  const isOwner = currentUser && currentUser.username === char.creado_por;
  const isAdmin = Auth.isAdmin();

  if (isOwner || isAdmin) {
    // Botón de Edición
    const editBtn = document.createElement("button");
    editBtn.className = "btn";
    editBtn.style.padding = "8px 16px";
    editBtn.style.fontSize = "0.85rem";
    editBtn.innerText = "Editar Registro";
    editBtn.addEventListener("click", () => {
      window.location.href = `/html/crearEntrada.html?id=${char.id}`;
    });

    // Botón de Eliminación
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.style.padding = "8px 16px";
    deleteBtn.style.fontSize = "0.85rem";
    deleteBtn.innerText = "Abolir Ficha";
    deleteBtn.addEventListener("click", () => confirmDeleteCharacter(char.id, char.nombre));

    actionsGroup.appendChild(editBtn);
    actionsGroup.appendChild(deleteBtn);
  }
}

// Borrar Personaje y Redirigir al Portal
async function confirmDeleteCharacter(charId, charName) {
  const confirmation = confirm(`¿Estás seguro de que deseas borrar a ${charName} de las crónicas del gremio? Esta acción es completamente irreversible.`);
  if (!confirmation) return;

  try {
    const response = await Auth.fetch(`/api/personajes/${charId}`, {
      method: "DELETE"
    });

    if (!response.ok) throw new Error("No se pudo borrar");

    Auth.showToast(`El personaje ${charName} ha sido desvanecido del gremio.`, "success");
    setTimeout(() => {
      window.location.href = "/html/portal.html";
    }, 1200);
  } catch (e) {
    Auth.showToast("Error al disolver la ficha del personaje.", "error");
  }
}
