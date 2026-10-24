// Janela de detalhes do livro: capa, dados, avaliação e progresso de leitura.
// Quem salva no banco são as funções recebidas (onRate, onSaveProgress),
// assim esta view só cuida da interface.

import { criarDialog } from './modal_view.js';
import { ratingView } from './rating_view.js';
import { progressView } from './progress_view.js';

export const bookDetailsView = {
  // onRate(livro, nota) e onSaveProgress(livro, pagina) retornam o livro atualizado.
  // onClose({ changed }) é chamado ao fechar; changed = true se nota ou progresso mudaram.
  // notesApi: { list(livro), create(livro, dados), update(livro, nota, dados), remove(nota) }
  // confirmDelete(opcoes): confirmação usada ao excluir uma anotação
  open({ book, listNames = [], onRate, onSaveProgress, notesApi, confirmDelete, onEdit, onDelete, onClose }) {
    const dialog = criarDialog();

    let alterado = false; // nota ou progresso mudaram
    let saindo = false;   // fechando para abrir a edição (ela própria atualiza a tela depois)

    dialog.innerHTML = `
      <div class="modal-card book-details">
        <div class="book-details-cover">
          <img alt="">
        </div>

        <div class="book-details-info">
          <h3 class="modal-title"></h3>
          <p class="book-meta" data-field="pages" hidden></p>
          <div class="chip-list" data-field="lists" hidden></div>
          <p class="book-description" data-field="description" hidden></p>

          <p class="form-message" data-field="feedback" role="status"></p>

          <div class="modal-actions">
            <button type="button" class="btn btn-outline" data-action="close">Fechar</button>

            <button type="button" class="btn btn-outline" data-action="edit">
              <i data-lucide="pencil" aria-hidden="true"></i>
              <span>Editar</span>
            </button>

            <button type="button" class="btn btn-outline btn-danger-outline" data-action="delete">
              <i data-lucide="trash-2" aria-hidden="true"></i>
              <span>Excluir</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const info = dialog.querySelector('.book-details-info');
    const feedback = dialog.querySelector('[data-field="feedback"]');

    function mostrarFeedback(texto, tipo) {
      feedback.textContent = texto;
      feedback.className = `form-message ${tipo === 'erro' ? 'error-text' : 'success-text'}`;
    }

    // ----- Dados básicos (textContent: nada de HTML vindo do usuário) -----
    const img = dialog.querySelector('.book-details-cover img');
    img.src = book.cover_url;
    img.alt = `Capa do livro ${book.title}`;

    dialog.querySelector('.modal-title').textContent = book.title;

    if (book.pages_count) {
      const pages = dialog.querySelector('[data-field="pages"]');
      pages.textContent = `${book.pages_count} ${book.pages_count === 1 ? 'página' : 'páginas'}`;
      pages.hidden = false;
    }

    if (listNames.length > 0) {
      const lists = dialog.querySelector('[data-field="lists"]');

      listNames.forEach((nome) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = nome;
        lists.appendChild(chip);
      });

      lists.hidden = false;
    }

    if (book.description) {
      const description = dialog.querySelector('[data-field="description"]');
      description.textContent = book.description;
      description.hidden = false;
    }

    // ----- Avaliação -----
    const secaoNota = document.createElement('section');
    secaoNota.className = 'detail-section';

    const tituloNota = document.createElement('h4');
    tituloNota.className = 'section-title';
    tituloNota.textContent = 'Avaliação';

    const nota = ratingView.createInput({
      value: book.rating ?? null,
      onChange: async (novaNota) => {
        const atualizado = await onRate(book, novaNota);

        // Mantém o objeto em memória igual ao banco (inclui book_lists, que não muda aqui).
        Object.assign(book, atualizado);
        alterado = true;

        mostrarFeedback(
          novaNota === null ? 'Avaliação removida.' : `Avaliação salva: ${novaNota} de 5.`,
          'sucesso'
        );
      },
      onError: (error) => {
        console.error('Erro ao salvar a avaliação:', error);
        mostrarFeedback(error?.message || 'Não foi possível salvar a avaliação.', 'erro');
      }
    });

    secaoNota.append(tituloNota, nota.element);

    // ----- Progresso -----
    const progresso = progressView.createSection({
      book,
      onSave: async (pagina) => {
        const atualizado = await onSaveProgress(book, pagina);

        Object.assign(book, atualizado);
        alterado = true;

        mostrarFeedback('Página atual atualizada.', 'sucesso');
      }
    });

    info.insertBefore(secaoNota, feedback);
    info.insertBefore(progresso.element, feedback);

    // ----- Anotações por página -----
    // Carregada à parte: se o arquivo faltar, o resto da janela continua funcionando.
    if (notesApi) {
      import('./notes_view.js')
        .then(({ notesView }) => {
          // Cada chamada já leva o livro DESTA janela (anotações de um livro nunca aparecem em outro).
          const notas = notesView.createSection({
            book,
            confirmDelete,
            api: {
              list: () => notesApi.list(book),
              create: (dados) => notesApi.create(book, dados),
              update: (nota, dados) => notesApi.update(book, nota, dados),
              remove: (nota) => notesApi.remove(nota)
            }
          });

          dialog.querySelector('.book-details').appendChild(notas.element);
        })
        .catch((error) => console.error('Não foi possível carregar as anotações:', error));
    }

    // ----- Botões -----
    dialog.querySelector('[data-action="close"]').addEventListener('click', () => dialog.close());

    dialog.querySelector('[data-action="edit"]').addEventListener('click', () => {
      saindo = true;
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

      if (!saindo && typeof onClose === 'function') {
        onClose({ changed: alterado });
      }
    });

    dialog.showModal();
    window.lucide?.createIcons?.();
  }
};