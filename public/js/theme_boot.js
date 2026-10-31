// Aplica o tema ANTES de a página ser desenhada (evita "piscar" entre claro e escuro).
// Script clássico e externo (não inline) para funcionar com a CSP sem 'unsafe-inline'.
// Mesma regra de js/services/theme_service.js: escolha salva > tema do sistema.
(function () {
  var theme = null;

  try {
    theme = localStorage.getItem('hibook-theme');
  } catch (error) {
    theme = null;
  }

  if (theme !== 'light' && theme !== 'dark') {
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    theme = prefersLight ? 'light' : 'dark';
  }

  document.documentElement.setAttribute('data-theme', theme);

  var meta = document.querySelector('meta[name="theme-color"]');

  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#f6f6f7' : '#0a0a0c');
  }
})();
