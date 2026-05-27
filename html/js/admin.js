// --- ADMIN PANEL CONTROLLER ---

let selectedTheme = "dragons_lair"; // Tema seleccionado por defecto
let guildLogoUrl = "";              // URL del emblema/logo personalizado

document.addEventListener("DOMContentLoaded", async () => {
  // Asegurar sesión de Administrador
  if (!Auth.checkAuthAndSetupUI()) return;
  if (!Auth.isAdmin()) {
    Auth.showToast("Acceso denegado. Solo los líderes del gremio pueden cruzar esta puerta.", "error");
    setTimeout(() => {
      window.location.href = "/html/portal.html";
    }, 1500);
    return;
  }

  // Configurar Pestañas (Tab Switcher)
  setupAdminTabs();

  // Configurar Personalización de Apariencia
  await loadBrandingConfig();

  // Configurar Selector de Temas Interactivo
  setupThemeCardsSelector();

  // Configurar Subida de Logo/Emblema
  setupLogoUpload();

  // Configurar Formulario de Guardado de Config
  const brandingForm = document.getElementById("branding-form");
  brandingForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveBrandingConfig();
  });

  // Pestaña de Usuarios: Cargar lista e interactividad
  await loadUsersList();

  // Registrar Aventurero
  const createUserForm = document.getElementById("create-user-form");
  createUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await registerNewUser();
  });
});

// Selector de Pestañas
function setupAdminTabs() {
  const tabs = document.querySelectorAll(".admin-tab-btn");
  const panes = document.querySelectorAll(".tab-pane");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      // Desactivar todos
      tabs.forEach(t => t.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active"));

      // Activar actual
      tab.classList.add("active");
      const targetId = tab.dataset.tab;
      document.getElementById(targetId).classList.add("active");
    });
  });
}

// Cargar Configuración de Branding Actual
async function loadBrandingConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;

    const config = await response.json();

    // Rellenar entradas
    document.getElementById("brand-titulo").value = config.titulo || "";
    document.getElementById("brand-desc").value = config.descripcion || "";

    // Cargar Tema
    if (config.tema) {
      selectedTheme = config.tema;
      selectThemeCardInDOM(selectedTheme);
    }

    // Cargar Logo
    if (config.logo) {
      guildLogoUrl = config.logo;
      updateLogoPreviewInDOM(guildLogoUrl);
    }
  } catch (e) {
    console.error("Error al cargar config de branding:", e);
  }
}

// Configurar Selector de Tarjetas de Temas (Live Preview)
function setupThemeCardsSelector() {
  const cards = document.querySelectorAll(".theme-card-option");

  cards.forEach(card => {
    card.addEventListener("click", () => {
      // Quitar seleccionados
      cards.forEach(c => c.classList.remove("selected"));

      // Seleccionar actual
      card.classList.add("selected");
      selectedTheme = card.dataset.themeValue;

      // ¡VISTA PREVIA EN VIVO DE IMPACTO!
      // Inyectar el tema visual de inmediato al HTML para que el admin lo previsualice en tiempo real
      document.documentElement.setAttribute('data-theme', selectedTheme);
      Auth.showToast(`Previsualizando tema visual místico.`, "success");
    });
  });
}

function selectThemeCardInDOM(themeValue) {
  const cards = document.querySelectorAll(".theme-card-option");
  cards.forEach(card => {
    if (card.dataset.themeValue === themeValue) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  });
}

