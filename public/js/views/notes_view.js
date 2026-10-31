import { setMessage, withBusyButton } from './ui_helpers.js';

// Seção "Anotações" da janela de detalhes do livro.
// Só desenha a interface: quem fala com o banco são as funções de "api" recebidas
// (veja o app.js), que sempre trabalham com o livro desta janela.

// Ordem crescente de página; na mesma página, a mais antiga primeiro.
function sortNotes(notes) {
  return [...notes].sort((a, b) => a.page - b.page || String(a.created_at).localeCompare(String(b.created_at)));
}

export const notesView = {
  // api: { list(), create(dados), update(nota, dados), remove(nota) }
  // confirmDelete(opcoes): abre a confirmação e retorna true/false
  createSection({ book, api, confirmDelete }) {
    const total = book.pages_count || null;
    let notes = [];
    let editingNote = null; // anotação em edição (null = criando uma nova)

    const section = document.createElement('section');
    section.className = 'detail-section notes-section';

    section.innerHTML = `
      <div class="notes-header">
        <h4 class="section-title">Anotações <span class="notes-count" data-field="count"></span></h4>
        <button type="button" class="btn btn-outline" data-action="new-note">
          <span>Adicionar anotação</span>
        </button>
      </div>

      <form class="note-form" novalidate hidden>
        <h5 class="note-form-title" data-field="form-title">Nova anotação</h5>

        <div class="note-form-row">
          <div class="input-group">
            <label for="note-title">Título *</label>
            <input type="text" id="note-title" maxlength="120" autocomplete="off" required>
          </div>

          <div class="input-group">
            <label for="note-page">Página *</label>
            <input type="number" id="note-page" min="1" step="1" inputmode="numeric" required>
            <span class="field-hint" data-field="page-hint"></span>
          </div>
        </div>

        <div class="input-group">
          <label for="note-content">Comentário *</label>
          <textarea id="note-content" rows="4" maxlength="5000" required></textarea>
        </div>

        <p class="form-message" data-field="form-message" role="alert"></p>

        <div class="note-form-actions">
          <button type="button" class="btn btn-outline" data-action="cancel-note">Cancelar</button>
          <button type="submit" class="btn btn-primary"><span>Salvar anotação</span></button>
        </div>
      </form>

      <p class="form-message" data-field="status" role="status"></p>

      <div data-field="list-area"></div>
    `;

    const newNoteButton = section.querySelector('[data-action="new-note"]');
    const counter = section.querySelector('[data-field="count"]');
    const form = section.querySelector('form');
    const formTitle = section.querySelector('[data-field="form-title"]');
    const titleInput = section.querySelector('#note-title');
    const pageInput = section.querySelector('#note-page');
    const contentInput = section.querySelector('#note-content');
    const pageHint = section.querySelector('[data-field="page-hint"]');
    const formMessage = section.querySelector('[data-field="form-message"]');
    const status = section.querySelector('[data-field="status"]');
    const area = section.querySelector('[data-field="list-area"]');
    const saveButton = form.querySelector('button[type="submit"]');
    const saveLabel = saveButton.querySelector('span');

    // A página só pode ir até o total de páginas do livro (se ele tiver total cadastrado).
    if (total) {
      pageInput.max = String(total);
      pageHint.textContent = `De 1 a ${total}.`;
    } else {
      pageHint.textContent = 'O livro não tem total de páginas cadastrado.';
    }

    // --- mensagens ---
    const showStatus = (text, tone = 'success') => setMessage(status, text, tone);
    const showFormError = (text) => setMessage(formMessage, text, 'error');

    // --- lista ---
    function renderSimpleState(className, text) {
      const block = document.createElement('p');
      block.className = className;
      block.textContent = text;
      area.replaceChildren(block);
    }

    function createItem(note) {
      const item = document.createElement('li');
      item.className = 'note-item';
      item.dataset.noteId = note.id;

      if (editingNote && editingNote.id === note.id) {
        item.classList.add('is-editing');
      }

      const head = document.createElement('div');
      head.className = 'note-item-head';

      const pageBadge = document.createElement('span');
      pageBadge.className = 'note-page';
      pageBadge.textContent = `Pág. ${note.page}`;

      const titleEl = document.createElement('span');
      titleEl.className = 'note-title';
      titleEl.textContent = note.title;

      const actionsBox = document.createElement('div');
      actionsBox.className = 'note-actions';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'note-action';
      editButton.dataset.action = 'edit-note';
      editButton.textContent = 'Editar';
      editButton.setAttribute('aria-label', `Editar anotação ${note.title}`);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'note-action is-danger';
      deleteButton.dataset.action = 'delete-note';
      deleteButton.textContent = 'Excluir';
      deleteButton.setAttribute('aria-label', `Excluir anotação ${note.title}`);

      actionsBox.append(editButton, deleteButton);
      head.append(pageBadge, titleEl, actionsBox);

      const commentEl = document.createElement('p');
      commentEl.className = 'note-content';
      commentEl.textContent = note.content;

      item.append(head, commentEl);
      return item;
    }

    function renderList() {
      counter.textContent = `(${notes.length})`;

      if (notes.length === 0) {
        renderSimpleState(
          'note-empty',
          'Nenhuma anotação ainda. Registre trechos e ideias ligados a uma página do livro.'
        );
        return;
      }

      const listEl = document.createElement('ul');
      listEl.className = 'note-list';
      notes.forEach((note) => listEl.appendChild(createItem(note)));
      area.replaceChildren(listEl);
    }

    async function load() {
      counter.textContent = '';

      const loadingBlock = document.createElement('p');
      loadingBlock.className = 'note-loading';
      loadingBlock.setAttribute('role', 'status');

      const spinner = document.createElement('span');
      spinner.className = 'note-spinner';

      const loadingText = document.createElement('span');
      loadingText.textContent = 'Carregando anotações...';

      loadingBlock.append(spinner, loadingText);
      area.replaceChildren(loadingBlock);

      try {
        const loadedNotes = await api.list();

        // Segurança extra: só entram anotações deste livro.
        notes = sortNotes(loadedNotes.filter((note) => note.book_id === book.id));
        renderList();
      } catch (error) {
        console.error('Erro ao carregar anotações:', error);

        const block = document.createElement('div');
        block.className = 'note-empty';

        const messageText = document.createElement('p');
        messageText.className = 'error-text';
        messageText.textContent = error?.message || 'Não foi possível carregar as anotações.';

        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.className = 'btn btn-outline';
        retryButton.textContent = 'Tentar novamente';
        retryButton.addEventListener('click', load);

        block.append(messageText, retryButton);
        area.replaceChildren(block);
      }
    }

    // --- formulário (usado para criar e para editar) ---
    function openForm(note = null) {
      editingNote = note;

      formTitle.textContent = note ? 'Editar anotação' : 'Nova anotação';
      saveLabel.textContent = note ? 'Salvar alterações' : 'Salvar anotação';

      titleInput.value = note?.title ?? '';
      pageInput.value = note ? String(note.page) : '';
      contentInput.value = note?.content ?? '';

      showFormError('');
      showStatus('');

      form.hidden = false;
      newNoteButton.hidden = true;

      if (notes.length > 0) {
        renderList(); // destaca a anotação em edição
      }

      form.scrollIntoView({ block: 'nearest' });
      titleInput.focus();
    }

    function closeForm() {
      editingNote = null;
      form.hidden = true;
      newNoteButton.hidden = false;
      form.reset();
      showFormError('');

      if (notes.length > 0) {
        renderList();
      }
    }

    newNoteButton.addEventListener('click', () => openForm());
    section.querySelector('[data-action="cancel-note"]').addEventListener('click', closeForm);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      // Evita envio duplicado enquanto salva.
      if (saveButton.disabled) return;

      const noteData = {
        title: titleInput.value,
        page: pageInput.value,
        content: contentInput.value
      };

      showFormError('');

      try {
        await withBusyButton(saveButton, 'Salvando...', async () => {
          let messageText;

          if (editingNote) {
            const updatedNote = await api.update(editingNote, noteData);
            notes = sortNotes(notes.map((note) => (note.id === updatedNote.id ? updatedNote : note)));
            messageText = 'Anotação atualizada.';
          } else {
            const createdNote = await api.create(noteData);
            notes = sortNotes([...notes, createdNote]);
            messageText = 'Anotação salva.';
          }

          closeForm();
          renderList();
          showStatus(messageText);
        });
      } catch (error) {
        console.error('Erro ao salvar anotação:', error);
        showFormError(error?.message || 'Não foi possível salvar a anotação.');
      }
    });

    // Editar e excluir (um único ouvinte para toda a lista).
    area.addEventListener('click', async (event) => {
      const actionButton = event.target.closest('[data-action]');
      const item = event.target.closest('.note-item');

      if (!actionButton || !item) {
        return;
      }

      const note = notes.find((candidate) => candidate.id === item.dataset.noteId);

      if (!note) {
        return;
      }

      if (actionButton.dataset.action === 'edit-note') {
        openForm(note);
        return;
      }

      if (actionButton.dataset.action === 'delete-note') {
        const dialogOptions = {
          title: 'Excluir anotação',
          message: `A anotação "${note.title}" (página ${note.page}) será excluída permanentemente.`,
          confirmText: 'Excluir',
          danger: true
        };

        const confirmed = typeof confirmDelete === 'function'
          ? await confirmDelete(dialogOptions)
          : window.confirm(dialogOptions.message);

        if (!confirmed) {
          return;
        }

        item.classList.add('is-busy');
        showStatus('');

        try {
          await api.remove(note);

          notes = notes.filter((candidate) => candidate.id !== note.id);

          // Se a anotação excluída estava sendo editada, fecha o formulário.
          if (editingNote && editingNote.id === note.id) {
            closeForm();
          }

          renderList();
          showStatus('Anotação excluída.');
        } catch (error) {
          console.error('Erro ao excluir anotação:', error);
          item.classList.remove('is-busy');
          showStatus(error?.message || 'Não foi possível excluir a anotação.', 'error');
        }
      }
    });

    load();

    return { element: section };
  }
};
