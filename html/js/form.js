// --- CHARACTER FORM CONTROLLER ---

let clasesList = [];      // Lista local de etiquetas de clases
let avatarUrl = "";       // URL de la foto principal en el servidor
let galleryUrls = [];     // URLs de la galería en el servidor
let editingCharId = null; // ID del personaje que se está editando (si existe)

// Helper para calcular y actualizar modificadores D&D en tiempo real
window.updateDndModifier = function(statName) {
  const input = document.getElementById(`stat-${statName}`);
  const badge = document.getElementById(`mod-${statName}`);
  if (!input || !badge) return;

  let val = parseInt(input.value) || 10;
  if (val < 1) val = 1;
  if (val > 30) val = 30;
  input.value = val;

  const mod = Math.floor((val - 10) / 2);
  const sign = mod >= 0 ? "+" : "";
  badge.innerText = `${sign}${mod}`;
};

document.addEventListener("DOMContentLoaded", async () => {
  // Asegurar sesión activa
  if (!Auth.checkAuthAndSetupUI()) return;

  // Inicializar modificadores de atributos por defecto
  ["fue", "des", "con", "int", "sab", "car"].forEach(stat => {
    updateDndModifier(stat);
  });

  // Cargar campañas autocompletadas en el datalist
  await populateCampaignsDatalist();

  // Configurar Entrada Interactiva de Etiquetas
  setupTagsInput();

  // Configurar Subida de Avatar en Segundo Plano
  setupAvatarUpload();

  // Configurar Subida de Galería en Segundo Plano
  setupGalleryUpload();

  // Detectar Modo Edición
  const urlParams = new URLSearchParams(window.location.search);
  editingCharId = urlParams.get("id");
  if (editingCharId) {
    await prepareEditMode(editingCharId);
  }

  // Procesar Guardado
  const form = document.getElementById("character-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveCharacter();
  });
});

// Autocompletar datalist de campañas existentes
async function populateCampaignsDatalist() {
  const datalist = document.getElementById("campaigns-datalist");
  try {
    const response = await Auth.fetch("/api/personajes");
    if (!response.ok) return;

    const personajes = await response.json();
    const campañas = new Set(personajes.map(p => p.campana).filter(Boolean));
    
    datalist.innerHTML = "";
    campañas.forEach(camp => {
      datalist.innerHTML += `<option value="${camp}">`;
    });
  } catch (e) {
    console.error("Error al rellenar datalist de campañas:", e);
  }
}

// Configurar Input de Etiquetas Interactivas
function setupTagsInput() {
  const wrapper = document.getElementById("tags-input-wrapper");
  const textInput = document.getElementById("tags-text-input");

  const addTag = (text) => {
    const cleanTag = text.trim();
    if (!cleanTag) return;

    // Evitar duplicados
    if (clasesList.includes(cleanTag)) {
      textInput.value = "";
      return;
    }

    clasesList.push(cleanTag);

    // Crear elemento Badge
    const badge = document.createElement("span");
    badge.className = "tag-badge";
    badge.innerHTML = `
      ${cleanTag}
      <span class="tag-badge-remove">&times;</span>
    `;

    // Evento para quitar etiqueta
    badge.querySelector(".tag-badge-remove").addEventListener("click", () => {
      clasesList = clasesList.filter(t => t !== cleanTag);
      badge.remove();
    });

    // Insertar antes del input de texto
    wrapper.insertBefore(badge, textInput);
    textInput.value = "";
  };

  // Escuchar teclas Enter y Coma
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(textInput.value);
    }
  });

  // Escuchar pérdida de foco
  textInput.addEventListener("blur", () => {
    addTag(textInput.value);
  });

  // Enfocar input al pulsar en cualquier parte del recuadro
  wrapper.addEventListener("click", (e) => {
    if (e.target === wrapper) {
      textInput.focus();
    }
  });
}

// Configurar Subida de Avatar
function setupAvatarUpload() {
  const fileInput = document.getElementById("avatar-file-input");
  const previewImg = document.getElementById("avatar-preview");

  fileInput.addEventListener("change", async () => {
    if (fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("file", file);

    try {
      Auth.showToast("Retratando a tu héroe...", "success");
      const response = await Auth.fetch("/api/upload/avatar", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Fallo al subir avatar");
      }

      const result = await response.json();
      avatarUrl = result.url;
      previewImg.src = avatarUrl;
      Auth.showToast("Retrato plasmado correctamente.", "success");
    } catch (e) {
      console.error(e);
      Auth.showToast(`Error al subir retrato: ${e.message}`, "error");
    }
  });
}

// Configurar Subida de Galería
function setupGalleryUpload() {
  const fileInput = document.getElementById("gallery-file-input");
  const previewGrid = document.getElementById("gallery-preview-grid");

  fileInput.addEventListener("change", async () => {
    if (fileInput.files.length === 0) return;

    Auth.showToast("Subiendo ilustraciones a la galería...", "success");

    for (let i = 0; i < fileInput.files.length; i++) {
      const file = fileInput.files[i];
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await Auth.fetch("/api/upload/gallery", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Fallo al subir archivo");
        }

        const result = await response.json();
        const url = result.url;
        
        galleryUrls.push(url);
        addGalleryThumbnailToDOM(url);
      } catch (e) {
        console.error(e);
        Auth.showToast(`Error al subir imagen de galería: ${e.message}`, "error");
      }
    }
    
    Auth.showToast("Ilustraciones de galería sincronizadas.", "success");
    fileInput.value = ""; // Limpiar input
  });
}

