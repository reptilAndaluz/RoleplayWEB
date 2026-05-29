// --- PORTAL CONTROLLER ---

let charactersData = []; // Caché local de personajes del aventurero

// Helper para descargas seguras con token JWT
async function downloadFileSecure(url, defaultFilename) {
  try {
    const response = await Auth.fetch(url);
    if (!response.ok) throw new Error("Error en la descarga");
    
    // Obtener el nombre del archivo de las cabeceras Content-Disposition si está disponible
    let filename = defaultFilename;
    const disposition = response.headers.get('Content-Disposition');
    if (disposition && disposition.indexOf('attachment') !== -1) {
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
      const matches = filenameRegex.exec(disposition);
      if (matches != null && matches[1]) { 
        filename = matches[1].replace(/['"]/g, '');
      }
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
    
    Auth.showToast("Copia de seguridad transferida con éxito.", "success");
  } catch (e) {
    console.error("Error al descargar el archivo:", e);
    Auth.showToast("Fallo al descargar el archivo de las crónicas.", "error");
  }
}

// Iniciar Dashboard
document.addEventListener("DOMContentLoaded", async () => {
  // Asegurar sesión activa
  if (!Auth.checkAuthAndSetupUI()) return;

  const userInfo = Auth.getUserInfo();
  if (userInfo) {
    document.getElementById("welcome-message").innerText = `¡Saludos, ${userInfo.username}!`;
  }

  // Cargar personajes iniciales
  await loadCharacters();

  // Configurar Filtros Dinámicos
  setupFilters();

  // Configurar Respaldos (Exportaciones)
  document.getElementById("export-json-btn").addEventListener("click", () => {
    downloadFileSecure("/api/personajes/export/json", "backup_personajes.json");
  });
  
  document.getElementById("export-csv-btn").addEventListener("click", () => {
    downloadFileSecure("/api/personajes/export/csv", "backup_personajes.csv");
  });
  
  document.getElementById("download-template-btn").addEventListener("click", () => {
    downloadFileSecure("/api/personajes/template/csv", "plantilla_carga_masiva.csv");
  });

  // Configurar Arrastre de Carga Masiva
  const fileDropArea = document.getElementById("file-drop-area");
  const fileInput = document.getElementById("import-file-input");

  fileDropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    fileDropArea.classList.add("dragover");
  });

  fileDropArea.addEventListener("dragleave", () => {
    fileDropArea.classList.remove("dragover");
  });

  fileDropArea.addEventListener("drop", (e) => {
    e.preventDefault();
    fileDropArea.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      updateDropText(e.dataTransfer.files[0].name);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      updateDropText(fileInput.files[0].name);
    }
  });

  function updateDropText(name) {
    fileDropArea.querySelector(".file-drop-text").innerHTML = `Archivo seleccionado: <strong>${name}</strong>`;
  }

  // Procesar Invocación Masiva
  const importForm = document.getElementById("import-form");
  importForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("file", file);

    try {
      Auth.showToast("Invocando personajes de forma masiva...", "success");
      const response = await Auth.fetch("/api/personajes/import", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error importando");
      }

      const result = await response.json();
      Auth.showToast(result.message, "success");
      
      // Limpiar Formulario e importar
      importForm.reset();
      fileDropArea.querySelector(".file-drop-text").innerText = "Arrastra aquí tu archivo CSV o JSON, o haz clic para seleccionarlo";
      
      // Recargar Grid
      await loadCharacters();
    } catch (err) {
      Auth.showToast(`Error al procesar la carga masiva: ${err.message}`, "error");
    }
  });

  // Configurar Cierre de Modal Lightbox (si aún existe)
  const modalCloseBtn = document.getElementById("modal-close-btn");
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
  
  const modal = document.getElementById("character-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }
});

