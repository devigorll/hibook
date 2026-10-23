// Tema da interface (claro / escuro).
// - Guarda a escolha do usuário no localStorage (sem banco de dados: é só uma preferência visual).
// - Sem escolha salva, segue o tema do sistema operacional.
// - O index.html aplica o tema ANTES de a página ser desenhada (evita "piscar");
//   este arquivo cuida das trocas depois que a página carregou.
// A chave e a regra de decisão precisam ser iguais às do script do index.html.

const STORAGE_KEY = 'hibook-theme';
const THEME_COLORS = { dark: '#0a0a0c', light: '#f6f6f7' }; // cor da barra do navegador no celular

const systemQuery = window.matchMedia('(prefers-color-scheme: light)');
const listeners = new Set();
let started = false;

// Lê a escolha salva ('light', 'dark' ou null se o usuário nunca escolheu).
function readChoice() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch (error) {
    // localStorage pode estar bloqueado (modo privado): segue sem persistir.
    return null;
  }
}

function systemTheme() {
  return systemQuery.matches ? 'light' : 'dark';
}

// Tema em uso agora.
export function getTheme() {
  return readChoice() ?? systemTheme();
}

// true se o usuário já escolheu um tema manualmente.
export function hasExplicitChoice() {
  return readChoice() !== null;
}

function apply(theme, { animate }) {
  const root = document.documentElement;

  if (animate) {
    // Suaviza a troca de cores por um instante (desligado se o usuário prefere menos movimento).
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 350);
  }

  root.setAttribute('data-theme', theme);

  const meta = document.querySelector('meta[name="theme-color"]');

  if (meta) {
    meta.setAttribute('content', THEME_COLORS[theme]);
  }
}

function notify(theme) {
  listeners.forEach((callback) => callback(theme));
}

// Define o tema e guarda a escolha.
export function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') {
    throw new Error(`Tema inválido: ${theme}`);
  }

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    console.warn('Não foi possível salvar a preferência de tema:', error);
  }

  apply(theme, { animate: true });
  notify(theme);
}

// Chama callback(tema) sempre que o tema mudar. Retorna a função para cancelar.
export function onThemeChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// Liga os "ouvintes" globais (uma única vez):
// - o sistema operacional mudou de tema e o usuário não escolheu nenhum;
// - o tema foi trocado em outra aba aberta do app.
export function startThemeSync() {
  if (started) {
    return;
  }

  started = true;

  apply(getTheme(), { animate: false });

  systemQuery.addEventListener('change', () => {
    if (!hasExplicitChoice()) {
      const theme = systemTheme();
      apply(theme, { animate: true });
      notify(theme);
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      const theme = getTheme();
      apply(theme, { animate: true });
      notify(theme);
    }
  });
}