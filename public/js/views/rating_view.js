// Estrelas de avaliação (0 a 5).
// - createReadOnly: só exibe (usado na galeria)
// - createInput: controle interativo (usado nos detalhes), com nota 0 explícita

const SVG_NS = 'http://www.w3.org/2000/svg';
const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

// Cria o desenho da estrela (SVG próprio: não depende da biblioteca de ícones).
function criarIconeDeEstrela() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('star-icon');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', STAR_PATH);
  svg.appendChild(path);

  return svg;
}

function criarEstrela(tag, valor) {
  const estrela = document.createElement(tag);
  estrela.className = 'star';
  estrela.dataset.value = String(valor);
  estrela.appendChild(criarIconeDeEstrela());
  return estrela;
}

export const ratingView = {
  // Linha de 5 estrelas somente leitura.
  createReadOnly(rating) {
    const nota = Number(rating) || 0;

    const linha = document.createElement('span');
    linha.className = 'rating-stars';
    linha.setAttribute('role', 'img');
    linha.setAttribute('aria-label', `Avaliação: ${nota} de 5`);

    for (let i = 1; i <= 5; i += 1) {
      const estrela = criarEstrela('span', i);
      estrela.classList.toggle('is-on', i <= nota);
      linha.appendChild(estrela);
    }

    return linha;
  },

  // Controle interativo.
  // onChange(nota) deve retornar uma Promise (salva no banco). Se falhar, a nota anterior volta.
  // nota: 0 a 5, ou null quando a avaliação é removida.
  createInput({ value = null, onChange, onError } = {}) {
    let atual = value;
    let ocupado = false;

    const raiz = document.createElement('div');
    raiz.className = 'rating-input';
    raiz.setAttribute('role', 'radiogroup');
    raiz.setAttribute('aria-label', 'Avaliação do livro');

    // Nota 0 explícita (não depende de deixar as estrelas vazias).
    const zero = document.createElement('button');
    zero.type = 'button';
    zero.className = 'rating-zero';
    zero.setAttribute('role', 'radio');
    zero.setAttribute('aria-label', 'Nota 0');
    zero.title = 'Nota 0';
    zero.textContent = '0';

    const linha = document.createElement('div');
    linha.className = 'rating-stars rating-stars-input';

    const estrelas = [];

    for (let i = 1; i <= 5; i += 1) {
      const estrela = criarEstrela('button', i);
      estrela.type = 'button';
      estrela.setAttribute('role', 'radio');
      estrela.setAttribute('aria-label', `${i} ${i === 1 ? 'estrela' : 'estrelas'}`);
      estrelas.push(estrela);
      linha.appendChild(estrela);
    }

    const texto = document.createElement('span');
    texto.className = 'rating-label';
    texto.setAttribute('aria-live', 'polite');

    const limpar = document.createElement('button');
    limpar.type = 'button';
    limpar.className = 'link-btn';
    limpar.textContent = 'Limpar';

    raiz.append(zero, linha, texto, limpar);

    // Pinta as estrelas até "ate" (a prévia do mouse usa isso).
    function pintar(ate) {
      estrelas.forEach((estrela) => {
        const ligada = Number(estrela.dataset.value) <= ate;
        estrela.classList.toggle('is-on', ligada);
      });
    }

    function render(previa = null) {
      pintar(previa ?? atual ?? 0);

      estrelas.forEach((estrela) => {
        estrela.setAttribute('aria-checked', String(Number(estrela.dataset.value) === atual));
      });

      zero.classList.toggle('is-selected', atual === 0);
      zero.setAttribute('aria-checked', String(atual === 0));

      texto.textContent = atual === null ? 'Sem avaliação' : `${atual} de 5`;
      limpar.hidden = atual === null;
    }

    async function definir(nova, estrelaClicada = null) {
      if (ocupado || nova === atual) {
        return;
      }

      const anterior = atual;

      ocupado = true;
      raiz.classList.add('is-busy');
      atual = nova;
      render();

      // Feedback visual ao selecionar.
      if (estrelaClicada) {
        estrelaClicada.classList.add('pop');
        estrelaClicada.addEventListener('animationend', () => estrelaClicada.classList.remove('pop'), { once: true });
      }

      try {
        if (typeof onChange === 'function') {
          await onChange(nova);
        }
      } catch (error) {
        // Não salvou: volta para a nota anterior.
        atual = anterior;
        render();

        if (typeof onError === 'function') {
          onError(error);
        }
      } finally {
        ocupado = false;
        raiz.classList.remove('is-busy');
      }
    }

    estrelas.forEach((estrela) => {
      const valor = Number(estrela.dataset.value);

      estrela.addEventListener('click', () => definir(valor, estrela));
      estrela.addEventListener('mouseenter', () => render(valor));
      estrela.addEventListener('focus', () => render(valor));
      estrela.addEventListener('blur', () => render());
    });

    linha.addEventListener('mouseleave', () => render());
    zero.addEventListener('click', () => definir(0));
    limpar.addEventListener('click', () => definir(null));

    render();

    return {
      element: raiz,
      getValue: () => atual
    };
  }
};