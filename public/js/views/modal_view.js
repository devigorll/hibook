// Modais usando o elemento nativo <dialog>:
// já vem com foco preso, fecha com ESC e escurece o fundo.

export function criarDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  document.body.appendChild(dialog);
  return dialog;
}

export const modalView = {
  // Pergunta de confirmação. Retorna true (confirmou) ou false (cancelou).
  confirm({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
    return new Promise((resolve) => {
      const dialog = criarDialog();

      dialog.innerHTML = `
        <form method="dialog" class="modal-card">
          <h3 class="modal-title"></h3>
          <p class="modal-text"></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" data-action="cancel"></button>
            <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm"></button>
          </div>
        </form>
      `;

      // textContent evita inserir HTML a partir de nomes digitados pelo usuário.
      dialog.querySelector('.modal-title').textContent = title;
      dialog.querySelector('.modal-text').textContent = message;
      dialog.querySelector('[data-action="cancel"]').textContent = cancelText;
      dialog.querySelector('[data-action="confirm"]').textContent = confirmText;

      let confirmado = false;

      dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.close());
      dialog.querySelector('form').addEventListener('submit', () => {
        confirmado = true;
      });

      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(confirmado);
      });

      dialog.showModal();
      dialog.querySelector('[data-action="cancel"]').focus();
    });
  },

  // Campo de texto com salvar. O onSubmit faz o salvamento de verdade;
  // se lançar erro, a mensagem aparece dentro do modal e ele continua aberto.
  // Retorna true se salvou, false se cancelou.
  editText({ title, label, initialValue = '', confirmText = 'Salvar', maxLength = 60, onSubmit }) {
    return new Promise((resolve) => {
      const dialog = criarDialog();

      dialog.innerHTML = `
        <form class="modal-card" novalidate>
          <h3 class="modal-title"></h3>

          <div class="input-group">
            <label for="modal-input"></label>
            <input type="text" id="modal-input" autocomplete="off" required>
          </div>

          <p class="form-message" role="status"></p>

          <div class="modal-actions">
            <button type="button" class="btn btn-outline" data-action="cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary" data-action="confirm"></button>
          </div>
        </form>
      `;

      const form = dialog.querySelector('form');
      const input = dialog.querySelector('#modal-input');
      const message = dialog.querySelector('.form-message');
      const confirmBtn = dialog.querySelector('[data-action="confirm"]');

      dialog.querySelector('.modal-title').textContent = title;
      dialog.querySelector('label').textContent = label;
      confirmBtn.textContent = confirmText;
      input.value = initialValue;
      input.maxLength = maxLength;

      let salvou = false;

      function mostrarErro(texto) {
        message.textContent = texto;
        message.className = 'form-message error-text';
      }

      dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.close());

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Evita envio duplicado.
        if (confirmBtn.disabled) return;

        const valor = input.value.trim();

        if (!valor) {
          mostrarErro('Informe um nome.');
          input.focus();
          return;
        }

        // Sem mudança: apenas fecha.
        if (valor === initialValue.trim()) {
          dialog.close();
          return;
        }

        confirmBtn.disabled = true;
        message.textContent = '';

        try {
          if (typeof onSubmit === 'function') {
            await onSubmit(valor);
          }

          salvou = true;
          dialog.close();
        } catch (error) {
          mostrarErro(error?.message || 'Não foi possível salvar.');
          confirmBtn.disabled = false;
          input.focus();
        }
      });

      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(salvou);
      });

      dialog.showModal();
      input.focus();
      input.select();
    });
  }
};