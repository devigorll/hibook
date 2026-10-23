import { listService } from '../services/list_service.js';
import { bookService } from '../services/book_service.js';

// ==========================================
// Funções auxiliares (usadas pelos formulários de livro)
// ==========================================

// Controla o botão de escolher imagem, a prévia e o botão de remover/desfazer.
// initialUrl: capa atual (na edição). Sem ela, a prévia começa vazia.
function setupCoverPicker({ coverInput, coverBtn, clearBtn, preview, initialUrl = null, onError }) {
  let previewUrl = null;

  function mostrarVazio() {
    const texto = document.createElement('span');
    texto.textContent = 'Nenhuma imagem selecionada';
    preview.replaceChildren(texto);
  }

  function mostrarImagem(src, alt) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    preview.replaceChildren(img);
  }

  // Volta ao estado inicial (sem arquivo novo).
  function reset() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }

    coverInput.value = '';
    clearBtn.hidden = true;

    if (initialUrl) {
      mostrarImagem(initialUrl, 'Capa atual');
    } else {
      mostrarVazio();
    }
  }

  coverBtn.addEventListener('click', () => coverInput.click());
  clearBtn.addEventListener('click', () => {
    reset();
    onError('');
  });

  coverInput.addEventListener('change', () => {
    const file = coverInput.files[0];

    if (!file) {
      reset();
      return;
    }

    const erro = bookService.validateCover(file);

    if (erro) {
      reset();
      onError(erro);
      return;
    }

    onError('');

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    previewUrl = URL.createObjectURL(file);
    mostrarImagem(previewUrl, 'Prévia da capa');
    clearBtn.hidden = false;
  });

  reset();

  return {
    getFile: () => coverInput.files[0] ?? null,
    reset
  };
}

// Lê e valida título e páginas. Retorna { titulo, paginas } ou { erro, campo }.
function lerTituloEPaginas(titleInput, pagesInput) {
  const titulo = titleInput.value.trim();

  if (!titulo) {
    return { erro: 'Informe o título do livro.', campo: titleInput };
  }

  const bruto = pagesInput.value.trim();
  let paginas = null;

  if (bruto !== '') {
    const numero = Number(bruto);

    if (!Number.isInteger(numero) || numero <= 0) {
      return { erro: 'A quantidade de páginas deve ser um número inteiro positivo.', campo: pagesInput };
    }

    paginas = numero;
  }

  return { titulo, paginas };
}

// Mostra mensagem de sucesso/erro em um parágrafo .form-message.
function criarMensagem(elemento) {
  return (texto, tipo) => {
    elemento.textContent = texto;
    elemento.className = `form-message ${tipo === 'erro' ? 'error-text' : 'success-text'}`;
  };
}

