// Estrelas de avaliação (0 a 5).
// - createReadOnly: só exibe (usado na galeria)
// - createInput: controle interativo (usado nos detalhes), com nota 0 explícita

const SVG_NS = 'http://www.w3.org/2000/svg';
const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

// Cria o desenho da estrela (SVG próprio: não depende da biblioteca de ícones).
function createStarIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('star-icon');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', STAR_PATH);
  svg.appendChild(path);

  return svg;
}

function createStar(tag, value) {
  const star = document.createElement(tag);
  star.className = 'star';
  star.dataset.value = String(value);
  star.appendChild(createStarIcon());
  return star;
}

export const ratingView = {
  // Linha de 5 estrelas somente leitura.
  createReadOnly(rating) {
    const score = Number(rating) || 0;

    const row = document.createElement('span');
    row.className = 'rating-stars';
    row.setAttribute('role', 'img');
    row.setAttribute('aria-label', `Avaliação: ${score} de 5`);

    for (let i = 1; i <= 5; i += 1) {
      const star = createStar('span', i);
      star.classList.toggle('is-on', i <= score);
      row.appendChild(star);
    }

    return row;
  },

  // Controle interativo.
  // onChange(nota) deve retornar uma Promise (salva no banco). Se falhar, a nota anterior volta.
  // nota: 0 a 5, ou null quando a avaliação é removida.
  createInput({ value = null, onChange, onError } = {}) {
    let current = value;
    let isBusy = false;

    const root = document.createElement('div');
    root.className = 'rating-input';
    root.setAttribute('role', 'radiogroup');
    root.setAttribute('aria-label', 'Avaliação do livro');

    // Nota 0 explícita (não depende de deixar as estrelas vazias).
    const zero = document.createElement('button');
    zero.type = 'button';
    zero.className = 'rating-zero';
    zero.setAttribute('role', 'radio');
    zero.setAttribute('aria-label', 'Nota 0');
    zero.title = 'Nota 0';
    zero.textContent = '0';

    const row = document.createElement('div');
    row.className = 'rating-stars rating-stars-input';

    const stars = [];

    for (let i = 1; i <= 5; i += 1) {
      const star = createStar('button', i);
      star.type = 'button';
      star.setAttribute('role', 'radio');
      star.setAttribute('aria-label', `${i} ${i === 1 ? 'estrela' : 'estrelas'}`);
      stars.push(star);
      row.appendChild(star);
    }

    const label = document.createElement('span');
    label.className = 'rating-label';
    label.setAttribute('aria-live', 'polite');

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'link-btn';
    clearButton.textContent = 'Limpar';

    root.append(zero, row, label, clearButton);

    // Pinta as estrelas até a posição upTo (a prévia do mouse usa isso).
    function paintStars(upTo) {
      stars.forEach((star) => {
        const isOn = Number(star.dataset.value) <= upTo;
        star.classList.toggle('is-on', isOn);
      });
    }

    function render(preview = null) {
      paintStars(preview ?? current ?? 0);

      stars.forEach((star) => {
        star.setAttribute('aria-checked', String(Number(star.dataset.value) === current));
      });

      zero.classList.toggle('is-selected', current === 0);
      zero.setAttribute('aria-checked', String(current === 0));

      label.textContent = current === null ? 'Sem avaliação' : `${current} de 5`;
      clearButton.hidden = current === null;
    }

    async function applyRating(newValue, clickedStar = null) {
      if (isBusy || newValue === current) {
        return;
      }

      const previous = current;

      isBusy = true;
      root.classList.add('is-busy');
      current = newValue;
      render();

      // Feedback visual ao selecionar.
      if (clickedStar) {
        clickedStar.classList.add('pop');
        clickedStar.addEventListener('animationend', () => clickedStar.classList.remove('pop'), { once: true });
      }

      try {
        if (typeof onChange === 'function') {
          await onChange(newValue);
        }
      } catch (error) {
        // Não salvou: volta para a nota anterior.
        current = previous;
        render();

        if (typeof onError === 'function') {
          onError(error);
        }
      } finally {
        isBusy = false;
        root.classList.remove('is-busy');
      }
    }

    stars.forEach((star) => {
      const value = Number(star.dataset.value);

      star.addEventListener('click', () => applyRating(value, star));
      star.addEventListener('mouseenter', () => render(value));
      star.addEventListener('focus', () => render(value));
      star.addEventListener('blur', () => render());
    });

    row.addEventListener('mouseleave', () => render());
    zero.addEventListener('click', () => applyRating(0));
    clearButton.addEventListener('click', () => applyRating(null));

    render();

    return { element: root };
  }
};