// Agregar miniatura de galería al DOM con botón eliminar
function addGalleryThumbnailToDOM(url) {
  const previewGrid = document.getElementById("gallery-preview-grid");
  const trigger = previewGrid.querySelector(".gallery-upload-trigger");

  const thumbItem = document.createElement("div");
  thumbItem.className = "gallery-preview-item";
  thumbItem.innerHTML = `
    <img src="${url}" class="gallery-preview-img" alt="Ilustración">
    <span class="gallery-preview-remove">&times;</span>
  `;

  // Evento eliminar miniatura
  thumbItem.querySelector(".gallery-preview-remove").addEventListener("click", () => {
    galleryUrls = galleryUrls.filter(u => u !== url);
    thumbItem.remove();
  });

  // Insertar justo antes del gatillo de subida
  previewGrid.insertBefore(thumbItem, trigger);
}

// Preparar Modo Edición
async function prepareEditMode(charId) {
  try {
    const response = await Auth.fetch(`/api/personajes/${charId}`);
    if (!response.ok) throw new Error("Ficha inaccesible");

    const p = await response.json();

    // 1. Cambiar Textos
    document.getElementById("form-title").innerText = "Modificar Registro de Héroe";
    document.getElementById("submit-btn").innerText = "Sellar Registro";

    // 2. Rellenar Campos Básicos
    document.getElementById("char-nombre").value = p.nombre;
    document.getElementById("char-apodo").value = p.apodo;
    document.getElementById("char-campana").value = p.campana;
    document.getElementById("char-skills").value = p.descripcion_habilidades;

    // 3. Rellenar Avatar
    if (p.foto_principal) {
      avatarUrl = p.foto_principal;
      document.getElementById("avatar-preview").src = avatarUrl;
    }

    // 4. Rellenar Etiquetas de Clases
    if (p.clases && p.clases.length > 0) {
      const wrapper = document.getElementById("tags-input-wrapper");
      const textInput = document.getElementById("tags-text-input");
      
      p.clases.forEach(tag => {
        clasesList.push(tag);
        const badge = document.createElement("span");
        badge.className = "tag-badge";
        badge.innerHTML = `
          ${tag}
          <span class="tag-badge-remove">&times;</span>
        `;
        badge.querySelector(".tag-badge-remove").addEventListener("click", () => {
          clasesList = clasesList.filter(t => t !== tag);
          badge.remove();
        });
        wrapper.insertBefore(badge, textInput);
      });
    }

    // Rellenar Atributos/Estadísticas
    if (p.stats) {
      Object.keys(p.stats).forEach(statName => {
        const input = document.getElementById(`stat-${statName}`);
        if (input) {
          input.value = p.stats[statName];
          updateDndModifier(statName);
        }
      });
    }

    // 5. Rellenar Galería
    if (p.galeria && p.galeria.length > 0) {
      p.galeria.forEach(url => {
        galleryUrls.push(url);
        addGalleryThumbnailToDOM(url);
      });
    }

  } catch (e) {
    console.error(e);
    Auth.showToast("No se ha podido localizar la ficha mágica solicitada.", "error");
    setTimeout(() => {
      window.location.href = "/html/portal.html";
    }, 2000);
  }
}

// Guardar Personaje (Crear o Editar)
async function saveCharacter() {
  const nombre = document.getElementById("char-nombre").value.trim();
  const apodo = document.getElementById("char-apodo").value.trim();
  const campana = document.getElementById("char-campana").value.trim();
  const descripcion = document.getElementById("char-skills").value.trim();

  // Validaciones
  if (!nombre || !campana || !descripcion) {
    Auth.showToast("Faltan campos sagrados requeridos.", "error");
    return;
  }

  const stats = {
    fue: parseInt(document.getElementById("stat-fue").value) || 10,
    des: parseInt(document.getElementById("stat-des").value) || 10,
    con: parseInt(document.getElementById("stat-con").value) || 10,
    int: parseInt(document.getElementById("stat-int").value) || 10,
    sab: parseInt(document.getElementById("stat-sab").value) || 10,
    car: parseInt(document.getElementById("stat-car").value) || 10
  };

  const payload = {
    nombre: nombre,
    apodo: apodo,
    campana: campana,
    clases: clasesList,
    descripcion_habilidades: descripcion,
    foto_principal: avatarUrl || undefined,
    galeria: galleryUrls,
    stats: stats
  };

  const url = editingCharId ? `/api/personajes/${editingCharId}` : "/api/personajes";
  const method = editingCharId ? "PUT" : "POST";

  try {
    Auth.showToast("Inscribiendo cambios en los pergaminos sagrados...", "success");
    const response = await Auth.fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Fallo al guardar personaje");
    }

    Auth.showToast(
      editingCharId 
        ? "¡La ficha mística del héroe ha sido re-sellada!" 
        : "¡Un nuevo héroe ha sido invocado formalmente!", 
      "success"
    );

    setTimeout(() => {
      window.location.href = "/html/portal.html";
    }, 1500);
  } catch (e) {
    console.error(e);
    Auth.showToast(`Error al sellar registro: ${e.message}`, "error");
  }
}