export const formView = {
  // ==========================================
  // Formulário: Criar Lista
  // onCreated é chamado após salvar, para o app atualizar a sidebar.
  // ==========================================
  renderCreateListForm(container, onCreated) {
    container.innerHTML = `
      <div class="form-card">
        <h3>Nova lista</h3>
        <p class="form-subtitle">
          Organize seus livros por tema, como Suspense, Fantasia ou Romance.
        </p>

        <form id="create-list-form" novalidate>
          <div class="input-group">
            <label for="list-name">Nome da lista</label>
            <input type="text" id="list-name" maxlength="60"
              placeholder="Ex.: Ficção científica" autocomplete="off" required>
          </div>

          <p class="form-message" id="create-list-message" role="status"></p>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="create-list-submit">
              <i data-lucide="folder-plus" aria-hidden="true"></i>
              <span>Criar lista</span>
            </button>
          </div>
        </form>
      </div>
    `;

    const form = container.querySelector('#create-list-form');
    const input = container.querySelector('#list-name');
    const submitBtn = container.querySelector('#create-list-submit');
    const mostrarMensagem = criarMensagem(container.querySelector('#create-list-message'));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      // Evita envio duplicado enquanto processa.
      if (submitBtn.disabled) return;

      const nome = input.value.trim();

      if (!nome) {
        mostrarMensagem('Informe o nome da lista.', 'erro');
        input.focus();
        return;
      }

      submitBtn.disabled = true;
      mostrarMensagem('', 'sucesso');

      try {
        await listService.createList(nome);

        form.reset();
        mostrarMensagem(`Lista "${nome}" criada com sucesso!`, 'sucesso');

        if (typeof onCreated === 'function') {
          await onCreated();
        }
      } catch (error) {
        console.error('Erro ao criar lista:', error);

        // 23505 = violação de unicidade (nome repetido).
        const texto =
          error?.code === '23505'
            ? 'Você já tem uma lista com esse nome.'
            : error?.message || 'Não foi possível criar a lista.';

        mostrarMensagem(texto, 'erro');
      } finally {
        submitBtn.disabled = false;
        input.focus();
      }
    });

    input.focus();
  },

  // ==========================================
  // Formulário: Criar Livro
  // lists: listas do usuário (campo "Lista")
  // onCreated(book): chamado após salvar
  // ==========================================
  renderCreateBookForm(container, { lists = [], onCreated } = {}) {
    container.innerHTML = `
      <div class="form-card">
        <h3>Novo livro</h3>
        <p class="form-subtitle">
          Cadastre um livro com a capa e, se quiser, associe a uma lista.
        </p>

        <form id="create-book-form" novalidate>

          <div class="input-group">
            <label for="book-cover-btn">Capa do livro *</label>

            <div class="cover-picker">
              <div class="cover-preview" id="cover-preview"></div>

              <div class="cover-actions">
                <button type="button" class="btn btn-outline" id="book-cover-btn">
                  <i data-lucide="image-plus" aria-hidden="true"></i>
                  <span>Escolher imagem</span>
                </button>

                <button type="button" class="btn btn-outline" id="book-cover-clear" hidden>
                  <i data-lucide="x" aria-hidden="true"></i>
                  <span>Remover</span>
                </button>

                <p class="field-hint">JPG, PNG ou WebP, até 5 MB.</p>
              </div>
            </div>

            <input type="file" id="book-cover" accept="image/jpeg,image/png,image/webp" hidden>
          </div>

          <div class="input-group">
            <label for="book-title">Título *</label>
            <input type="text" id="book-title" maxlength="200" autocomplete="off" required>
          </div>

          <div class="input-group">
            <label for="book-description">Descrição</label>
            <textarea id="book-description" rows="4" maxlength="2000"></textarea>
          </div>

          <div class="input-group">
            <label for="book-pages">Quantidade de páginas</label>
            <input type="number" id="book-pages" min="1" step="1" inputmode="numeric">
          </div>

          <div class="input-group">
            <label for="book-list">Lista</label>
            <select id="book-list">
              <option value="">Sem lista</option>
            </select>
          </div>

          <p class="form-message" id="create-book-message" role="status"></p>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="create-book-submit">
              <i data-lucide="save" aria-hidden="true"></i>
              <span>Salvar livro</span>
            </button>
          </div>
        </form>
      </div>
    `;

    const form = container.querySelector('#create-book-form');
    const titleInput = container.querySelector('#book-title');
    const descriptionInput = container.querySelector('#book-description');
    const pagesInput = container.querySelector('#book-pages');
    const listSelect = container.querySelector('#book-list');
    const submitBtn = container.querySelector('#create-book-submit');
    const submitLabel = submitBtn.querySelector('span');
    const coverBtn = container.querySelector('#book-cover-btn');
    const mostrarMensagem = criarMensagem(container.querySelector('#create-book-message'));

    // Preenche o campo "Lista" (textContent evita HTML nos nomes).
    lists.forEach((list) => {
      const option = document.createElement('option');
      option.value = list.id;
      option.textContent = list.name;
      listSelect.appendChild(option);
    });

    const picker = setupCoverPicker({
      coverInput: container.querySelector('#book-cover'),
      coverBtn,
      clearBtn: container.querySelector('#book-cover-clear'),
      preview: container.querySelector('#cover-preview'),
      onError: (texto) => mostrarMensagem(texto, 'erro')
    });

    // Confere se a URL pública da capa abre (testa se o bucket está público).
    function verificarCapaPublica(url, titulo) {
      const img = new Image();

      img.onerror = () => {
        mostrarMensagem(
          `Livro "${titulo}" salvo, mas a URL pública da capa não abriu. ` +
            'Verifique se o bucket book-covers está público.',
          'erro'
        );
      };

      img.src = url;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      // Evita envio duplicado enquanto processa.
      if (submitBtn.disabled) return;

      const file = picker.getFile();
      const erroCapa = bookService.validateCover(file);

      if (erroCapa) {
        mostrarMensagem(erroCapa, 'erro');
        coverBtn.focus();
        return;
      }

      const dados = lerTituloEPaginas(titleInput, pagesInput);

      if (dados.erro) {
        mostrarMensagem(dados.erro, 'erro');
        dados.campo.focus();
        return;
      }

      submitBtn.disabled = true;
      submitLabel.textContent = 'Salvando...';
      mostrarMensagem('', 'sucesso');

      try {
        const book = await bookService.createBook({
          title: dados.titulo,
          description: descriptionInput.value,
          pagesCount: dados.paginas,
          coverFile: file,
          listId: listSelect.value || null
        });

        form.reset();
        picker.reset();
        mostrarMensagem(`Livro "${dados.titulo}" cadastrado com sucesso!`, 'sucesso');
        verificarCapaPublica(book.cover_url, dados.titulo);

        if (typeof onCreated === 'function') {
          await onCreated(book);
        }
      } catch (error) {
        console.error('Erro ao cadastrar livro:', error);
        mostrarMensagem(error?.message || 'Não foi possível cadastrar o livro.', 'erro');
      } finally {
        submitBtn.disabled = false;
        submitLabel.textContent = 'Salvar livro';
      }
    });

    titleInput.focus();
  },

  // ==========================================
  // Formulário: Editar Livro
  // book: livro com book_lists: [{ list_id }]
  // lists: todas as listas do usuário (caixas de seleção)
  // onSaved(livroAtualizado) e onCancel() definem para onde voltar
  // ==========================================
  renderEditBookForm(container, { book, lists = [], onSaved, onCancel } = {}) {
    container.innerHTML = `
      <div class="form-card">
        <h3>Editar livro</h3>
        <p class="form-subtitle">
          Altere os dados, troque a capa ou escolha em quais listas o livro aparece.
        </p>

        <form id="edit-book-form" novalidate>

          <div class="input-group">
            <label for="book-cover-btn">Capa do livro</label>

            <div class="cover-picker">
              <div class="cover-preview" id="cover-preview"></div>

              <div class="cover-actions">
                <button type="button" class="btn btn-outline" id="book-cover-btn">
                  <i data-lucide="image-plus" aria-hidden="true"></i>
                  <span>Trocar imagem</span>
                </button>

                <button type="button" class="btn btn-outline" id="book-cover-clear" hidden>
                  <i data-lucide="undo-2" aria-hidden="true"></i>
                  <span>Desfazer troca</span>
                </button>

                <p class="field-hint">Opcional. JPG, PNG ou WebP, até 5 MB.</p>
              </div>
            </div>

            <input type="file" id="book-cover" accept="image/jpeg,image/png,image/webp" hidden>
          </div>

          <div class="input-group">
            <label for="book-title">Título *</label>
            <input type="text" id="book-title" maxlength="200" autocomplete="off" required>
          </div>

          <div class="input-group">
            <label for="book-description">Descrição</label>
            <textarea id="book-description" rows="4" maxlength="2000"></textarea>
          </div>

          <div class="input-group">
            <label for="book-pages">Quantidade de páginas</label>
            <input type="number" id="book-pages" min="1" step="1" inputmode="numeric">
          </div>

          <div class="input-group">
            <span class="field-label">Listas</span>
            <div class="check-list" id="book-lists"></div>
          </div>

          <p class="form-message" id="edit-book-message" role="status"></p>

          <div class="form-actions">
            <button type="button" class="btn btn-outline" id="edit-book-cancel">Cancelar</button>

            <button type="submit" class="btn btn-primary" id="edit-book-submit">
              <i data-lucide="save" aria-hidden="true"></i>
              <span>Salvar alterações</span>
            </button>
          </div>
        </form>
      </div>
    `;

    const form = container.querySelector('#edit-book-form');
    const titleInput = container.querySelector('#book-title');
    const descriptionInput = container.querySelector('#book-description');
    const pagesInput = container.querySelector('#book-pages');
    const listsBox = container.querySelector('#book-lists');
    const submitBtn = container.querySelector('#edit-book-submit');
    const submitLabel = submitBtn.querySelector('span');
    const mostrarMensagem = criarMensagem(container.querySelector('#edit-book-message'));

    // Valores atuais (atribuídos por .value, nunca por HTML).
    titleInput.value = book.title ?? '';
    descriptionInput.value = book.description ?? '';
    pagesInput.value = book.pages_count ?? '';

    const listasDoLivro = new Set((book.book_lists ?? []).map((vinculo) => vinculo.list_id));

    if (lists.length === 0) {
      const aviso = document.createElement('p');
      aviso.className = 'field-hint';
      aviso.textContent = 'Você ainda não criou nenhuma lista.';
      listsBox.appendChild(aviso);
    }

    lists.forEach((list) => {
      const label = document.createElement('label');
      label.className = 'check-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = list.id;
      checkbox.checked = listasDoLivro.has(list.id);

      const nome = document.createElement('span');
      nome.textContent = list.name;

      label.append(checkbox, nome);
      listsBox.appendChild(label);
    });

    const picker = setupCoverPicker({
      coverInput: container.querySelector('#book-cover'),
      coverBtn: container.querySelector('#book-cover-btn'),
      clearBtn: container.querySelector('#book-cover-clear'),
      preview: container.querySelector('#cover-preview'),
      initialUrl: book.cover_url,
      onError: (texto) => mostrarMensagem(texto, 'erro')
    });

    container.querySelector('#edit-book-cancel').addEventListener('click', () => {
      if (typeof onCancel === 'function') {
        onCancel();
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      // Evita envio duplicado enquanto processa.
      if (submitBtn.disabled) return;

      const dados = lerTituloEPaginas(titleInput, pagesInput);

      if (dados.erro) {
        mostrarMensagem(dados.erro, 'erro');
        dados.campo.focus();
        return;
      }

      const listIds = [...listsBox.querySelectorAll('input[type="checkbox"]:checked')].map(
        (checkbox) => checkbox.value
      );

      submitBtn.disabled = true;
      submitLabel.textContent = 'Salvando...';
      mostrarMensagem('', 'sucesso');

      try {
        const atualizado = await bookService.updateBook({
          book,
          title: dados.titulo,
          description: descriptionInput.value,
          pagesCount: dados.paginas,
          coverFile: picker.getFile(),
          listIds
        });

        if (typeof onSaved === 'function') {
          await onSaved(atualizado);
        }
      } catch (error) {
        console.error('Erro ao editar livro:', error);
        mostrarMensagem(error?.message || 'Não foi possível salvar as alterações.', 'erro');
      } finally {
        submitBtn.disabled = false;
        submitLabel.textContent = 'Salvar alterações';
      }
    });

    titleInput.focus();
  }
};