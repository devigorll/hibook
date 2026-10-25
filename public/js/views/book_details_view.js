// Janela de detalhes do livro: capa, dados, avaliação, progresso e anotações.
// Quem salva no banco são as funções recebidas (onRate, onSaveProgress, notesApi),
// assim esta view só cuida da interface.

import { criarDialog } from './modal_view.js';
import { ratingView } from './rating_view.js';
import { progressView, calcularProgresso } from './progress_view.js';

const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

// Descrições maiores que isto começam recolhidas (com "Ver mais").
const LIMITE_DESCRICAO = 420;

// Situação da leitura, calculada com os dados que o livro já tem.
function situacaoDaLeitura(book) {
  const progresso = calcularProgresso(book.current_page, book.pages_count);

  if (progresso.temTotal && progresso.atual >= progresso.total) {
    return { texto: 'Concluído', classe: 'is-done' };
  }

  if (progresso.atual > 0) {
    const texto = progresso.temTotal ? `Lendo · ${progresso.percentual}%` : `Lendo · pág. ${progresso.atual}`;
    return { texto, classe: 'is-active' };
  }

  return { texto: 'Não iniciado', classe: '' };
}

export const bookDetailsView = {
  // onRate(livro, nota) e onSaveProgress(livro, pagina) retornam o livro atualizado.
  // notesApi: { list(livro), create(livro, dados), update(livro, nota, dados), remove(nota) }
  // confirmDelete(opcoes): confirmação usada ao excluir uma anotação
  // onClose({ changed }) é chamado ao fechar; changed = true se nota ou progresso mudaram.
  open({ book, listNames = [], onRate, onSaveProgress, notesApi, confirmDelete, onEdit, onDelete, onClose }) {
    const dialog = criarDialog();

    let alterado = false; // nota ou progresso mudaram
    let saindo = false;   // fechando para abrir a edição (ela própria atualiza a tela depois)

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
    const fatos = dialog.querySelector('[data-field="facts"]');

    function mostrarFeedback(texto, tipo) {
      feedback.textContent = texto;
      feedback.className = `form-message bd-feedback ${tipo === 'erro' ? 'error-text' : 'success-text'}`;
    }

    // Etiquetas: páginas e situação da leitura (refeitas quando o progresso muda).
    function desenharFatos() {
      fatos.replaceChildren();

      if (book.pages_count) {
        const paginas = document.createElement('li');
        paginas.className = 'bd-fact';
        paginas.textContent = `${book.pages_count} ${book.pages_count === 1 ? 'página' : 'páginas'}`;
        fatos.appendChild(paginas);
      }

      const situacao = situacaoDaLeitura(book);
      const leitura = document.createElement('li');
      leitura.className = `bd-fact ${situacao.classe}`.trim();
      leitura.textContent = situacao.texto;
      fatos.appendChild(leitura);
    }

    // ----- Dados básicos (textContent: nada de HTML vindo do usuário) -----
    const img = dialog.querySelector('.bd-cover img');
    img.src = book.cover_url;
    img.alt = `Capa do livro ${book.title}`;

    dialog.querySelector('.bd-title').textContent = book.title;
    desenharFatos();

    if (listNames.length > 0) {
      const listas = dialog.querySelector('[data-field="lists"]');

      listNames.forEach((nome) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = nome;
        listas.appendChild(chip);
      });

      listas.hidden = false;
    }

    if (book.description) {
      const sobre = dialog.querySelector('[data-field="about"]');
      const descricao = dialog.querySelector('[data-field="description"]');
      const alternar = dialog.querySelector('[data-action="toggle-description"]');

      descricao.textContent = book.description;
      sobre.hidden = false;

      // Texto longo: começa recolhido, com "Ver mais".
      const quebras = (book.description.match(/\n/g) || []).length;

      if (book.description.length > LIMITE_DESCRICAO || quebras > 6) {
        descricao.classList.add('is-clamped');
        alternar.hidden = false;

        alternar.addEventListener('click', () => {
          const recolhida = descricao.classList.toggle('is-clamped');
          alternar.textContent = recolhida ? 'Ver mais' : 'Ver menos';
        });
      }
    }

    // ----- Avaliação -----
    const secaoNota = document.createElement('section');
    secaoNota.className = 'detail-section';

    const tituloNota = document.createElement('h3');
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

        desenharFatos(); // a situação da leitura acompanha o progresso
        mostrarFeedback('Página atual atualizada.', 'sucesso');
      }
    });

    dialog.querySelector('[data-slot="panels"]').append(secaoNota, progresso.element);

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

          area.appendChild(notas.element);
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