// Cargar Personajes
async function loadCharacters() {
  const grid = document.getElementById("character-grid");
  
  try {
    const response = await Auth.fetch("/api/personajes");
    if (!response.ok) throw new Error("Fallo en red");
    
    charactersData = await response.json();
    renderGrid(charactersData);
    populateDropdownFilters();
  } catch (e) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3>No se pudo acceder a las Crónicas</h3>
        <p>Ha ocurrido una interferencia astral al leer el archivo. Reinténtalo más tarde.</p>
      </div>
    `;
  }
}

// Renderizar Personajes en Grid
function renderGrid(characters) {
  const grid = document.getElementById("character-grid");
  grid.innerHTML = "";

  if (characters.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🐉</div>
        <h3>El archivo está desierto</h3>
        <p>Aún no hay ningún héroe registrado en este plano. ¡Invoca al primero!</p>
      </div>
    `;
    return;
  }

  characters.forEach(c => {
    const card = document.createElement("div");
    card.className = "card-glass char-card";
    
    card.innerHTML = `
      <div class="char-card-header">
        <img class="char-avatar-bg" alt="Avatar difuminado">
        <img class="char-avatar" alt="">
        <span class="char-campaign-badge"></span>
      </div>
      <div class="char-card-body">
        <h3 class="char-name"></h3>
        <p class="char-apodo"></p>
        <div class="char-classes"></div>
        <p class="char-desc"></p>
      </div>
      <div class="char-card-footer">
        <button class="btn btn-view" style="font-size: 0.75rem; padding: 8px 12px;">Ver Ficha</button>
        <button class="btn btn-secondary btn-edit" style="font-size: 0.75rem; padding: 8px 12px; border-color: rgba(255,255,255,0.2);">📝</button>
        <button class="btn btn-danger btn-delete" style="font-size: 0.75rem; padding: 8px 12px;">❌</button>
      </div>
    `;

    // Asignar datos de forma 100% segura usando textContent/src
    const avatarUrl = c.foto_principal || '/html/img/default-avatar.svg';
    card.querySelector(".char-avatar-bg").src = avatarUrl;
    
    const avatarImg = card.querySelector(".char-avatar");
    avatarImg.src = avatarUrl;
    avatarImg.alt = `Avatar de ${c.nombre}`;

    card.querySelector(".char-campaign-badge").textContent = c.campana;
    card.querySelector(".char-name").textContent = c.nombre;
    card.querySelector(".char-apodo").textContent = c.apodo || 'Aventurero Solitario';
    card.querySelector(".char-desc").textContent = c.descripcion_habilidades;

    // Crear insignias de clases seguras
    const classesWrapper = card.querySelector(".char-classes");
    if (c.clases && Array.isArray(c.clases)) {
      c.clases.forEach(tag => {
        const badge = document.createElement("span");
        badge.className = "class-badge";
        badge.textContent = tag;
        classesWrapper.appendChild(badge);
      });
    }

    // Asignar eventos de botones
    card.querySelector(".btn-view").addEventListener("click", () => {
      window.location.href = `/html/detalle.html?id=${c.id}`;
    });
    card.querySelector(".btn-edit").addEventListener("click", () => {
      window.location.href = `/html/crearEntrada.html?id=${c.id}`;
    });
    card.querySelector(".btn-delete").addEventListener("click", () => confirmDeleteCharacter(c.id, c.nombre));

    grid.appendChild(card);
  });
}

// Configurar Inputs de Búsqueda y Filtros
function setupFilters() {
  const searchInput = document.getElementById("search-input");
  const campaignFilter = document.getElementById("filter-campaign");
  const classFilter = document.getElementById("filter-class");

  const runFilters = () => {
    const query = searchInput.value.toLowerCase().trim();
    const campaignVal = campaignFilter.value;
    const classVal = classFilter.value;

    const filtered = charactersData.filter(c => {
      // 1. Filtrado por Búsqueda textual
      const matchesSearch = !query || 
        c.nombre.toLowerCase().includes(query) || 
        c.apodo.toLowerCase().includes(query) || 
        c.descripcion_habilidades.toLowerCase().includes(query);

      // 2. Filtrado por Campaña
      const matchesCampaign = !campaignVal || c.campana === campaignVal;

      // 3. Filtrado por Clase
      const matchesClass = !classVal || c.clases.includes(classVal);

      return matchesSearch && matchesCampaign && matchesClass;
    });

    renderGrid(filtered);
  };

  searchInput.addEventListener("input", runFilters);
  campaignFilter.addEventListener("change", runFilters);
  classFilter.addEventListener("change", runFilters);
}

// Rellenar dinámicamente opciones de filtros
function populateDropdownFilters() {
  const campaignFilter = document.getElementById("filter-campaign");
  const classFilter = document.getElementById("filter-class");
  
  // Guardar valores seleccionados previamente
  const prevCamp = campaignFilter.value;
  const prevClass = classFilter.value;

  // Extraer campañas y clases sin duplicar
  const campañas = new Set();
  const clases = new Set();

  charactersData.forEach(c => {
    if (c.campana) campañas.add(c.campana);
    if (c.clases) c.clases.forEach(tag => clases.add(tag));
  });

  // Limpiar
  campaignFilter.innerHTML = '<option value="">Todas las Campañas</option>';
  classFilter.innerHTML = '<option value="">Todas las Clases</option>';

  // Rellenar campañas
  [...campañas].sort().forEach(camp => {
    const opt = document.createElement("option");
    opt.value = camp;
    opt.textContent = camp;
    campaignFilter.appendChild(opt);
  });

  // Rellenar clases
  [...clases].sort().forEach(tag => {
    const opt = document.createElement("option");
    opt.value = tag;
    opt.textContent = tag;
    classFilter.appendChild(opt);
  });

  // Restaurar selecciones previas si aún existen
  if (campañas.has(prevCamp)) campaignFilter.value = prevCamp;
  if (clases.has(prevClass)) classFilter.value = prevClass;
}

function closeModal() {
  const modal = document.getElementById("character-modal");
  if (modal) modal.classList.remove("show");
}

// Borrar Personaje
async function confirmDeleteCharacter(charId, charName) {
  const confirmation = confirm(`¿Estás seguro de que deseas borrar a ${charName} de las crónicas del gremio? Esta acción es irreversible.`);
  if (!confirmation) return;

  try {
    const response = await Auth.fetch(`/api/personajes/${charId}`, {
      method: "DELETE"
    });

    if (!response.ok) throw new Error("No se pudo borrar");

    Auth.showToast(`El personaje ${charName} ha sido desvanecido del gremio.`, "success");
    await loadCharacters();
  } catch (e) {
    Auth.showToast("Error al disolver la ficha del personaje.", "error");
  }
}
