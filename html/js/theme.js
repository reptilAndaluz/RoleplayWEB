// --- THEME & CONFIGURATION SYNC ---

const ThemeManager = {
  async applyConfig() {
    try {
      const response = await fetch('/api/config');
      if (!response.ok) return;

      const config = await response.json();

      // 1. Aplicar tema de color en HTML
      if (config.tema) {
        document.documentElement.setAttribute('data-theme', config.tema);
      }

      // 2. Aplicar título del sitio en cabecera y títulos de página
      if (config.titulo) {
        const headerText = document.getElementById("site-title-text");
        if (headerText) {
          headerText.innerText = config.titulo;
        }

        // Si estamos en una página con h2 de bienvenida
        const welcomeMsg = document.getElementById("welcome-message");
        if (welcomeMsg && welcomeMsg.tagName === "H2") {
          // Solo cambiar si no está editando un personaje o realizando otra acción específica
          if (welcomeMsg.innerText === "Archivo de Héroes" || welcomeMsg.innerText === "Gremio de Héroes") {
            welcomeMsg.innerText = config.titulo;
          }
        }
      }

      // 3. Aplicar logo personalizado en cabecera
      if (config.logo) {
        const headerLogo = document.getElementById("header-logo");
        if (headerLogo) {
          const img = document.createElement("img");
          img.src = config.logo;
          img.className = "logo-icon";
          img.id = "header-logo";
          img.alt = "Logo Personalizado";
          headerLogo.replaceWith(img);
        }
      }

      return config;
    } catch (e) {
      console.error("Error aplicando la configuración visual:", e);
    }
  }
};

// Autoejecutar al cargar el DOM en cualquier página que lo enlace
document.addEventListener("DOMContentLoaded", () => {
  ThemeManager.applyConfig();
});
