// --- GLOBAL AUTHENTICATION & UTILITIES ---

const Auth = {
  TOKEN_KEY: "dnd_guild_token",
  USER_KEY: "dnd_guild_user",

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUserInfo() {
    const userStr = localStorage.getItem(this.USER_KEY);
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    
    // Fallback: Si no tiene ID en localStorage, decodificarlo desde el token JWT
    if (user && !user.id) {
      const token = this.getToken();
      if (token) {
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          const payload = JSON.parse(jsonPayload);
          if (payload && payload.user_id) {
            user.id = payload.user_id;
            localStorage.setItem(this.USER_KEY, JSON.stringify(user));
          }
        } catch (e) {
          console.error("Error al decodificar token JWT:", e);
        }
      }
    }
    return user;
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  isAdmin() {
    const user = this.getUserInfo();
    return user && user.role === "admin";
  },

  isDM() {
    const user = this.getUserInfo();
    return user && (user.role === "dm" || user.role === "admin");
  },

  async login(username, password) {
    try {
      const formData = new URLSearchParams();
      formData.append("username", username);
      formData.append("password", password);

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      localStorage.setItem(this.TOKEN_KEY, data.access_token);
      localStorage.setItem(
        this.USER_KEY,
        JSON.stringify({
          id: data.id,
          username: data.username,
          role: data.role,
        })
      );
      return true;
    } catch (e) {
      console.error("Error en la llamada de login:", e);
      return false;
    }
  },

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.showToast("Cerrando el archivo místico. ¡Buen viaje, aventurero!", "success");
    setTimeout(() => {
      window.location.href = "/html/index.html";
    }, 1000);
  },

  // Envoltura mística de fetch para inyectar cabeceras JWT y controlar errores 401
  async fetch(url, options = {}) {
    const token = this.getToken();
    const headers = options.headers || {};

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    options.headers = headers;

    try {
      const response = await fetch(url, options);

      // Si está caducado o no autorizado
      if (response.status === 401) {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        this.showToast("Tu sesión ha caducado en el plano astral. Por favor, re-identifícate.", "error");
        setTimeout(() => {
          window.location.href = "/html/index.html";
        }, 2000);
        throw new Error("No autorizado");
      }

      return response;
    } catch (e) {
      if (e.message !== "No autorizado") {
        console.error(`Error en la llamada mística a ${url}:`, e);
      }
      throw e;
    }
  },

  // Sistema premium de notificaciones (Toasts)
  showToast(message, type = "success") {
    const container = document.getElementById("notification-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = "📜";
    if (type === "success") icon = "✨";
    if (type === "error") icon = "⚠️";

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.25rem;">${icon}</span>
        <span>${message}</span>
      </div>
      <span style="cursor: pointer; opacity: 0.6; font-weight: bold;" onclick="this.parentElement.remove()">&times;</span>
    `;

    container.appendChild(toast);

    // Auto-eliminar después de 4.5 segundos con animación de desvanecimiento
    setTimeout(() => {
      toast.style.animation = "fadeOut 0.4s ease forwards";
      setTimeout(() => {
        toast.remove();
      }, 400);
    }, 4500);
  },

  // Verificar la sesión y redirigir
  checkAuthAndSetupUI() {
    if (!this.isLoggedIn()) {
      window.location.href = "/html/index.html";
      return false;
    }

    // Configurar visibilidad del menú de administración
    const adminNavItem = document.getElementById("admin-nav-item");
    if (adminNavItem) {
      adminNavItem.style.display = this.isAdmin() ? "block" : "none";
    }

    // Configurar botón de logout
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => this.logout());
    }

    return true;
  }
};
