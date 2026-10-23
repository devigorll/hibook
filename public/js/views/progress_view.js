// Progresso de leitura: cálculo, barra horizontal e controle "Atualizar página atual".

// Progresso (%) = (página atual / total de páginas) × 100
// Sem total de páginas (ou total 0) não há como calcular: evita divisão por zero.
export function calcularProgresso(paginaAtual, totalDePaginas) {
  const atual = Math.max(Number(paginaAtual) || 0, 0);
  const total = Number(totalDePaginas) || 0;

  if (total <= 0) {
    return { temTotal: false, atual, total: 0, percentual: 0, fracao: 0 };
  }

  const limitado = Math.min(atual, total);

  return {
    temTotal: true,
    atual: limitado,
    total,
    percentual: Math.round((limitado / total) * 100),
    fracao: limitado / total
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

    const texto = section.querySelector('[data-field="text"]');
    const percentual = section.querySelector('[data-field="percent"]');
    const dica = section.querySelector('[data-field="hint"]');
    const erro = section.querySelector('[data-field="error"]');
    const barra = section.querySelector('.progress-bar');
    const preenchimento = section.querySelector('.progress-fill');
    const form = section.querySelector('form');
    const input = section.querySelector('input');
    const botao = section.querySelector('button');
    const rotulo = botao.querySelector('span');

    function mostrarErro(mensagem) {
      erro.textContent = mensagem;
      erro.className = mensagem ? 'form-message error-text' : 'form-message';
    }

    // Redesenha tudo a partir dos dados atuais do livro.
    function render() {
      const progresso = calcularProgresso(book.current_page, book.pages_count);

      section.classList.toggle('is-complete', progresso.temTotal && progresso.percentual >= 100);
      input.value = progresso.atual > 0 ? String(progresso.atual) : '';

      if (progresso.temTotal) {
        texto.textContent = `Página ${progresso.atual} de ${progresso.total}`;
        percentual.textContent = `${progresso.percentual}%`;
        barra.setAttribute('aria-valuenow', String(progresso.percentual));
        input.max = String(progresso.total);
        dica.hidden = true;
      } else {
        texto.textContent = progresso.atual > 0 ? `Página ${progresso.atual}` : 'Leitura ainda não iniciada';
        percentual.textContent = '—';
        barra.removeAttribute('aria-valuenow');
        input.removeAttribute('max');
        dica.textContent = 'Cadastre o total de páginas do livro (em Editar) para ver a porcentagem.';
        dica.hidden = false;
      }

      // Dois quadros de animação: garante que a barra "cresça" a partir do valor anterior.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          preenchimento.style.width = `${progresso.fracao * 100}%`;
        });
      });
    }

    input.addEventListener('input', () => mostrarErro(''));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      // Evita envio duplicado.
      if (botao.disabled) return;

      const bruto = input.value.trim();
      const numero = Number(bruto);

      if (bruto === '' || !Number.isInteger(numero) || numero < 0) {
        mostrarErro('Informe um número de página válido (0 ou maior).');
        input.focus();
        return;
      }

      if (book.pages_count && numero > book.pages_count) {
        mostrarErro(`A página atual não pode ser maior que o total de páginas (${book.pages_count}).`);
        input.focus();
        return;
      }

      botao.disabled = true;
      rotulo.textContent = 'Salvando...';
      mostrarErro('');

      try {
        await onSave(numero);
        render();
      } catch (error) {
        console.error('Erro ao salvar o progresso:', error);
        mostrarErro(error?.message || 'Não foi possível salvar o progresso.');
      } finally {
        botao.disabled = false;
        rotulo.textContent = 'Atualizar página atual';
      }
    });

    render();

    return { element: section, refresh: render };
  }
};