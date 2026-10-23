import { authService } from '../services/auth_service.js';

export const authView = {
  // Desenha o formulário de login / cadastro dentro do container.
  // Quando o login der certo, o app.js reage via onAuthChange.
  renderAuthForm(container) {
    let modo = 'login';

    function desenhar() {
      const isLogin = modo === 'login';

      container.innerHTML = `
        <div class="form-card">
          <h3>${isLogin ? 'Entrar' : 'Criar conta'}</h3>
          <p class="form-subtitle">
            ${isLogin
              ? 'Acesse sua biblioteca pessoal.'
              : 'Crie sua conta para começar a organizar seus livros.'}
          </p>

          <form id="auth-form" novalidate>
            <div class="input-group">
              <label for="auth-email">E-mail</label>
              <input type="email" id="auth-email" autocomplete="email" required>
            </div>

            <div class="input-group">
              <label for="auth-password">Senha</label>
              <input type="password" id="auth-password" minlength="6" required
                autocomplete="${isLogin ? 'current-password' : 'new-password'}">
            </div>

            <p class="form-message" id="auth-message" role="status"></p>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="auth-submit">
                <span>${isLogin ? 'Entrar' : 'Criar conta'}</span>
              </button>
            </div>
          </form>

          <p class="auth-switch">
            ${isLogin ? 'Ainda não tem conta?' : 'Já tem conta?'}
            <button type="button" class="link-btn" id="auth-toggle">
              ${isLogin ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </div>
      `;

      const form = container.querySelector('#auth-form');
      const emailInput = container.querySelector('#auth-email');
      const passwordInput = container.querySelector('#auth-password');
      const message = container.querySelector('#auth-message');
      const submitBtn = container.querySelector('#auth-submit');

      function mostrarMensagem(texto, tipo) {
        message.textContent = texto;
        message.className = `form-message ${tipo === 'erro' ? 'error-text' : 'success-text'}`;
      }

      container.querySelector('#auth-toggle').addEventListener('click', () => {
        modo = isLogin ? 'signup' : 'login';
        desenhar();
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Evita envio duplicado enquanto processa.
        if (submitBtn.disabled) return;

        const email = emailInput.value.trim();
        const senha = passwordInput.value;

        if (!email || !emailInput.checkValidity()) {
          mostrarMensagem('Informe um e-mail válido.', 'erro');
          emailInput.focus();
          return;
        }

        if (senha.length < 6) {
          mostrarMensagem('A senha precisa ter pelo menos 6 caracteres.', 'erro');
          passwordInput.focus();
          return;
        }

        submitBtn.disabled = true;
        mostrarMensagem('', 'sucesso');

        try {
          if (isLogin) {
            await authService.signIn(email, senha);
          } else {
            const data = await authService.signUp(email, senha);

            // Sem sessão = o Supabase está pedindo confirmação por e-mail.
            if (!data.session) {
              mostrarMensagem('Conta criada! Confirme seu e-mail e depois faça login.', 'sucesso');
            }
          }
        } catch (error) {
          mostrarMensagem(error.message, 'erro');
        } finally {
          submitBtn.disabled = false;
        }
      });
    }

    desenhar();
  }
};
