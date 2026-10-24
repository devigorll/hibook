// Seção "Anotações" da janela de detalhes do livro.
// Só desenha a interface: quem fala com o banco são as funções de "api" recebidas
// (veja o app.js), que sempre trabalham com o livro desta janela.

// Ordem crescente de página; na mesma página, a mais antiga primeiro.
function ordenar(notas) {
  return [...notas].sort((a, b) => a.page - b.page || String(a.created_at).localeCompare(String(b.created_at)));
}

export const notesView = {
  // api: { list(), create(dados), update(nota, dados), remove(nota) }
  // confirmDelete(opcoes): abre a confirmação e retorna true/false
  createSection({ book, api, confirmDelete }) {
    const total = book.pages_count || null;
    let notas = [];
    let editando = null; // anotação em edição (null = criando uma nova)

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

    const novoBtn = section.querySelector('[data-action="new-note"]');
    const contador = section.querySelector('[data-field="count"]');
    const form = section.querySelector('form');
    const tituloForm = section.querySelector('[data-field="form-title"]');
    const titleInput = section.querySelector('#note-title');
    const pageInput = section.querySelector('#note-page');
    const contentInput = section.querySelector('#note-content');
    const dicaPagina = section.querySelector('[data-field="page-hint"]');
    const msgForm = section.querySelector('[data-field="form-message"]');
    const status = section.querySelector('[data-field="status"]');
    const area = section.querySelector('[data-field="list-area"]');
    const salvarBtn = form.querySelector('button[type="submit"]');
    const salvarRotulo = salvarBtn.querySelector('span');

    // A página só pode ir até o total de páginas do livro (se ele tiver total cadastrado).
    if (total) {
      pageInput.max = String(total);
      dicaPagina.textContent = `De 1 a ${total}.`;
    } else {
      dicaPagina.textContent = 'O livro não tem total de páginas cadastrado.';
    }

    // ----- mensagens -----
    function mostrarStatus(texto, tipo = 'sucesso') {
      status.textContent = texto;
      status.className = texto ? `form-message ${tipo === 'erro' ? 'error-text' : 'success-text'}` : 'form-message';
    }

    function mostrarErroDoForm(texto) {
      msgForm.textContent = texto;
      msgForm.className = texto ? 'form-message error-text' : 'form-message';
    }

    // ----- lista -----
    function desenharEstadoSimples(classe, texto) {
      const bloco = document.createElement('p');
      bloco.className = classe;
      bloco.textContent = texto;
      area.replaceChildren(bloco);
    }

    function criarItem(nota) {
      const item = document.createElement('li');
      item.className = 'note-item';
      item.dataset.noteId = nota.id;

      if (editando && editando.id === nota.id) {
        item.classList.add('is-editing');
      }

      const cabecalho = document.createElement('div');
      cabecalho.className = 'note-item-head';

      const pagina = document.createElement('span');
      pagina.className = 'note-page';
      pagina.textContent = `Pág. ${nota.page}`;

      const titulo = document.createElement('span');
      titulo.className = 'note-title';
      titulo.textContent = nota.title;

      const acoes = document.createElement('div');
      acoes.className = 'note-actions';

      const editar = document.createElement('button');
      editar.type = 'button';
      editar.className = 'note-action';
      editar.dataset.action = 'edit-note';
      editar.textContent = 'Editar';
      editar.setAttribute('aria-label', `Editar anotação ${nota.title}`);

      const excluir = document.createElement('button');
      excluir.type = 'button';
      excluir.className = 'note-action is-danger';
      excluir.dataset.action = 'delete-note';
      excluir.textContent = 'Excluir';
      excluir.setAttribute('aria-label', `Excluir anotação ${nota.title}`);

      acoes.append(editar, excluir);
      cabecalho.append(pagina, titulo, acoes);

      const comentario = document.createElement('p');
      comentario.className = 'note-content';
      comentario.textContent = nota.content;

      item.append(cabecalho, comentario);
      return item;
    }

    function desenharLista() {
      contador.textContent = `(${notas.length})`;

      if (notas.length === 0) {
        desenharEstadoSimples(
          'note-empty',
          'Nenhuma anotação ainda. Registre trechos e ideias ligados a uma página do livro.'
        );
        return;
      }

      const lista = document.createElement('ul');
      lista.className = 'note-list';
      notas.forEach((nota) => lista.appendChild(criarItem(nota)));
      area.replaceChildren(lista);
    }

    async function carregar() {
      contador.textContent = '';

      const carregando = document.createElement('p');
      carregando.className = 'note-loading';
      carregando.setAttribute('role', 'status');

      const girando = document.createElement('span');
      girando.className = 'note-spinner';

      const texto = document.createElement('span');
      texto.textContent = 'Carregando anotações...';

      carregando.append(girando, texto);
      area.replaceChildren(carregando);

      try {
        const resultado = await api.list();

        // Segurança extra: só entram anotações deste livro.
        notas = ordenar(resultado.filter((nota) => nota.book_id === book.id));
        desenharLista();
      } catch (error) {
        console.error('Erro ao carregar anotações:', error);

        const bloco = document.createElement('div');
        bloco.className = 'note-empty';

        const mensagem = document.createElement('p');
        mensagem.className = 'error-text';
        mensagem.textContent = error?.message || 'Não foi possível carregar as anotações.';

        const tentar = document.createElement('button');
        tentar.type = 'button';
        tentar.className = 'btn btn-outline';
        tentar.textContent = 'Tentar novamente';
        tentar.addEventListener('click', carregar);

        bloco.append(mensagem, tentar);
        area.replaceChildren(bloco);
      }
    }

    // ----- formulário (usado para criar e para editar) -----
    function abrirForm(nota = null) {
      editando = nota;

      tituloForm.textContent = nota ? 'Editar anotação' : 'Nova anotação';
      salvarRotulo.textContent = nota ? 'Salvar alterações' : 'Salvar anotação';

      titleInput.value = nota?.title ?? '';
      pageInput.value = nota ? String(nota.page) : '';
      contentInput.value = nota?.content ?? '';

      mostrarErroDoForm('');
      mostrarStatus('');

      form.hidden = false;
      novoBtn.hidden = true;

      if (notas.length > 0) {
        desenharLista(); // destaca a anotação em edição
      }

      form.scrollIntoView({ block: 'nearest' });
      titleInput.focus();
    }

    function fecharForm() {
      editando = null;
      form.hidden = true;
      novoBtn.hidden = false;
      form.reset();
      mostrarErroDoForm('');

      if (notas.length > 0) {
        desenharLista();
      }
    }

    novoBtn.addEventListener('click', () => abrirForm());
    section.querySelector('[data-action="cancel-note"]').addEventListener('click', fecharForm);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      // Evita envio duplicado enquanto salva.
      if (salvarBtn.disabled) return;

      const dados = {
        title: titleInput.value,
        page: pageInput.value,
        content: contentInput.value
      };

      const original = salvarRotulo.textContent;
      salvarBtn.disabled = true;
      salvarRotulo.textContent = 'Salvando...';
      mostrarErroDoForm('');

      try {
        let mensagem;

        if (editando) {
          const atualizada = await api.update(editando, dados);
          notas = ordenar(notas.map((nota) => (nota.id === atualizada.id ? atualizada : nota)));
          mensagem = 'Anotação atualizada.';
        } else {
          const criada = await api.create(dados);
          notas = ordenar([...notas, criada]);
          mensagem = 'Anotação salva.';
        }

        fecharForm();
        desenharLista();
        mostrarStatus(mensagem);
      } catch (error) {
        console.error('Erro ao salvar anotação:', error);
        mostrarErroDoForm(error?.message || 'Não foi possível salvar a anotação.');
      } finally {
        salvarBtn.disabled = false;
        salvarRotulo.textContent = original;
      }
    });

    // Editar e excluir (um único ouvinte para toda a lista).
    area.addEventListener('click', async (event) => {
      const botao = event.target.closest('[data-action]');
      const item = event.target.closest('.note-item');

      if (!botao || !item) {
        return;
      }

      const nota = notas.find((candidata) => candidata.id === item.dataset.noteId);

      if (!nota) {
        return;
      }

      if (botao.dataset.action === 'edit-note') {
        abrirForm(nota);
        return;
      }

      if (botao.dataset.action === 'delete-note') {
        const opcoes = {
          title: 'Excluir anotação',
          message: `A anotação "${nota.title}" (página ${nota.page}) será excluída permanentemente.`,
          confirmText: 'Excluir',
          danger: true
        };

        const confirmou = typeof confirmDelete === 'function'
          ? await confirmDelete(opcoes)
          : window.confirm(opcoes.message);

        if (!confirmou) {
          return;
        }

        item.classList.add('is-busy');
        mostrarStatus('');

        try {
          await api.remove(nota);

          notas = notas.filter((candidata) => candidata.id !== nota.id);

          // Se a anotação excluída estava sendo editada, fecha o formulário.
          if (editando && editando.id === nota.id) {
            fecharForm();
          }

          desenharLista();
          mostrarStatus('Anotação excluída.');
        } catch (error) {
          console.error('Erro ao excluir anotação:', error);
          item.classList.remove('is-busy');
          mostrarStatus(error?.message || 'Não foi possível excluir a anotação.', 'erro');
        }
      }
    });

    carregar();

    return { element: section, reload: carregar };
  }
};