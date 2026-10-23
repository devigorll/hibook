// Seletor de tema: dois botões (claro e escuro) com o tema atual destacado.
// Não depende de rede nem da biblioteca de ícones (os desenhos são SVG próprios).

import { getTheme, setTheme, onThemeChange, startThemeSync } from '../services/theme_service.js';

const ICON_ATTRS = 'viewBox="0 0 24 24" aria-hidden="true"';

const SUN = `
  <svg ${ICON_ATTRS}>
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
`;

const MOON = `
  <svg ${ICON_ATTRS}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
`;

const OPTIONS = [
  { value: 'light', label: 'Tema claro', icon: SUN },
  { value: 'dark', label: 'Tema escuro', icon: MOON }
];

export const themeView = {
  // Cria o seletor. Pode ser colocado em qualquer tela (cabeçalho, login...).
  createSwitch() {
    startThemeSync();

    const root = document.createElement('div');
    root.className = 'theme-switch';
    root.setAttribute('role', 'radiogroup');
    root.setAttribute('aria-label', 'Tema da interface');

    const buttons = OPTIONS.map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-option';
      button.dataset.value = option.value;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', option.label);
      button.title = option.label;
      button.innerHTML = option.icon; // SVG fixo definido acima (sem dados do usuário)

      button.addEventListener('click', () => setTheme(option.value));

      root.appendChild(button);
      return button;
    });

    // Destaca o tema atual.
    function render(theme = getTheme()) {
      buttons.forEach((button) => {
        const ativo = button.dataset.value === theme;
        button.classList.toggle('is-active', ativo);
        button.setAttribute('aria-checked', String(ativo));
      });
    }

    const cancelar = onThemeChange((theme) => {
      // Se este seletor saiu da página (troca de tela), para de ouvir.
      if (!root.isConnected) {
        cancelar();
        return;
      }

      render(theme);
    });

    render();

    return root;
  }
};