// Configurar Subida de Logo
function setupLogoUpload() {
  const fileInput = document.getElementById("logo-file-input");
  const clearBtn = document.getElementById("logo-clear-btn");

  fileInput.addEventListener("change", async () => {
    if (fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("file", file);

    try {
      Auth.showToast("Grabando sello sagrado...", "success");
      // Reusamos el endpoint de subida de avatars del backend para el logo
      const response = await Auth.fetch("/api/upload/avatar", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Fallo al subir logo");
      }

      const result = await response.json();
      guildLogoUrl = result.url;
      updateLogoPreviewInDOM(guildLogoUrl);
      
      Auth.showToast("Sello de gremio plasmado con éxito. Recuerda guardar cambios.", "success");
    } catch (e) {
      console.error(e);
      Auth.showToast(`Error al subir logo: ${e.message}`, "error");
    }
  });

  clearBtn.addEventListener("click", () => {
    guildLogoUrl = "";
    updateLogoPreviewInDOM("");
    Auth.showToast("Sello por defecto restituido. Recuerda guardar cambios.", "success");
  });
}

function updateLogoPreviewInDOM(url) {
  const container = document.getElementById("logo-preview-container");
  const clearBtn = document.getElementById("logo-clear-btn");

  if (url) {
    container.innerHTML = `<img src="${url}" style="width: 100%; height: 100%; object-fit: contain;" alt="Logo Preview">`;
    clearBtn.style.display = "block";
  } else {
    container.innerHTML = `<span style="font-size: 1.5rem;">🔮</span>`;
    clearBtn.style.display = "none";
  }
}

// Guardar Configuración de Branding
async function saveBrandingConfig() {
  const titulo = document.getElementById("brand-titulo").value.trim();
  const descripcion = document.getElementById("brand-desc").value.trim();

  if (!titulo || !descripcion) {
    Auth.showToast("Todos los campos de branding son obligatorios.", "error");
    return;
  }

  const payload = {
    titulo: titulo,
    descripcion: descripcion,
    tema: selectedTheme,
    logo: guildLogoUrl
  };

  try {
    Auth.showToast("Inscribiendo configuración en el archivo místico...", "success");
    const response = await Auth.fetch("/api/admin/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Fallo de red");

    Auth.showToast("¡Configuración grabada y sellada para todos los jugadores!", "success");
    
    // Recargar componentes estéticos de la cabecera en tiempo real
    ThemeManager.applyConfig();
  } catch (e) {
    Auth.showToast("Error al guardar la configuración del branding.", "error");
  }
}

// Cargar Lista de Aventureros
async function loadUsersList() {
  const container = document.getElementById("users-list-container");

  try {
    const response = await Auth.fetch("/api/admin/usuarios");
    if (!response.ok) throw new Error("Fallo");

    const users = await response.json();
    container.innerHTML = "";

    if (users.length === 0) {
      container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-muted);">El gremio está completamente desierto.</div>`;
      return;
    }

    const currentAdminInfo = Auth.getUserInfo();

    users.forEach(u => {
      const row = document.createElement("div");
      row.className = "user-item-row";
      
      const isSelf = currentAdminInfo && currentAdminInfo.username === u.username;
      
      let actionsHtml = "";
      if (isSelf) {
        actionsHtml = `
          <span class="user-item-role-badge role-admin">Administrador</span>
          <span style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; margin-left: 10px;">Tú (Activo)</span>
        `;
      } else {
        actionsHtml = `
          <select class="form-control" style="width: auto; padding: 4px 8px; font-size: 0.75rem; height: auto; display: inline-block; margin-right: 10px; cursor: pointer; background: rgba(0,0,0,0.3); border-color: var(--surface-border); color: var(--text);" onchange="changeUserRole('${u.id}', this.value, '${u.username}')">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>Aventurero</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
          <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.75rem;" onclick="confirmDeleteUser('${u.id}', '${u.username}')">Abolir</button>
        `;
      }

      row.innerHTML = `
        <div class="user-item-info">
          <span class="user-item-name">${u.username}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${actionsHtml}
        </div>
      `;

      container.appendChild(row);
    });
  } catch (e) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: #f56565;">Fallo al convocar la lista de aventureros.</div>`;
  }
}

// Registrar Aventurero
async function registerNewUser() {
  const usernameInput = document.getElementById("new-username");
  const passwordInput = document.getElementById("new-password");
  const roleSelect = document.getElementById("new-role");

  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const role = roleSelect.value;

  if (!username || !password) {
    Auth.showToast("Completa los campos sagrados para alistar al aventurero.", "error");
    return;
  }

  const payload = {
    username: username,
    password: password,
    role: role
  };

  try {
    Auth.showToast("Inscribiendo nuevo héroe en los libros del gremio...", "success");
    const response = await Auth.fetch("/api/admin/usuarios", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Error en registro");
    }

    Auth.showToast(`El aventurero ${username} ha sido alistado con éxito.`, "success");
    
    // Limpiar campos y recargar
    usernameInput.value = "";
    passwordInput.value = "";
    roleSelect.value = "user";
    
    await loadUsersList();
  } catch (e) {
    console.error(e);
    Auth.showToast(`Fallo al alistar: ${e.message}`, "error");
  }
}

// Confirmar abolir Aventurero
window.confirmDeleteUser = async function(userId, username) {
  const confirmation = confirm(`¿Estás seguro de que deseas abolir a ${username} del gremio? Esto eliminará su cuenta y TODAS sus fichas de personaje guardadas en los archivos del gremio.`);
  if (!confirmation) return;

  try {
    const response = await Auth.fetch(`/api/admin/usuarios/${userId}`, {
      method: "DELETE"
    });

    if (!response.ok) throw new Error("Fallo");

    Auth.showToast(`El aventurero ${username} y sus registros han sido eliminados de este plano.`, "success");
    await loadUsersList();
  } catch (e) {
    Auth.showToast("Fallo al abolir aventurero del plano físico.", "error");
  }
};

// Cambiar Rango/Rol de un usuario (Solo Admin)
window.changeUserRole = async function(userId, newRole, username) {
  try {
    Auth.showToast(`Alterando el rango de ${username}...`, "success");
    const response = await Auth.fetch(`/api/admin/usuarios/${userId}/role`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ role: newRole })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Error al cambiar rango");
    }

    Auth.showToast(`El rango de ${username} ha sido cambiado a ${newRole === 'admin' ? 'Administrador' : 'Aventurero'}.`, "success");
    await loadUsersList();
  } catch (e) {
    console.error(e);
    Auth.showToast(`Error al cambiar rango: ${e.message}`, "error");
    await loadUsersList(); // Recargar para deshacer en el DOM
  }
};
