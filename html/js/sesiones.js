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

    listWrapper.innerHTML = "";
    mySessions.forEach(s => {
      const item = document.createElement("div");
      item.className = `dm-session-item ${selectedDmSessionId === s.id ? 'active' : ''}`;
      item.setAttribute("data-id", s.id);

      item.innerHTML = `
        <div class="dm-session-info">
          <h4 class="session-name"></h4>
          <p>Aventureros asignados: <strong class="joined-count" style="color: var(--secondary);"></strong></p>
        </div>
        <div style="display: flex; gap: 8px; flex-shrink: 0;">
          <button class="btn btn-secondary inspect-btn" style="padding: 6px 12px; font-size: 0.75rem; flex-shrink: 0; white-space: nowrap;">Inspeccionar</button>
          <button class="btn btn-danger delete-btn" style="padding: 6px 12px; font-size: 0.75rem; background-color: var(--primary); flex-shrink: 0; white-space: nowrap;">Disolver</button>
        </div>
      `;

      item.querySelector(".session-name").textContent = s.nombre;
      item.querySelector(".joined-count").textContent = s.joined_characters_count;

      const inspectBtn = item.querySelector(".inspect-btn");
      inspectBtn.setAttribute("data-id", s.id);
      inspectBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        inspectSession(s.id);
      });

      const deleteBtn = item.querySelector(".delete-btn");
      deleteBtn.setAttribute("data-id", s.id);
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        confirmDeleteSession(s.id);
      });

      item.addEventListener("click", () => {
        inspectSession(s.id);
      });

      listWrapper.appendChild(item);
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

    inspectPanel.innerHTML = `
      <h3 class="panel-section-title brand-decorative" style="display: flex; justify-content: space-between; align-items: center;">
        <span class="panel-title-text"></span>
        <button class="btn btn-secondary close-inspect-btn" style="padding: 6px 12px; font-size: 0.75rem;">Cerrar Inspector</button>
      </h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">
        Haz clic sobre la tarjeta de cualquier héroe para inspeccionar su ficha detallada, consultar sus estadísticas en tiempo real y leer sus crónicas.
      </p>
      
      <div class="inspect-characters-grid"></div>
    `;

    inspectPanel.querySelector(".panel-title-text").textContent = `Fichas Alistadas en: ${activeSession.nombre}`;
    inspectPanel.querySelector(".close-inspect-btn").addEventListener("click", () => {
      inspectPanel.remove();
    });

    const grid = inspectPanel.querySelector(".inspect-characters-grid");
    if (sessionCharacters.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: var(--text-muted);">
          Ningún héroe se ha alistado en esta campaña todavía.
        </div>
      `;
    } else {
      sessionCharacters.forEach(c => {
        const charCard = document.createElement("div");
        charCard.className = "inspect-char-card card-glass";
        charCard.setAttribute("data-char-id", c.id);

        charCard.innerHTML = `
          <img class="inspect-char-avatar" alt="">
          <div class="inspect-char-info">
            <h5 class="char-name"></h5>
            <p class="char-apodo" style="margin-bottom: 2px;"></p>
            <p class="char-owner" style="font-size: 0.72rem; color: var(--secondary); font-weight: bold; margin-bottom: 2px; font-family: 'Cinzel', serif;">
            </p>
            <p class="char-classes" style="font-size: 0.7rem; color: var(--text-muted); font-style: italic;">
            </p>
          </div>
          <button class="btn btn-danger kick-btn" style="margin-left: auto; padding: 6px 12px; font-size: 0.75rem; background-color: var(--primary); flex-shrink: 0; white-space: nowrap;">Expulsar</button>
        `;

        const avatarImg = charCard.querySelector(".inspect-char-avatar");
        avatarImg.src = c.foto_principal || '/html/img/default-avatar.svg';
        avatarImg.alt = c.nombre;

        charCard.querySelector(".char-name").textContent = c.nombre;
        charCard.querySelector(".char-apodo").textContent = c.apodo || 'Sin apodo';
        charCard.querySelector(".char-owner").textContent = `Aventurero de: ${c.owner_username || 'Desconocido'}`;
        charCard.querySelector(".char-classes").textContent = `Clase: ${c.clases.slice(0, 2).join(", ")}`;

        // Botón expulsar
        const kickBtn = charCard.querySelector(".kick-btn");
        kickBtn.setAttribute("data-char-id", c.id);
        kickBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          kickCharacterFromSession(activeSession.id, c.id);
        });

        // Click en tarjeta
        charCard.addEventListener("click", () => {
          showCharacterModal(c.id);
        });

        grid.appendChild(charCard);
      });
    }
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

    grid.innerHTML = "";
    sessions.forEach(s => {
      const card = document.createElement("div");
      card.className = "session-card card-glass";

      card.innerHTML = `
        <div class="session-card-header">
          <h4 class="session-card-title"></h4>
          <span class="session-card-creator"></span>
        </div>
        <div class="session-card-body"></div>
        <div class="session-card-footer">
          <span class="session-card-joined-counter"></span>
          <div class="session-action-block" style="width: 100%; margin-top: 4px;"></div>
        </div>
      `;

      card.querySelector(".session-card-title").textContent = s.nombre;
      
      const creatorSpan = card.querySelector(".session-card-creator");
      creatorSpan.textContent = "Dungeon Master: ";
      const creatorStrong = document.createElement("strong");
      creatorStrong.textContent = s.dm_username;
      creatorSpan.appendChild(creatorStrong);

      card.querySelector(".session-card-body").textContent = s.descripcion;
      card.querySelector(".session-card-joined-counter").textContent = `Aventureros alistados: ${s.joined_characters_count}`;

      const actionBlock = card.querySelector(".session-action-block");
      const userJoinedChar = userCharacters.find(uc => s.personajes.includes(uc.id));

      if (userJoinedChar) {
        actionBlock.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
            <p class="joined-status" style="font-size: 0.75rem; color: #2ecc71; text-align: center;">
            </p>
            <button class="btn btn-secondary leave-session-btn" style="padding: 8px; width: 100%; font-size: 0.8rem;">
              Retirar Héroe de la Partida
            </button>
          </div>
        `;
        
        const statusP = actionBlock.querySelector(".joined-status");
        statusP.textContent = "⚔️ Te uniste con ";
        const charStrong = document.createElement("strong");
        charStrong.textContent = userJoinedChar.nombre;
        statusP.appendChild(charStrong);

        const leaveBtn = actionBlock.querySelector(".leave-session-btn");
        leaveBtn.addEventListener("click", () => {
          leaveSession(s.id, userJoinedChar.id);
        });

      } else if (userCharacters.length === 0) {
        const p = document.createElement("p");
        p.style.fontSize = "0.75rem";
        p.style.color = "var(--text-muted)";
        p.style.textAlign = "center";
        p.style.fontStyle = "italic";
        p.textContent = "Necesitas tener un héroe en el portal para unirte a esta campaña.";
        actionBlock.appendChild(p);

      } else {
        const selectContainer = document.createElement("div");
        selectContainer.style.display = "flex";
        selectContainer.style.gap = "8px";
        selectContainer.style.width = "100%";

        const select = document.createElement("select");
        select.className = "form-control join-char-select";
        select.style.flexGrow = "1";
        select.style.fontSize = "0.8rem";
        select.style.height = "36px";
        select.style.padding = "6px";
        select.style.cursor = "pointer";

        userCharacters.forEach(uc => {
          const opt = document.createElement("option");
          opt.value = uc.id;
          opt.textContent = `${uc.nombre} (${uc.clases.slice(0, 1).join("")})`;
          select.appendChild(opt);
        });

        const joinBtn = document.createElement("button");
        joinBtn.className = "btn join-session-btn";
        joinBtn.style.padding = "8px 16px";
        joinBtn.style.fontSize = "0.8rem";
        joinBtn.style.height = "36px";
        joinBtn.style.flexShrink = "0";
        joinBtn.style.whiteSpace = "nowrap";
        joinBtn.textContent = "Unirse";

        joinBtn.addEventListener("click", () => {
          joinSession(s.id, select.value);
        });

        selectContainer.appendChild(select);
        selectContainer.appendChild(joinBtn);
        actionBlock.appendChild(selectContainer);
      }

      grid.appendChild(card);
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
    if (!confirm("¿Estás seguro de que deseas disolver esta sesión? Todos los personajes alistados serán devueltos a los anales individuales.")) return;

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
          <img class="modal-avatar" alt="">
          <h3 class="modal-char-name" style="font-family: 'Cinzel', serif; margin-top: 10px; color: #fff;"></h3>
          <span class="modal-char-apodo" style="font-family: 'Cinzel', serif; font-size: 0.85rem; color: var(--secondary); font-style: italic; display: block; margin-bottom: 4px;">
          </span>
          <span class="modal-char-owner" style="font-size: 0.78rem; color: var(--text-muted); font-family: 'Cinzel', serif; display: block;">
          </span>
          
          <div class="modal-char-badges" style="display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-top: 10px;">
          </div>
        </div>

        <!-- Estadísticas y Descripción -->
        <div class="modal-info-col">
          <h4 class="modal-section-title">Estadísticas del Héroe</h4>
          <div class="stats-grid-dnd" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 25px;">
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">FUE</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Fuerza</span>
              <strong class="stat-fue-val" style="font-size: 1.1rem; color: #fff;"></strong>
              <span class="stat-fue-mod stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;"></span>
            </div>
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">DES</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Destreza</span>
              <strong class="stat-des-val" style="font-size: 1.1rem; color: #fff;"></strong>
              <span class="stat-des-mod stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;"></span>
            </div>
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">CON</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Constitución</span>
              <strong class="stat-con-val" style="font-size: 1.1rem; color: #fff;"></strong>
              <span class="stat-con-mod stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;"></span>
            </div>
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">INT</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Inteligencia</span>
              <strong class="stat-int-val" style="font-size: 1.1rem; color: #fff;"></strong>
              <span class="stat-int-mod stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;"></span>
            </div>
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">SAB</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Sabiduría</span>
              <strong class="stat-sab-val" style="font-size: 1.1rem; color: #fff;"></strong>
              <span class="stat-sab-mod stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;"></span>
            </div>
            <div class="stat-shield-box" style="padding: 10px;">
              <span class="stat-label-abbr">CAR</span>
              <span class="stat-label-full" style="font-size: 0.6rem;">Carisma</span>
              <strong class="stat-car-val" style="font-size: 1.1rem; color: #fff;"></strong>
              <span class="stat-car-mod stat-modifier-badge" style="position: relative; bottom: auto; left: auto; transform: none; margin: 8px auto 0 auto;"></span>
            </div>
          </div>

          <h4 class="modal-section-title">Habilidades y Crónicas</h4>
          <div class="modal-desc" style="max-height: 250px; overflow-y: auto; padding-right: 8px; font-size: 0.85rem; line-height: 1.6; color: var(--text-muted);">
          </div>
          
          <div class="modal-gallery-wrapper"></div>
        </div>
      </div>
    `;

    const avatar = modalBody.querySelector(".modal-avatar");
    avatar.src = char.foto_principal || '/html/img/default-avatar.svg';
    avatar.alt = char.nombre;

    modalBody.querySelector(".modal-char-name").textContent = char.nombre;
    modalBody.querySelector(".modal-char-apodo").textContent = char.apodo || 'Sin apodo';
    
    const ownerSpan = modalBody.querySelector(".modal-char-owner");
    ownerSpan.textContent = "Creador: ";
    const ownerStrong = document.createElement("strong");
    ownerStrong.style.color = "#fff";
    ownerStrong.textContent = char.owner_username || 'Desconocido';
    ownerSpan.appendChild(ownerStrong);

    const badgesContainer = modalBody.querySelector(".modal-char-badges");
    char.clases.forEach(cl => {
      const b = document.createElement("span");
      b.className = "class-badge";
      b.textContent = cl;
      badgesContainer.appendChild(b);
    });

    modalBody.querySelector(".stat-fue-val").textContent = char.stats.fue;
    modalBody.querySelector(".stat-fue-mod").textContent = getModText(char.stats.fue);
    modalBody.querySelector(".stat-des-val").textContent = char.stats.des;
    modalBody.querySelector(".stat-des-mod").textContent = getModText(char.stats.des);
    modalBody.querySelector(".stat-con-val").textContent = char.stats.con;
    modalBody.querySelector(".stat-con-mod").textContent = getModText(char.stats.con);
    modalBody.querySelector(".stat-int-val").textContent = char.stats.int;
    modalBody.querySelector(".stat-int-mod").textContent = getModText(char.stats.int);
    modalBody.querySelector(".stat-sab-val").textContent = char.stats.sab;
    modalBody.querySelector(".stat-sab-mod").textContent = getModText(char.stats.sab);
    modalBody.querySelector(".stat-car-val").textContent = char.stats.car;
    modalBody.querySelector(".stat-car-mod").textContent = getModText(char.stats.car);

    modalBody.querySelector(".modal-desc").textContent = char.descripcion_habilidades || 'Sin descripción ni crónicas registradas en los anales.';

    if (char.galeria && char.galeria.length > 0) {
      const galleryWrapper = modalBody.querySelector(".modal-gallery-wrapper");
      galleryWrapper.innerHTML = `
        <h4 class="modal-section-title">Ilustraciones</h4>
        <div class="modal-gallery-grid"></div>
      `;
      const grid = galleryWrapper.querySelector(".modal-gallery-grid");
      char.galeria.forEach(imgUrl => {
        const container = document.createElement("div");
        container.className = "gallery-thumbnail-container";
        
        const a = document.createElement("a");
        a.href = imgUrl;
        a.target = "_blank";

        const img = document.createElement("img");
        img.src = imgUrl;
        img.className = "gallery-thumb";
        img.alt = "Ilustración secundaria";

        a.appendChild(img);
        container.appendChild(a);
        grid.appendChild(container);
      });
    }

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
