import { authService, MIN_PASSWORD_LENGTH } from '../services/auth_service.js';
import { setMessage, withBusyButton } from './ui_helpers.js';

// ============================================================
// Ícones (SVG próprios: não dependem de biblioteca nem de rede)
// ============================================================
const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

const ICON_EYE = svg(
  '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>'
);
const ICON_EYE_OFF = svg(
  '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
);
const ICON_BOOK = svg(
  '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>'
);
const ICON_CHECK = svg('<polyline points="20 6 9 17 4 12"></polyline>');
const ICON_CHECK_CIRCLE = svg(
  '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
);
const ICON_ALERT = svg(
  '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
);

// Composição da tela: painel da marca + painel do formulário.
// O conteúdo do cartão (data-slot="card") muda conforme o modo.
const LAYOUT = `
  <div class="auth-layout">
    <aside class="auth-brand">
      <div class="auth-brand-logo">${ICON_BOOK}<span>HiBook</span></div>

      <div class="auth-brand-body">
        <p class="auth-tagline">Sua biblioteca pessoal, organizada como um mural.</p>
        <ul class="auth-features">
          <li>${ICON_CHECK}<span>Galeria visual com as capas dos seus livros</span></li>
          <li>${ICON_CHECK}<span>Listas personalizadas por tema</span></li>
          <li>${ICON_CHECK}<span>Avaliação e progresso de leitura</span></li>
        </ul>
      </div>

      <div class="auth-mosaic" aria-hidden="true">
        <span class="auth-tile"></span><span class="auth-tile"></span><span class="auth-tile"></span>
        <span class="auth-tile"></span><span class="auth-tile"></span><span class="auth-tile"></span>
      </div>
    </aside>

    <section class="auth-panel">
      <div class="auth-theme" data-slot="theme"></div>
      <div class="auth-card" data-slot="card"></div>
    </section>
  </div>
`;

