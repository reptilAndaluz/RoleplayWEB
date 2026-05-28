// Controller for D&D Sessions View
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Verificar Autenticación obligatoria
  const userInfo = Auth.getUserInfo();
  if (!userInfo) {
    window.location.href = "/html/index.html";
    return;
  }

  // Configurar enlace administrador si corresponde
  const adminNavItem = document.getElementById("admin-nav-item");
  if (adminNavItem && Auth.isAdmin()) {
    adminNavItem.style.display = "block";
  }

  // Mostrar el Dashboard del Dungeon Master si tiene rol dm o admin
  const isDM = Auth.isDM();
  const dmDashboardSection = document.getElementById("dm-dashboard-section");
  if (isDM && dmDashboardSection) {
    dmDashboardSection.style.display = "grid";
  }

  // Estado local
  let sessions = [];
  let userCharacters = [];
  let selectedDmSessionId = null;

  // Cargar datos iniciales
  async function init() {
    try {
      await loadUserCharacters();
      await loadSessions();
    } catch (e) {
      console.error(e);
      Auth.showToast("Error al inicializar la sala de sesiones.", "error");
    }
  }

  // Obtener personajes creados por el propio usuario logueado
  async function loadUserCharacters() {
    try {
      const response = await Auth.fetch("/api/personajes");
      if (response.ok) {
        const allChars = await response.json();
        // Filtrar solo los personajes que pertenecen a este usuario
        userCharacters = allChars.filter(c => c.user_id === userInfo.id);
      }
    } catch (e) {
      console.error("Error al cargar aventureros del usuario:", e);
    }
  }

  // Cargar y listar todas las sesiones
  async function loadSessions() {
    try {
      const response = await Auth.fetch("/api/sesiones");
      if (!response.ok) throw new Error("Fallo al consultar sesiones");
      sessions = await response.json();

      renderCommunitySessions();
      if (isDM) {
        renderDmSessions();
      }
    } catch (e) {
      console.error(e);
      Auth.showToast("Fallo al invocar el registro de sesiones.", "error");
    }
  }

  // RENDER: Panel de Dungeon Master (Tus Sesiones Activas)
  function renderDmSessions() {
    const listWrapper = document.getElementById("dm-sessions-list");
    if (!listWrapper) return;

    // Solo sesiones creadas por mí (o todas si soy administrador supremo)
    const mySessions = sessions.filter(s => s.dm_id === userInfo.id || userInfo.role === "admin");

    if (mySessions.length === 0) {
      listWrapper.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          🔮 No tienes ninguna sesión mística activa en este plano.
        </div>
      `;
      return;
    }

    listWrapper.innerHTML = mySessions.map(s => `
      <div class="dm-session-item ${selectedDmSessionId === s.id ? 'active' : ''}" data-id="${s.id}">
        <div class="dm-session-info">
          <h4>${escapeHtml(s.nombre)}</h4>
          <p>Aventureros asignados: <strong style="color: var(--secondary);">${s.joined_characters_count}</strong></p>
        </div>
        <div style="display: flex; gap: 8px; flex-shrink: 0;">
          <button class="btn btn-secondary inspect-btn" style="padding: 6px 12px; font-size: 0.75rem; flex-shrink: 0; white-space: nowrap;" data-id="${s.id}">Inspeccionar</button>
          <button class="btn btn-danger delete-btn" style="padding: 6px 12px; font-size: 0.75rem; background-color: var(--primary); flex-shrink: 0; white-space: nowrap;" data-id="${s.id}">Disolver</button>
        </div>
      </div>
    `).join("");

    // Agregar Event Listeners
    listWrapper.querySelectorAll(".inspect-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        inspectSession(btn.getAttribute("data-id"));
      });
    });

    listWrapper.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        confirmDeleteSession(btn.getAttribute("data-id"));
      });
    });

    listWrapper.querySelectorAll(".dm-session-item").forEach(item => {
      item.addEventListener("click", () => {
        inspectSession(item.getAttribute("data-id"));
      });
    });

    // Mantener la visualización de la sesión inspeccionada activada
    if (selectedDmSessionId) {
      renderSessionCharactersPanel();
    }
  }

  // RENDER: Panel inferior de inspección de personajes asignados a una sesión
  let sessionCharacters = [];
  async function inspectSession(sessionId) {
    selectedDmSessionId = sessionId;
    
    // Marcar activo en la lista
    document.querySelectorAll(".dm-session-item").forEach(item => {
      if (item.getAttribute("data-id") === sessionId) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    try {
      const response = await Auth.fetch(`/api/sesiones/${sessionId}/personajes`);
      if (response.ok) {
        sessionCharacters = await response.json();
        renderSessionCharactersPanel();
      } else {
        throw new Error("No tienes acceso a esta sesión");
      }
    } catch (e) {
      console.error(e);
      Auth.showToast("No pudiste inspeccionar los héroes de esta sesión.", "error");
    }
  }

  function renderSessionCharactersPanel() {
    const activeSession = sessions.find(s => s.id === selectedDmSessionId);
    if (!activeSession) return;

    // Crear o ubicar el panel de inspección de personajes
    let inspectPanel = document.getElementById("dm-session-inspect-panel");
    if (!inspectPanel) {
      inspectPanel = document.createElement("div");
      inspectPanel.id = "dm-session-inspect-panel";
      inspectPanel.className = "card-glass dm-inspect-panel";
      dmDashboardSection.parentNode.insertBefore(inspectPanel, dmDashboardSection.nextSibling);
    }

    let charactersHtml = "";
    if (sessionCharacters.length === 0) {
      charactersHtml = `
        <div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: var(--text-muted);">
          🛡️ Ningún héroe se ha alistado en esta campaña todavía.
        </div>
      `;
    } else {
      charactersHtml = sessionCharacters.map(c => `
        <div class="inspect-char-card card-glass" data-char-id="${c.id}">
          <img src="${c.foto_principal || '/html/img/default-avatar.svg'}" class="inspect-char-avatar" alt="${escapeHtml(c.nombre)}">
          <div class="inspect-char-info">
            <h5>${escapeHtml(c.nombre)}</h5>
            <p style="margin-bottom: 2px;">${escapeHtml(c.apodo || 'Sin apodo')}</p>
            <p style="font-size: 0.72rem; color: var(--secondary); font-weight: bold; margin-bottom: 2px; font-family: 'Cinzel', serif;">
              Aventurero de: ${escapeHtml(c.owner_username || 'Desconocido')}
            </p>
            <p style="font-size: 0.7rem; color: var(--text-muted); font-style: italic;">
              Clase: ${c.clases.slice(0, 2).join(", ")}
            </p>
          </div>
          <button class="btn btn-danger kick-btn" style="margin-left: auto; padding: 6px 12px; font-size: 0.75rem; background-color: var(--primary); flex-shrink: 0; white-space: nowrap;" data-char-id="${c.id}">Expulsar</button>
        </div>
      `).join("");
    }

    inspectPanel.innerHTML = `
      <h3 class="panel-section-title brand-decorative" style="display: flex; justify-content: space-between; align-items: center;">
        <span>Fichas Alistadas en: ${escapeHtml(activeSession.nombre)}</span>
        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.75rem;" onclick="document.getElementById('dm-session-inspect-panel').remove();">Cerrar Inspector</button>
      </h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">
        Haz clic sobre la tarjeta de cualquier héroe para inspeccionar su ficha detallada, consultar sus estadísticas en tiempo real y leer sus crónicas.
      </p>
      
      <div class="inspect-characters-grid">
        ${charactersHtml}
      </div>
    `;

    // Event listener para expulsar a un jugador
    inspectPanel.querySelectorAll(".kick-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        kickCharacterFromSession(activeSession.id, btn.getAttribute("data-char-id"));
      });
    });

    // Event listener para inspeccionar detalle de ficha
    inspectPanel.querySelectorAll(".inspect-char-card").forEach(card => {
      card.addEventListener("click", () => {
        showCharacterModal(card.getAttribute("data-char-id"));
      });
    });
  }

  // RENDER: Listado General de Sesiones de la Comunidad
  function renderCommunitySessions() {
    const grid = document.getElementById("community-sessions-grid");
    if (!grid) return;

    if (sessions.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 60px 40px; text-align: center; color: var(--text-muted);">
          🏰 No hay sesiones de juego registradas en las crónicas actualmente.
        </div>
      `;
      return;
    }

    grid.innerHTML = sessions.map(s => {
      // Filtrar personajes del usuario que ya están en esta sesión
      const userJoinedChar = userCharacters.find(uc => s.personajes.includes(uc.id));
      
      let actionBlock = "";
      if (userJoinedChar) {
        // El usuario ya se unió a esta campaña con un héroe
        actionBlock = `
          <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
            <p style="font-size: 0.75rem; color: #2ecc71; text-align: center;">
              ⚔️ Te uniste con <strong>${escapeHtml(userJoinedChar.nombre)}</strong>
            </p>
            <button class="btn btn-secondary leave-session-btn" style="padding: 8px; width: 100%; font-size: 0.8rem;" data-session-id="${s.id}" data-char-id="${userJoinedChar.id}">
              Retirar Héroe de la Partida
            </button>
          </div>
        `;
      } else if (userCharacters.length === 0) {
        actionBlock = `
          <p style="font-size: 0.75rem; color: var(--text-muted); text-align: center; font-style: italic;">
            Necesitas tener un héroe en el portal para unirte a esta campaña.
          </p>
        `;
      } else {
        // Ofrecer dropdown de sus personajes disponibles
        const availableOptions = userCharacters.map(c => `
          <option value="${c.id}">${escapeHtml(c.nombre)} (${c.clases.slice(0, 1).join("")})</option>
        `).join("");

        actionBlock = `
          <div style="display: flex; gap: 8px; width: 100%;">
            <select class="form-control join-char-select" style="flex-grow: 1; font-size: 0.8rem; height: 36px; padding: 6px; cursor: pointer;" id="join-select-${s.id}">
              ${availableOptions}
            </select>
            <button class="btn join-session-btn" style="padding: 8px 16px; font-size: 0.8rem; height: 36px; flex-shrink: 0; white-space: nowrap;" data-session-id="${s.id}">
              Unirse
            </button>
          </div>
        `;
      }

      return `
        <div class="session-card card-glass">
          <div class="session-card-header">
            <h4 class="session-card-title">${escapeHtml(s.nombre)}</h4>
            <span class="session-card-creator">Dungeon Master: <strong>${escapeHtml(s.dm_username)}</strong></span>
          </div>
          <div class="session-card-body">
            ${escapeHtml(s.descripcion)}
          </div>
          <div class="session-card-footer">
            <span class="session-card-joined-counter">Aventureros alistados: ${s.joined_characters_count}</span>
            <div style="width: 100%; margin-top: 4px;">
              ${actionBlock}
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Event Listeners para unirse a sesiones
    grid.querySelectorAll(".join-session-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const sessionId = btn.getAttribute("data-session-id");
        const selectEl = document.getElementById(`join-select-${sessionId}`);
        if (selectEl) {
          joinSession(sessionId, selectEl.value);
        }
      });
    });

    // Event Listeners para salirse de sesiones
    grid.querySelectorAll(".leave-session-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const sessionId = btn.getAttribute("data-session-id");
        const charId = btn.getAttribute("data-char-id");
        leaveSession(sessionId, charId);
      });
    });
  }

  // ACCIÓN: Fundar una sesión
  const createForm = document.getElementById("create-session-form");
  if (createForm) {
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = document.getElementById("sess-nombre").value;
      const descripcion = document.getElementById("sess-desc").value;

      try {
        const response = await Auth.fetch("/api/sesiones", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ nombre, descripcion })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Fallo al fundar la sesión");
        }

        Auth.showToast("¡Sesión de juego fundada con éxito!", "success");
        createForm.reset();
        await loadSessions();
      } catch (err) {
        console.error(err);
        Auth.showToast(`Error al crear la sesión: ${err.message}`, "error");
      }
    });
  }

  // ACCIÓN: Disolver una sesión
  async function confirmDeleteSession(sessionId) {
    if (!confirm("⚠️ ¿Estás seguro de que deseas disolver esta sesión? Todos los personajes alistados serán devueltos a los anales individuales.")) return;

    try {
      const response = await Auth.fetch(`/api/sesiones/${sessionId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Fallo al disolver");
      }

      Auth.showToast("Sesión de juego disuelta mística y limpiamente.", "success");
      
      // Limpiar panel de inspección activo si corresponde
      if (selectedDmSessionId === sessionId) {
        selectedDmSessionId = null;
        const panel = document.getElementById("dm-session-inspect-panel");
        if (panel) panel.remove();
      }

      await loadSessions();
    } catch (e) {
      console.error(e);
      Auth.showToast(`Fallo al disolver: ${e.message}`, "error");
    }
  }

  // ACCIÓN: Unir personaje a sesión
  async function joinSession(sessionId, charId) {
    try {
      const response = await Auth.fetch(`/api/sesiones/${sessionId}/personajes/${charId}`, {
        method: "POST"
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error al unirse");
      }

      Auth.showToast("Tu héroe ha cruzado el umbral y se ha unido a la campaña.", "success");
      await loadSessions();
    } catch (e) {
      console.error(e);
      Auth.showToast(`Fallo al unirse: ${e.message}`, "error");
    }
  }

  // ACCIÓN: Retirar personaje de la sesión
  async function leaveSession(sessionId, charId) {
    try {
      const response = await Auth.fetch(`/api/sesiones/${sessionId}/personajes/${charId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error al salirse");
      }

      Auth.showToast("Personaje retirado de la sesión con éxito.", "success");
      await loadSessions();
    } catch (e) {
      console.error(e);
      Auth.showToast(`Fallo al retirarse: ${e.message}`, "error");
    }
  }

  // ACCIÓN: Expulsar un personaje (DMs)
  async function kickCharacterFromSession(sessionId, charId) {
    if (!confirm("¿Deseas expulsar a este aventurero de la campaña?")) return;

    try {
      const response = await Auth.fetch(`/api/sesiones/${sessionId}/personajes/${charId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error al expulsar");
      }

      Auth.showToast("El personaje ha sido expulsado de la campaña.", "success");
      
      // Recargar inspección de personajes
      await loadSessions();
      await inspectSession(sessionId);
    } catch (e) {
      console.error(e);
      Auth.showToast(`Fallo al expulsar: ${e.message}`, "error");
    }
  }

  // MODAL: Mostrar ficha de personaje
  function showCharacterModal(charId) {
    const char = sessionCharacters.find(c => c.id === charId);
    if (!char) return;

    const modal = document.getElementById("character-detail-modal");
    const modalBody = document.getElementById("modal-detail-body");
    if (!modal || !modalBody) return;

    // Calcular modificador D&D de forma visual
    function getModText(score) {
      const mod = Math.floor((score - 10) / 2);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    }

    modalBody.innerHTML = `
      <div class="inspect-modal-grid">
        <!-- Avatar y Datos básicos -->
        <div class="modal-avatar-col">
          <img src="${char.foto_principal || '/html/img/default-avatar.svg'}" class="modal-avatar" alt="${escapeHtml(char.nombre)}">
          <h3 style="font-family: 'Cinzel', serif; margin-top: 10px; color: #fff;">${escapeHtml(char.nombre)}</h3>
          <span style="font-family: 'Cinzel', serif; font-size: 0.85rem; color: var(--secondary); font-style: italic; display: block; margin-bottom: 4px;">
            ${escapeHtml(char.apodo || 'Sin apodo')}
          </span>
          <span style="font-size: 0.78rem; color: var(--text-muted); font-family: 'Cinzel', serif; display: block;">
            Creador: <strong style="color: #fff;">${escapeHtml(char.owner_username || 'Desconocido')}</strong>
          </span>
          
          <div style="display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-top: 10px;">
            ${char.clases.map(cl => `<span class="class-badge">${escapeHtml(cl)}</span>`).join("")}
          </div>
        </div>

        <!-- Estadísticas y Descripción -->
        <div class="modal-info-col">
          <h4 class="modal-section-title">Estadísticas del Héroe</h4>
          <div class="stats-grid-dnd" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 25px;">
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">FUE</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Fuerza</span>
              <strong style="font-size: 1.1rem; color: #fff;">${char.stats.fue}</strong>
              <span class="stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;">${getModText(char.stats.fue)}</span>
            </div>
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">DES</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Destreza</span>
              <strong style="font-size: 1.1rem; color: #fff;">${char.stats.des}</strong>
              <span class="stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;">${getModText(char.stats.des)}</span>
            </div>
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">CON</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Constitución</span>
              <strong style="font-size: 1.1rem; color: #fff;">${char.stats.con}</strong>
              <span class="stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;">${getModText(char.stats.con)}</span>
            </div>
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">INT</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Inteligencia</span>
              <strong style="font-size: 1.1rem; color: #fff;">${char.stats.int}</strong>
              <span class="stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;">${getModText(char.stats.int)}</span>
            </div>
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">SAB</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Sabiduría</span>
              <strong style="font-size: 1.1rem; color: #fff;">${char.stats.sab}</strong>
              <span class="stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;">${getModText(char.stats.sab)}</span>
            </div>
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">CAR</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Carisma</span>
              <strong style="font-size: 1.1rem; color: #fff;">${char.stats.car}</strong>
              <span class="stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;">${getModText(char.stats.car)}</span>
            </div>
          </div>

          <h4 class="modal-section-title">Habilidades y Crónicas</h4>
          <div class="modal-desc" style="max-height: 250px; overflow-y: auto; padding-right: 8px; font-size: 0.85rem; line-height: 1.6; color: var(--text-muted);">
            ${escapeHtml(char.descripcion_habilidades || 'Sin descripción ni crónicas registradas en los anales.')}
          </div>
          
          ${char.galeria && char.galeria.length > 0 ? `
            <h4 class="modal-section-title">Ilustraciones</h4>
            <div class="modal-gallery-grid">
              ${char.galeria.map(imgUrl => `
                <div class="gallery-thumbnail-container">
                  <a href="${imgUrl}" target="_blank">
                    <img src="${imgUrl}" class="gallery-thumb" alt="Ilustración secundaria">
                  </a>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      </div>
    `;

    modal.classList.add("show");
  }

  // Cerrar Modal
  const modalClose = document.getElementById("modal-detail-close");
  const modal = document.getElementById("character-detail-modal");
  if (modalClose && modal) {
    modalClose.addEventListener("click", () => {
      modal.classList.remove("show");
    });

    window.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("show");
      }
    });
  }

  // Salir
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      Auth.logout();
      window.location.href = "/html/index.html";
    });
  }

  // Utilidad de escape de caracteres HTML
  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Inicializar sala
  await init();
});
