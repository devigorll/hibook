// Janela de detalhes do livro: capa, dados, avaliação, progresso e anotações.
// Quem salva no banco são as funções recebidas (onRate, onSaveProgress, notesApi),
// assim esta view só cuida da interface.

import { createDialog } from './modal_view.js';
import { ratingView } from './rating_view.js';
import { progressView, calculateProgress } from './progress_view.js';
import { setMessage } from './ui_helpers.js';

const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

// Descrições maiores que isto começam recolhidas (com "Ver mais").
const DESCRIPTION_COLLAPSE_LIMIT = 420;

// Situação da leitura, calculada com os dados que o livro já tem.
function getReadingStatus(book) {
  const progressInfo = calculateProgress(book.current_page, book.pages_count);

  if (progressInfo.hasTotal && progressInfo.current >= progressInfo.total) {
    return { text: 'Concluído', cssClass: 'is-done' };
  }

  if (progressInfo.current > 0) {
    const text = progressInfo.hasTotal ? `Lendo · ${progressInfo.percent}%` : `Lendo · pág. ${progressInfo.current}`;
    return { text, cssClass: 'is-active' };
  }

  return { text: 'Não iniciado', cssClass: '' };
}

export const bookDetailsView = {
  // onRate(livro, nota) e onSaveProgress(livro, pagina) retornam o livro atualizado.
  // notesApi: { list(livro), create(livro, dados), update(livro, nota, dados), remove(nota) }
  // confirmDelete(opcoes): confirmação usada ao excluir uma anotação
  // onClose({ changed }) é chamado ao fechar; changed = true se nota ou progresso mudaram.
  open({ book, listNames = [], onRate, onSaveProgress, notesApi, confirmDelete, onEdit, onDelete, onClose }) {
    const dialog = createDialog();

    let hasChanges = false; // nota ou progresso mudaram
    let isLeaving = false;   // fechando para abrir a edição (ela própria atualiza a tela depois)

    // modal--wide: janela larga no desktop e tela cheia no celular
    dialog.classList.add('modal--wide');
    dialog.setAttribute('aria-labelledby', 'bd-title');

    dialog.innerHTML = `
      <div class="modal-card book-details">
        <button type="button" class="bd-close" data-action="close" aria-label="Fechar detalhes">${ICON_CLOSE}</button>

        <div class="bd-scroll">
          <div class="bd-cover">
            <div class="bd-cover-frame"><img alt=""></div>
          </div>

          <div class="bd-main">
            <header class="bd-heading">
              <h2 class="bd-title" id="bd-title"></h2>
              <ul class="bd-facts" data-field="facts"></ul>
              <div class="chip-list" data-field="lists" aria-label="Listas do livro" hidden></div>
            </header>

            <section class="bd-about" data-field="about" hidden>
              <h3 class="section-title">Sobre o livro</h3>
              <p class="book-description" data-field="description"></p>
              <button type="button" class="link-btn" data-action="toggle-description" hidden>Ver mais</button>
            </section>

            <div class="bd-panels" data-slot="panels"></div>

            <p class="form-message bd-feedback" data-field="feedback" role="status"></p>
          </div>
        </div>

        <footer class="bd-actions">
          <button type="button" class="btn btn-outline btn-danger-outline" data-action="delete">
            <i data-lucide="trash-2" aria-hidden="true"></i>
            <span>Excluir</span>
          </button>

          <button type="button" class="btn btn-primary" data-action="edit">
            <i data-lucide="pencil" aria-hidden="true"></i>
            <span>Editar</span>
          </button>
        </footer>
      </div>
    `;

    const area = dialog.querySelector('.bd-scroll');
    const feedback = dialog.querySelector('[data-field="feedback"]');
    const factsList = dialog.querySelector('[data-field="facts"]');

    const showFeedback = (text, tone) => setMessage(feedback, text, tone);

    // Etiquetas: páginas e situação da leitura (refeitas quando o progresso muda).
    function renderFacts() {
      factsList.replaceChildren();

      if (book.pages_count) {
        const pagesItem = document.createElement('li');
        pagesItem.className = 'bd-fact';
        pagesItem.textContent = `${book.pages_count} ${book.pages_count === 1 ? 'página' : 'páginas'}`;
        factsList.appendChild(pagesItem);
      }

      const status = getReadingStatus(book);
      const readingItem = document.createElement('li');
      readingItem.className = `bd-fact ${status.cssClass}`.trim();
      readingItem.textContent = status.text;
      factsList.appendChild(readingItem);
    }

    // --- Dados básicos (textContent: nada de HTML vindo do usuário) ---
    const img = dialog.querySelector('.bd-cover img');
    img.src = book.cover_url;
    img.alt = `Capa do livro ${book.title}`;

    dialog.querySelector('.bd-title').textContent = book.title;
    renderFacts();

    if (listNames.length > 0) {
      const listsBox = dialog.querySelector('[data-field="lists"]');

      listNames.forEach((name) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = name;
        listsBox.appendChild(chip);
      });

      listsBox.hidden = false;
    }

    if (book.description) {
      const aboutSection = dialog.querySelector('[data-field="about"]');
      const descriptionEl = dialog.querySelector('[data-field="description"]');
      const toggleButton = dialog.querySelector('[data-action="toggle-description"]');

      descriptionEl.textContent = book.description;
      aboutSection.hidden = false;

      // Texto longo: começa recolhido, com "Ver mais".
      const lineBreaks = (book.description.match(/\n/g) || []).length;

      if (book.description.length > DESCRIPTION_COLLAPSE_LIMIT || lineBreaks > 6) {
        descriptionEl.classList.add('is-clamped');
        toggleButton.hidden = false;

        toggleButton.addEventListener('click', () => {
          const isCollapsed = descriptionEl.classList.toggle('is-clamped');
          toggleButton.textContent = isCollapsed ? 'Ver mais' : 'Ver menos';
        });
      }
    }

    // --- Avaliação ---
    const ratingSection = document.createElement('section');
    ratingSection.className = 'detail-section';

    const ratingTitle = document.createElement('h3');
    ratingTitle.className = 'section-title';
    ratingTitle.textContent = 'Avaliação';

    const ratingInput = ratingView.createInput({
      value: book.rating ?? null,
      onChange: async (newRating) => {
        const updatedBook = await onRate(book, newRating);

        // Mantém o objeto em memória igual ao banco (inclui book_lists, que não muda aqui).
        Object.assign(book, updatedBook);
        hasChanges = true;

        showFeedback(
          newRating === null ? 'Avaliação removida.' : `Avaliação salva: ${newRating} de 5.`,
          'success'
        );
      },
      onError: (error) => {
        console.error('Erro ao salvar a avaliação:', error);
        showFeedback(error?.message || 'Não foi possível salvar a avaliação.', 'error');
      }
    });

    ratingSection.append(ratingTitle, ratingInput.element);

    // --- Progresso ---
    const progressSection = progressView.createSection({
      book,
      onSave: async (page) => {
        const updatedBook = await onSaveProgress(book, page);

        Object.assign(book, updatedBook);
        hasChanges = true;

        renderFacts(); // a situação da leitura acompanha o progresso
        showFeedback('Página atual atualizada.', 'success');
      }
    });

    dialog.querySelector('[data-slot="panels"]').append(ratingSection, progressSection.element);

    // --- Anotações por página ---
    // Carregada à parte: se o arquivo faltar, o resto da janela continua funcionando.
    if (notesApi) {
      import('./notes_view.js')
        .then(({ notesView }) => {
          // Cada chamada já leva o livro DESTA janela (anotações de um livro nunca aparecem em outro).
          const notesSection = notesView.createSection({
            book,
            confirmDelete,
            api: {
              list: () => notesApi.list(book),
              create: (noteData) => notesApi.create(book, noteData),
              update: (note, noteData) => notesApi.update(book, note, noteData),
              remove: (note) => notesApi.remove(note)
            }
          });

          area.appendChild(notesSection.element);
        })
        .catch((error) => console.error('Não foi possível carregar as anotações:', error));
    }

    // --- Botões ---
    dialog.querySelector('[data-action="close"]').addEventListener('click', () => dialog.close());

    dialog.querySelector('[data-action="edit"]').addEventListener('click', () => {
      isLeaving = true;
      dialog.close();

      if (typeof onEdit === 'function') {
        onEdit(book);
      }
    });

    dialog.querySelector('[data-action="delete"]').addEventListener('click', () => {
      dialog.close();

      if (typeof onDelete === 'function') {
        onDelete(book);
      }
    });

    // Clique fora do cartão (no fundo escuro) fecha.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        dialog.close();
      }
    });

    dialog.addEventListener('close', () => {
      dialog.remove();

      if (!isLeaving && typeof onClose === 'function') {
        onClose({ changed: hasChanges });
      }
    });

    dialog.showModal();
    window.lucide?.createIcons?.();
  }
};
