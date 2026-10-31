import { setMessage, withBusyButton } from './ui_helpers.js';

// Progresso de leitura: cálculo, barra horizontal e controle "Atualizar página atual".

// Progresso (%) = (página atual / total de páginas) × 100
// Sem total de páginas (ou total 0) não há como calcular: evita divisão por zero.
export function calculateProgress(currentPage, totalPages) {
  const current = Math.max(Number(currentPage) || 0, 0);
  const total = Number(totalPages) || 0;

  if (total <= 0) {
    return { hasTotal: false, current, total: 0, percent: 0, fraction: 0 };
  }

  const clamped = Math.min(current, total);

  return {
    hasTotal: true,
    current: clamped,
    total,
    percent: Math.round((clamped / total) * 100),
    fraction: clamped / total
  };
}

export const progressView = {
  // Retorna a seção pronta. Ela lê os dados de "book" (o objeto é atualizado por quem chama).
  // onSave(pagina) deve retornar uma Promise que salva no banco.
  createSection({ book, onSave }) {
    const section = document.createElement('section');
    section.className = 'detail-section progress-section';

    section.innerHTML = `
      <h4 class="section-title">Progresso da leitura</h4>

      <div class="progress-header">
        <span class="progress-text" data-field="text"></span>
        <span class="progress-percent" data-field="percent"></span>
      </div>

      <div class="progress-bar" role="progressbar" aria-label="Progresso da leitura"
        aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill"></div>
      </div>

      <p class="field-hint" data-field="hint" hidden></p>

      <form class="inline-form" novalidate>
        <input type="number" min="0" step="1" inputmode="numeric"
          aria-label="Página atual" placeholder="Página atual">
        <button type="submit" class="btn btn-outline">
          <span>Atualizar página atual</span>
        </button>
      </form>

      <p class="form-message" data-field="error" role="alert"></p>
    `;

    const textElement = section.querySelector('[data-field="text"]');
    const percent = section.querySelector('[data-field="percent"]');
    const hint = section.querySelector('[data-field="hint"]');
    const errorElement = section.querySelector('[data-field="error"]');
    const progressBar = section.querySelector('.progress-bar');
    const fill = section.querySelector('.progress-fill');
    const form = section.querySelector('form');
    const input = section.querySelector('input');
    const button = section.querySelector('button');

    const showError = (text) => setMessage(errorElement, text, 'error');

    // Redesenha tudo a partir dos dados atuais do livro.
    function render() {
      const progress = calculateProgress(book.current_page, book.pages_count);

      section.classList.toggle('is-complete', progress.hasTotal && progress.percent >= 100);
      input.value = progress.current > 0 ? String(progress.current) : '';

      if (progress.hasTotal) {
        textElement.textContent = `Página ${progress.current} de ${progress.total}`;
        percent.textContent = `${progress.percent}%`;
        progressBar.setAttribute('aria-valuenow', String(progress.percent));
        input.max = String(progress.total);
        hint.hidden = true;
      } else {
        textElement.textContent = progress.current > 0 ? `Página ${progress.current}` : 'Leitura ainda não iniciada';
        percent.textContent = '—';
        progressBar.removeAttribute('aria-valuenow');
        input.removeAttribute('max');
        hint.textContent = 'Cadastre o total de páginas do livro (em Editar) para ver a porcentagem.';
        hint.hidden = false;
      }

      // Dois quadros de animação: garante que a barra "cresça" a partir do valor anterior.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.width = `${progress.fraction * 100}%`;
        });
      });
    }

    input.addEventListener('input', () => showError(''));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      // Evita envio duplicado.
      if (button.disabled) return;

      const rawValue = input.value.trim();
      const pageNumber = Number(rawValue);

      if (rawValue === '' || !Number.isInteger(pageNumber) || pageNumber < 0) {
        showError('Informe um número de página válido (0 ou maior).');
        input.focus();
        return;
      }

      if (book.pages_count && pageNumber > book.pages_count) {
        showError(`A página atual não pode ser maior que o total de páginas (${book.pages_count}).`);
        input.focus();
        return;
      }

      showError('');

      try {
        await withBusyButton(button, 'Salvando...', async () => {
          await onSave(pageNumber);
          render();
        });
      } catch (error) {
        console.error('Erro ao salvar o progresso:', error);
        showError(error?.message || 'Não foi possível salvar o progresso.');
      }
    });

    render();

    return { element: section };
  }
};
