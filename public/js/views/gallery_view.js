// Desenha a galeria (estilo Pinterest) e os estados de carregamento, vazio e erro.
// Não busca dados: quem busca é o app.js, usando o book_service.

import { ratingView } from './rating_view.js';
import { calcularProgresso } from './progress_view.js';

export const galleryView = {
  renderLoading(container) {
    container.innerHTML = `
      <div class="empty-state" role="status">
        <i data-lucide="loader-circle" class="spin-icon" aria-hidden="true"></i>
        <p>Carregando livros...</p>
      </div>
    `;
  },

  renderEmpty(container, { icon = 'book-open', title, text }) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="${icon}" aria-hidden="true"></i>
        <h3></h3>
        <p></p>
      </div>
    `;

    container.querySelector('h3').textContent = title;
    container.querySelector('p').textContent = text;
  },

  renderError(container, message, onRetry) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="alert-circle" aria-hidden="true"></i>
        <h3>Não foi possível carregar os livros</h3>
        <p></p>
        <button type="button" class="btn btn-outline" data-action="retry">
          <i data-lucide="refresh-cw" aria-hidden="true"></i>
          <span>Tentar novamente</span>
        </button>
      </div>
    `;

    container.querySelector('p').textContent = message;

    container.querySelector('[data-action="retry"]').addEventListener('click', () => {
      if (typeof onRetry === 'function') {
        onRetry();
      }
    });
  },

  // Desenha os cartões em colunas (masonry). onOpen(book) é chamado ao clicar.
  renderBooks(container, books, onOpen) {
    const grid = document.createElement('div');
    grid.className = 'masonry';

    books.forEach((book, indice) => {
      const item = document.createElement('div');
      item.className = 'book-item';
      // Atraso escalonado da animação de entrada (limitado para não demorar em listas grandes).
      item.style.setProperty('--i', String(Math.min(indice, 12)));

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'book-card';
      card.setAttribute('aria-label', `Abrir detalhes de ${book.title}`);

      const cover = document.createElement('span');
      cover.className = 'book-cover';

      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';

      // A imagem aparece suavemente quando termina de carregar.
      img.addEventListener('load', () => img.classList.add('is-loaded'));

      // Se a imagem não abrir, mostra um espaço reservado em vez de um ícone quebrado.
      img.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = 'book-cover-fallback';
        fallback.textContent = 'Capa indisponível';
        cover.replaceChildren(fallback);
      });

      img.src = book.cover_url;

      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('is-loaded');
      }

      cover.appendChild(img);

      // Barra fina de progresso na base da capa (só se o livro já foi iniciado e tem total).
      const progresso = calcularProgresso(book.current_page, book.pages_count);

      if (progresso.temTotal && progresso.atual > 0) {
        const barra = document.createElement('span');
        barra.className = 'book-progress';
        barra.setAttribute('aria-hidden', 'true');

        const preenchimento = document.createElement('span');
        preenchimento.style.width = `${progresso.fracao * 100}%`;

        barra.appendChild(preenchimento);
        cover.appendChild(barra);
      }

      const title = document.createElement('span');
      title.className = 'book-title';
      title.textContent = book.title;

      card.append(cover, title);

      // Estrelas só aparecem se o livro já foi avaliado (nota 0 também conta).
      if (book.rating !== null && book.rating !== undefined) {
        const nota = ratingView.createReadOnly(book.rating);
        nota.classList.add('book-rating');
        card.appendChild(nota);
      }

      card.addEventListener('click', () => {
        if (typeof onOpen === 'function') {
          onOpen(book);
        }
      });

      item.appendChild(card);
      grid.appendChild(item);
    });

    container.replaceChildren(grid);
  }
};