function passwordField(id, autocomplete) {
  return `
    <div class="password-field">
      <input type="password" id="${id}" autocomplete="${autocomplete}" required>
      <button type="button" class="password-toggle" aria-label="Mostrar senha" aria-pressed="false">${ICON_EYE}</button>
    </div>
  `;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const COOLDOWN_SECONDS = 60;

export const authView = {
  // Desenha as telas de autenticação.
  // mode: 'login' | 'signup' | 'forgot' | 'reset'
  // notice: aviso de sucesso exibido no login (ex.: senha atualizada)
  // linkError: link do e-mail inválido ou expirado (mostra a tela de erro)
  // onRecoveryFinished({ updated }): o app é avisado ao terminar a redefinição de senha
  renderAuthForm(container, { mode = 'login', notice = null, linkError = null, onRecoveryFinished } = {}) {
    container.innerHTML = LAYOUT;

    const card = container.querySelector('[data-slot="card"]');
    let cooldownTimer = null;

    // O seletor de tema também aparece aqui (carregado à parte: se falhar, o login continua funcionando).
    import('./theme_view.js')
      .then(({ themeView }) => {
        const slot = container.querySelector('[data-slot="theme"]');

        if (slot) {
          slot.appendChild(themeView.createSwitch());
        }
      })
      .catch((error) => console.warn('Seletor de tema indisponível na tela de login:', error));

    // --- utilitários da tela ---
    function stopCooldown() {
      if (cooldownTimer) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }

    function wirePasswordToggles() {
      card.querySelectorAll('.password-toggle').forEach((button) => {
        const input = button.parentElement.querySelector('input');

        button.addEventListener('click', () => {
          const isVisible = input.type === 'text';

          input.type = isVisible ? 'password' : 'text';
          button.innerHTML = isVisible ? ICON_EYE : ICON_EYE_OFF;
          button.setAttribute('aria-label', isVisible ? 'Mostrar senha' : 'Ocultar senha');
          button.setAttribute('aria-pressed', String(!isVisible));
        });
      });
    }

    // Aviso no topo do cartão (success | error).
    function showAlert(tone, text) {
      const element = card.querySelector('[data-field="notice"]');

      if (!element) {
        return;
      }

      element.textContent = text;
      element.className = `auth-alert is-${tone}`;
      element.hidden = !text;
    }

    // Mensagem de erro logo acima do botão.
    function showFormError(text) {
      setMessage(card.querySelector('[data-field="message"]'), text, 'error');
    }

    function finishRender({ focus, email }) {
      wirePasswordToggles();

      const emailField = card.querySelector('#auth-email');

      if (emailField && email) {
        emailField.value = email;
      }

      if (focus) {
        card.querySelector('input')?.focus();
      }
    }

    // ============================================================
    // Modo: login
    // ============================================================
    function renderLogin(extras = {}) {
      card.innerHTML = `
        <h1 class="auth-title">Entrar</h1>
        <p class="auth-subtitle">Acesse sua biblioteca pessoal.</p>

        <div class="auth-alert" data-field="notice" role="status" hidden></div>

        <form novalidate>
          <div class="input-group">
            <label for="auth-email">E-mail</label>
            <input type="email" id="auth-email" autocomplete="email" inputmode="email" required>
          </div>

          <div class="input-group">
            <div class="field-row">
              <label for="auth-password">Senha</label>
              <button type="button" class="link-btn" data-action="forgot">Esqueci minha senha</button>
            </div>
            ${passwordField('auth-password', 'current-password')}
          </div>

          <p class="form-message" data-field="message" role="alert"></p>

          <button type="submit" class="btn btn-primary btn-block"><span>Entrar</span></button>
        </form>

        <p class="auth-switch">
          Ainda não tem conta?
          <button type="button" class="link-btn" data-action="signup">Criar conta</button>
        </p>
      `;

      finishRender(extras);

      if (extras.notice) {
        showAlert('success', extras.notice);
      }

      const form = card.querySelector('form');
      const emailInput = card.querySelector('#auth-email');
      const passwordInput = card.querySelector('#auth-password');
      const button = card.querySelector('button[type="submit"]');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (button.disabled) return;

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!isValidEmail(email)) {
          showFormError('Informe um e-mail válido.');
          emailInput.focus();
          return;
        }

        if (!password) {
          showFormError('Informe sua senha.');
          passwordInput.focus();
          return;
        }

        showFormError('');

        try {
          // Se der certo, o app percebe o login (onAuthChange) e troca a tela.
          await withBusyButton(button, 'Entrando...', () => authService.signIn(email, password));
        } catch (error) {
          showFormError(error.message);
        }
      });
    }

    // ============================================================
    // Modo: cadastro
    // ============================================================
    function renderSignup(extras = {}) {
      card.innerHTML = `
        <h1 class="auth-title">Criar conta</h1>
        <p class="auth-subtitle">Crie sua conta para começar a organizar seus livros.</p>

        <div class="auth-alert" data-field="notice" role="status" hidden></div>

        <form novalidate>
          <div class="input-group">
            <label for="auth-email">E-mail</label>
            <input type="email" id="auth-email" autocomplete="email" inputmode="email" required>
          </div>

          <div class="input-group">
            <label for="auth-password">Senha</label>
            ${passwordField('auth-password', 'new-password')}
            <span class="field-hint">Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.</span>
          </div>

          <p class="form-message" data-field="message" role="alert"></p>

          <button type="submit" class="btn btn-primary btn-block"><span>Criar conta</span></button>
        </form>

        <p class="auth-switch">
          Já tem conta?
          <button type="button" class="link-btn" data-action="login">Entrar</button>
        </p>
      `;

      finishRender(extras);

      const form = card.querySelector('form');
      const emailInput = card.querySelector('#auth-email');
      const passwordInput = card.querySelector('#auth-password');
      const button = card.querySelector('button[type="submit"]');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (button.disabled) return;

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!isValidEmail(email)) {
          showFormError('Informe um e-mail válido.');
          emailInput.focus();
          return;
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
          showFormError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
          passwordInput.focus();
          return;
        }

        showFormError('');
        showAlert('success', '');

        try {
          const result = await withBusyButton(button, 'Criando conta...', () => authService.signUp(email, password));

          // Sem sessão = o Supabase está pedindo confirmação por e-mail.
          if (!result.session) {
            showAlert(
              'success',
              'Conta criada! Enviamos um e-mail de confirmação. Abra o link para ativar a conta e depois faça login.'
            );
          }
        } catch (error) {
          showFormError(error.message);
        }
      });
    }

    // ============================================================
    // Modo: esqueci minha senha
    // ============================================================
    function renderForgot(extras = {}) {
      card.innerHTML = `
        <h1 class="auth-title">Recuperar senha</h1>
        <p class="auth-subtitle">
          Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.
        </p>

        <div class="auth-alert" data-field="notice" role="status" hidden></div>

        <form novalidate>
          <div class="input-group">
            <label for="auth-email">E-mail</label>
            <input type="email" id="auth-email" autocomplete="email" inputmode="email" required>
          </div>

          <p class="form-message" data-field="message" role="alert"></p>

          <button type="submit" class="btn btn-primary btn-block"><span>Enviar link de recuperação</span></button>
        </form>

        <button type="button" class="link-btn auth-back" data-action="login">Voltar ao login</button>
      `;

      finishRender(extras);

      const form = card.querySelector('form');
      const emailInput = card.querySelector('#auth-email');
      const button = card.querySelector('button[type="submit"]');
      const label = button.querySelector('span');

      // Depois de enviar, espera 60 s antes de permitir outro envio (o Supabase limita a frequência).
      function startCooldown() {
        let secondsLeft = COOLDOWN_SECONDS;

        button.disabled = true;
        label.textContent = `Reenviar em ${secondsLeft}s`;

        cooldownTimer = setInterval(() => {
          secondsLeft -= 1;

          if (secondsLeft <= 0) {
            stopCooldown();
            button.disabled = false;
            label.textContent = 'Enviar novamente';
            return;
          }

          label.textContent = `Reenviar em ${secondsLeft}s`;
        }, 1000);
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (button.disabled) return;

        const email = emailInput.value.trim();

        if (!isValidEmail(email)) {
          showFormError('Informe um e-mail válido.');
          emailInput.focus();
          return;
        }

        showFormError('');
        showAlert('success', '');

        try {
          await withBusyButton(button, 'Enviando...', () => authService.requestPasswordReset(email));

          // Mesma resposta exista ou não uma conta com este e-mail (não revela quem tem cadastro).
          showAlert(
            'success',
            'Se existir uma conta com este e-mail, enviamos um link para redefinir a senha. ' +
              'Confira também a caixa de spam.'
          );

          startCooldown();
        } catch (error) {
          showFormError(error.message);
        }
      });
    }

    // ============================================================
    // Modo: definir nova senha (depois de abrir o link do e-mail)
    // ============================================================
    function renderReset(extras = {}) {
      card.innerHTML = `
        <h1 class="auth-title">Definir nova senha</h1>
        <p class="auth-subtitle">Escolha uma senha nova para a sua conta.</p>

        <form novalidate>
          <div class="input-group">
            <label for="auth-new-password">Nova senha</label>
            ${passwordField('auth-new-password', 'new-password')}
            <span class="field-hint">Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.</span>
          </div>

          <div class="input-group">
            <label for="auth-confirm-password">Confirmar nova senha</label>
            ${passwordField('auth-confirm-password', 'new-password')}
          </div>

          <p class="form-message" data-field="message" role="alert"></p>

          <button type="submit" class="btn btn-primary btn-block"><span>Salvar nova senha</span></button>
        </form>

        <button type="button" class="link-btn auth-back" data-action="cancel-reset">Cancelar</button>
      `;

      finishRender(extras);

      const form = card.querySelector('form');
      const newPasswordInput = card.querySelector('#auth-new-password');
      const confirmInput = card.querySelector('#auth-confirm-password');
      const button = card.querySelector('button[type="submit"]');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (button.disabled) return;

        const newPassword = newPasswordInput.value;
        const confirmation = confirmInput.value;

        if (newPassword.length < MIN_PASSWORD_LENGTH) {
          showFormError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
          newPasswordInput.focus();
          return;
        }

        if (newPassword !== confirmation) {
          showFormError('As senhas não coincidem.');
          confirmInput.focus();
          return;
        }

        showFormError('');

        try {
          await withBusyButton(button, 'Salvando...', () => authService.updatePassword(newPassword));

          // Encerra a sessão temporária do link: o usuário entra de novo com a senha nova.
          try {
            await authService.signOut();
          } catch (error) {
            console.warn('Não foi possível encerrar a sessão temporária:', error);
          }

          renderResetDone();
        } catch (error) {
          if (error.code === 'session_missing') {
            renderLinkError();
            return;
          }

          showFormError(error.message);
        }
      });
    }

    function renderResetDone() {
      card.innerHTML = `
        <div class="auth-result">
          <span class="auth-result-icon">${ICON_CHECK_CIRCLE}</span>
          <h1 class="auth-title">Senha atualizada</h1>
          <p class="auth-subtitle">Sua senha foi alterada com sucesso. Entre com a nova senha.</p>
          <button type="button" class="btn btn-primary btn-block" data-action="finish">
            <span>Voltar ao login</span>
          </button>
        </div>
      `;
    }

    // ============================================================
    // Modo: link inválido, expirado ou já usado
    // ============================================================
    function renderLinkError() {
      card.innerHTML = `
        <div class="auth-result">
          <span class="auth-result-icon is-error">${ICON_ALERT}</span>
          <h1 class="auth-title">Link inválido ou expirado</h1>
          <p class="auth-subtitle">
            Este link expirou, é inválido ou já foi usado. Peça um novo link para continuar.
          </p>
          <button type="button" class="btn btn-primary btn-block" data-action="forgot">
            <span>Solicitar novo link</span>
          </button>
          <button type="button" class="link-btn auth-back" data-action="login">Voltar ao login</button>
        </div>
      `;
    }

    // ============================================================
    // Navegação entre os modos
    // ============================================================
    const renderers = {
      login: renderLogin,
      signup: renderSignup,
      forgot: renderForgot,
      reset: renderReset
    };

    function showMode(newMode, extras = {}) {
      stopCooldown();
      (renderers[newMode] ?? renderLogin)(extras);
    }

    function finishRecovery(updated) {
      if (typeof onRecoveryFinished === 'function') {
        onRecoveryFinished({ updated: updated });
      } else {
        showMode('login', {
          focus: true,
          notice: updated ? 'Senha atualizada com sucesso. Entre com a nova senha.' : null
        });
      }
    }

    // Um único ouvinte para todos os botões de ação (o conteúdo do cartão muda, o cartão não).
    card.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');

      if (!button) {
        return;
      }

      const action = button.dataset.action;
      const email = card.querySelector('#auth-email')?.value.trim() ?? '';

      if (action === 'login' || action === 'signup' || action === 'forgot') {
        showMode(action, { email, focus: true });
      } else if (action === 'cancel-reset') {
        try {
          await authService.signOut();
        } catch (error) {
          console.warn('Não foi possível encerrar a sessão temporária:', error);
        }

        finishRecovery(false);
      } else if (action === 'finish') {
        finishRecovery(true);
      }
    });

    // --- tela inicial ---
    if (linkError) {
      renderLinkError();
    } else {
      showMode(mode, { notice });
    }
  }
};
