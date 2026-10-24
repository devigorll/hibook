console.log('[HiBook] app.js iniciado');

document.addEventListener('DOMContentLoaded', async () => {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('main-content');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
  const contentArea = document.getElementById('content-area');
  const pageTitle = document.getElementById('page-title');
  const sidebarListsContainer = document.getElementById('sidebar-lists');
  const sidebarFooter = document.getElementById('sidebar-footer');
  const logoutBtn = document.getElementById('logout-btn');

  if (!sidebar || !mainContent || !contentArea || !pageTitle || !sidebarListsContainer) {
    console.error('Erro ao iniciar o HiBook: verifique os IDs do HTML.');
    return;
  }

  const mobileQuery = window.matchMedia('(max-width: 768px)');

  // Módulos (preenchidos depois, quando carregarem).
  let listService = null;
  let bookService = null;
  let authService = null;
  let formView = null;
  let authView = null;
  let modalView = null;
  let galleryView = null;
  let bookDetailsView = null;
  let noteService = null;
  let modulosProntos = false;

  // Estado da aplicação.
  let currentUser = null;

  // Fluxo de recuperação de senha (link enviado por e-mail).
  let recoveryMode = false;      // true enquanto o usuário define a nova senha
  let recoveryExpected = false;  // a URL indica que a página foi aberta por um link de recuperação
  let pendingLinkError = null;   // link inválido/expirado, mostrado na tela de login
  let lastUserId;                // último usuário tratado (evita redesenhar a tela sem necessidade)
  let listsCache = [];       // listas do usuário, já carregadas
  let selectedListId = null; // lista aberta no momento (null = nenhuma)
  let lastView = { type: 'gallery' }; // para onde voltar após editar um livro

  // Cada tela nova recebe um número. Se o usuário trocar de tela enquanto
  // algo ainda carrega, o resultado antigo é descartado em vez de desenhar por cima.
  let viewToken = 0;

  function beginView() {
    viewToken += 1;
    return viewToken;
  }

  // Traduz erros técnicos em mensagens para o usuário.
  function mensagemDeErro(error) {
    if (error?.code === '23505') {
      return 'Você já tem uma lista com esse nome.';
    }

    return error?.message || 'Ocorreu um erro inesperado.';
  }

  // ========================================
  // PARTE 1: INTERFACE (não depende de rede)
  // ========================================

  function refreshIcons() {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    } else if (toggleSidebarBtn && !toggleSidebarBtn.dataset.fallback) {
      // Sem a biblioteca de ícones, mantém o botão visível.
      toggleSidebarBtn.textContent = '☰';
      toggleSidebarBtn.dataset.fallback = 'true';
    }
  }

  function updateSidebarState() {
    if (mobileQuery.matches) {
      sidebar.classList.remove('collapsed');
      mainContent.classList.remove('expanded');

      toggleSidebarBtn?.setAttribute(
        'aria-expanded',
        String(sidebar.classList.contains('mobile-open'))
      );
    } else {
      sidebar.classList.remove('mobile-open');

      const isCollapsed = sidebar.classList.contains('collapsed');
      mainContent.classList.toggle('expanded', isCollapsed);

      toggleSidebarBtn?.setAttribute('aria-expanded', String(!isCollapsed));
    }
  }

  function closeMobileMenu() {
    if (mobileQuery.matches) {
      sidebar.classList.remove('mobile-open');
      updateSidebarState();
    }
  }

  toggleSidebarBtn?.addEventListener('click', () => {
    if (mobileQuery.matches) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
    }

    updateSidebarState();
  });

  mobileQuery.addEventListener('change', () => {
    sidebar.classList.remove('mobile-open');
    sidebar.classList.remove('collapsed');
    updateSidebarState();
  });

  // Remove o destaque de todos os itens (menu principal e listas).
  // Se receber um item, destaca esse item.
  function setActiveMenu(menuItem) {
    sidebar
      .querySelectorAll('.sidebar-menu .menu-item, .sidebar-lists-container .menu-item')
      .forEach((item) => {
        item.classList.remove('active');
        item.removeAttribute('aria-current');
      });

    if (menuItem) {
      menuItem.classList.add('active');
      menuItem.setAttribute('aria-current', 'page');
    }
  }

  // Destaca na sidebar a lista que está aberta.
  function markActiveList() {
    if (!selectedListId) {
      return;
    }

    const item = sidebarListsContainer.querySelector(
      `.list-menu-item[data-list-id="${selectedListId}"]`
    );

    if (item) {
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');
    }
  }

  // Mensagem simples na área principal (carregando, erro etc.).
  function showMessage(icon, titulo, texto) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <i data-lucide="${icon}"></i>
        <h3></h3>
        <p></p>
      </div>
    `;

    // textContent evita inserir HTML vindo de mensagens de erro.
    contentArea.querySelector('h3').textContent = titulo;
    contentArea.querySelector('p').textContent = texto;
    refreshIcons();
  }

  // Aviso curto no topo da área principal (sucesso ou erro de uma ação).
  function showNotice(texto, tipo = 'erro') {
    let aviso = contentArea.querySelector('#notice');

    if (!aviso) {
      aviso = document.createElement('p');
      aviso.id = 'notice';
      aviso.setAttribute('role', 'status');
      contentArea.prepend(aviso);
    }

    aviso.textContent = texto;
    aviso.className = `form-message ${tipo === 'erro' ? 'error-text' : 'success-text'}`;
  }

  function appendSidebarItem(text, icon = 'folder') {
    const li = document.createElement('li');
    li.className = 'menu-item menu-item-empty';

    const i = document.createElement('i');
    i.setAttribute('data-lucide', icon);
    i.setAttribute('aria-hidden', 'true');

    const span = document.createElement('span');
    span.className = 'menu-text';
    span.textContent = text;

    li.append(i, span);
    sidebarListsContainer.appendChild(li);
  }

  function setSidebarMessage(text, icon) {
    sidebarListsContainer.replaceChildren();
    appendSidebarItem(text, icon);
    refreshIcons();
  }

  // ========================================
  // PARTE 2: LISTAS (sidebar, renomear, excluir)
  // ========================================

  async function loadSidebarLists() {
    if (!listService) {
      setSidebarMessage('Erro ao carregar listas', 'alert-circle');
      return;
    }

    try {
      listsCache = await listService.getLists();

      sidebarListsContainer.replaceChildren();

      if (listsCache.length === 0) {
        appendSidebarItem('Sem listas');
        refreshIcons();
        return;
      }

      listsCache.forEach((list) => {
        const li = document.createElement('li');
        li.className = 'menu-item list-menu-item';
        li.dataset.listId = list.id;
        li.tabIndex = 0;
        li.setAttribute('role', 'button');

        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'folder');
        icon.setAttribute('aria-hidden', 'true');

        const span = document.createElement('span');
        span.className = 'menu-text';
        span.textContent = list.name;
        span.title = list.name;

        li.append(icon, span);
        sidebarListsContainer.appendChild(li);
      });

      refreshIcons();
      markActiveList();
    } catch (error) {
      console.error('Erro ao carregar listas:', error);
      setSidebarMessage(mensagemDeErro(error), 'alert-circle');
    }
  }

  async function renameList(list) {
    if (!modalView || !listService) {
      showNotice('Não foi possível abrir a janela de edição. Veja o console (F12).');
      return;
    }

    const salvou = await modalView.editText({
      title: 'Renomear lista',
      label: 'Novo nome',
      initialValue: list.name,
      confirmText: 'Salvar',
      maxLength: 60,
      onSubmit: async (novoNome) => {
        try {
          await listService.renameList(list.id, novoNome);
        } catch (error) {
          console.error('Erro ao renomear lista:', error);
          throw new Error(mensagemDeErro(error));
        }
      }
    });

    if (!salvou) {
      return;
    }

    await loadSidebarLists();
    await showList(list.id);
  }

  async function deleteList(list) {
    if (!modalView || !listService) {
      showNotice('Não foi possível abrir a confirmação. Veja o console (F12).');
      return;
    }

    const confirmou = await modalView.confirm({
      title: 'Excluir lista',
      message:
        `A lista "${list.name}" será excluída. ` +
        'Os livros que estão nela não serão apagados: eles apenas deixarão de pertencer a esta lista.',
      confirmText: 'Excluir',
      danger: true
    });

    if (!confirmou) {
      return;
    }

    try {
      await listService.deleteList(list.id);

      selectedListId = null;
      await loadSidebarLists();
      await openView('gallery');
      showNotice(`Lista "${list.name}" excluída.`, 'sucesso');
    } catch (error) {
      console.error('Erro ao excluir lista:', error);
      showNotice(mensagemDeErro(error));
    }
  }

  // ========================================
  // PARTE 3: LIVROS (galeria, detalhes, editar, excluir)
  // ========================================

  // Busca os livros e desenha a galeria dentro do container.
  // listId = null traz todos; com listId, só os daquela lista.
  async function loadBooksInto(container, token, listId, emptyInfo) {
    if (!bookService || !galleryView) {
      container.textContent = 'Não foi possível carregar a galeria. Veja o console (F12).';
      return;
    }

    galleryView.renderLoading(container);
    refreshIcons();

    try {
      const books = await bookService.getBooks({ listId });

      // O usuário já abriu outra tela: descarta este resultado.
      if (token !== viewToken) {
        return;
      }

      if (books.length === 0) {
        galleryView.renderEmpty(container, emptyInfo);
      } else {
        galleryView.renderBooks(container, books, openBookDetails);
      }

      refreshIcons();
    } catch (error) {
      if (token !== viewToken) {
        return;
      }

      console.error('Erro ao carregar livros:', error);

      galleryView.renderError(container, mensagemDeErro(error), () =>
        loadBooksInto(container, token, listId, emptyInfo)
      );
      refreshIcons();
    }
  }

  function openBookDetails(book) {
    if (!bookDetailsView || !bookService) {
      showNotice('Não foi possível abrir os detalhes. Veja o console (F12).');
      return;
    }

    const nomesDasListas = (book.book_lists ?? [])
      .map((vinculo) => listsCache.find((list) => list.id === vinculo.list_id)?.name)
      .filter(Boolean);

    bookDetailsView.open({
      book,
      listNames: nomesDasListas,
      onRate: (livro, nota) => bookService.setRating(livro.id, nota),
      onSaveProgress: (livro, pagina) => bookService.setCurrentPage(livro, pagina),
      // Anotações por página (nulo se o módulo não carregou: a janela abre sem essa seção).
      notesApi: noteService
        ? {
            list: (livro) => noteService.getNotes(livro.id),
            create: (livro, dados) => noteService.createNote(livro, dados),
            update: (livro, nota, dados) => noteService.updateNote(livro, nota, dados),
            remove: (nota) => noteService.deleteNote(nota.id)
          }
        : null,
      confirmDelete: modalView ? (opcoes) => modalView.confirm(opcoes) : null,
      onEdit: showEditBook,
      onDelete: deleteBook,
      // Se a nota ou o progresso mudaram, a galeria é redesenhada com os dados novos.
      onClose: ({ changed }) => {
        if (changed) {
          refreshCurrentView();
        }
      }
    });
  }

  // Redesenha a tela em que o usuário estava (galeria geral ou uma lista).
  function refreshCurrentView() {
    if (lastView.type === 'list' && listsCache.some((list) => list.id === lastView.listId)) {
      return showList(lastView.listId);
    }

    return showGallery();
  }

  function showEditBook(book) {
    beginView();
    pageTitle.textContent = 'Editar Livro';

    if (!formView || typeof formView.renderEditBookForm !== 'function') {
      showMessage(
        'alert-circle',
        'Não foi possível abrir o formulário',
        'Verifique o console (F12) e o arquivo js/views/form_view.js.'
      );
      return;
    }

    try {
      formView.renderEditBookForm(contentArea, {
        book,
        lists: listsCache,
        onCancel: () => refreshCurrentView(),
        onSaved: async () => {
          await refreshCurrentView();
          showNotice('Livro atualizado com sucesso!', 'sucesso');
        }
      });

      refreshIcons();
    } catch (error) {
      console.error('Erro ao renderizar o formulário de edição:', error);
      showMessage('alert-circle', 'Erro ao abrir o formulário', error?.message || 'Veja o console (F12).');
    }
  }

  async function deleteBook(book) {
    if (!modalView || !bookService) {
      showNotice('Não foi possível abrir a confirmação. Veja o console (F12).');
      return;
    }

    const confirmou = await modalView.confirm({
      title: 'Excluir livro',
      message: `O livro "${book.title}" e a imagem da capa serão excluídos permanentemente.`,
      confirmText: 'Excluir',
      danger: true
    });

    if (!confirmou) {
      return;
    }

    try {
      await bookService.deleteBook(book);

      await refreshCurrentView();
      showNotice(`Livro "${book.title}" excluído.`, 'sucesso');
    } catch (error) {
      console.error('Erro ao excluir livro:', error);
      showNotice(mensagemDeErro(error));
    }
  }

  // ========================================
  // PARTE 4: TELAS E NAVEGAÇÃO
  // ========================================

  // Telas de autenticação ocupam a tela toda: sem menu lateral e sem cabeçalho.
  function setAuthMode(ativo) {
    document.body.classList.toggle('auth-mode', ativo);
    contentArea.setAttribute('aria-live', ativo ? 'off' : 'polite');
  }

  // Encerra a tela neutra de carregamento inicial (sem menu) quando já se sabe quem está logado.
  function endBoot() {
    document.body.classList.remove('booting');
  }

  // options: { mode, notice, linkError, onRecoveryFinished } (veja js/views/auth_view.js)
  function showAuth(options = {}) {
    beginView();
    setAuthMode(true);
    pageTitle.textContent = 'Entrar';
    setActiveMenu(null);

    if (!authView) {
      showMessage(
        'alert-circle',
        'Não foi possível abrir o login',
        'Verifique o console (F12) e os arquivos em js/views e js/services.'
      );
      return;
    }

    authView.renderAuthForm(contentArea, options);
  }

  // Galeria geral: todos os livros do usuário.
  async function showGallery() {
    const token = beginView();

    lastView = { type: 'gallery' };
    pageTitle.textContent = 'Biblioteca Geral';

    await loadBooksInto(contentArea, token, null, {
      icon: 'book-open',
      title: 'Sua galeria está vazia',
      text: 'Cadastre um livro para começar a organizar sua biblioteca.'
    });
  }

  // Tela de uma lista: título com o nome, ações e os livros dela.
  async function showList(listId) {
    const list = listsCache.find((item) => item.id === listId);

    if (!list) {
      selectedListId = null;
      return openView('gallery');
    }

    const token = beginView();

    lastView = { type: 'list', listId: list.id };
    selectedListId = list.id;
    pageTitle.textContent = list.name;

    setActiveMenu(null);
    markActiveList();

    contentArea.innerHTML = `
      <div class="view-toolbar">
        <button type="button" class="btn btn-outline" id="back-to-gallery">
          <i data-lucide="arrow-left" aria-hidden="true"></i>
          <span>Galeria geral</span>
        </button>

        <span class="spacer"></span>

        <button type="button" class="btn btn-outline" id="rename-list-btn">
          <i data-lucide="pencil" aria-hidden="true"></i>
          <span>Renomear</span>
        </button>

        <button type="button" class="btn btn-outline btn-danger-outline" id="delete-list-btn">
          <i data-lucide="trash-2" aria-hidden="true"></i>
          <span>Excluir lista</span>
        </button>
      </div>

      <div id="list-books"></div>
    `;

    refreshIcons();

    contentArea.querySelector('#back-to-gallery').addEventListener('click', () => {
      selectedListId = null;
      openView('gallery');
    });

    contentArea.querySelector('#rename-list-btn').addEventListener('click', () => renameList(list));
    contentArea.querySelector('#delete-list-btn').addEventListener('click', () => deleteList(list));

    await loadBooksInto(contentArea.querySelector('#list-books'), token, list.id, {
      icon: 'book-open',
      title: 'Esta lista ainda não tem livros',
      text: 'Ao cadastrar ou editar um livro, escolha esta lista para ele aparecer aqui.'
    });
  }

  async function showCreateBook() {
    const token = beginView();

    pageTitle.textContent = 'Criar Livro';

    if (!formView || typeof formView.renderCreateBookForm !== 'function') {
      showMessage(
        'alert-circle',
        'Não foi possível abrir o formulário',
        'Verifique o console (F12) e o arquivo js/views/form_view.js.'
      );
      return;
    }

    // Garante que as listas estejam carregadas para o campo "Lista".
    if (listsCache.length === 0) {
      await loadSidebarLists();
    }

    // Se o usuário trocou de tela enquanto carregava, não desenha por cima.
    if (token !== viewToken) {
      return;
    }

    try {
      formView.renderCreateBookForm(contentArea, { lists: listsCache });
      refreshIcons();
    } catch (error) {
      console.error('Erro ao renderizar o formulário de livro:', error);
      showMessage('alert-circle', 'Erro ao abrir o formulário', error?.message || 'Veja o console (F12).');
    }
  }

  function showCreateList() {
    beginView();
    pageTitle.textContent = 'Criar Lista';

    if (!formView || typeof formView.renderCreateListForm !== 'function') {
      showMessage(
        'alert-circle',
        'Não foi possível abrir o formulário',
        'Verifique o console (F12) e o arquivo js/views/form_view.js.'
      );
      return;
    }

    try {
      formView.renderCreateListForm(contentArea, loadSidebarLists);
      refreshIcons();
    } catch (error) {
      console.error('Erro ao renderizar o formulário:', error);
      showMessage('alert-circle', 'Erro ao abrir o formulário', error?.message || 'Veja o console (F12).');
    }
  }

  // Verifica se já dá para navegar; senão mostra o aviso adequado.
  function podeNavegar() {
    if (!modulosProntos) {
      showMessage('loader', 'Conectando...', 'Aguarde um instante e tente novamente.');
      closeMobileMenu();
      return false;
    }

    if (!currentUser) {
      showAuth();
      closeMobileMenu();
      return false;
    }

    return true;
  }

  // Itens do menu principal (Início, Criar Livro, Criar Lista).
  function navigateTo(menuItem) {
    if (!podeNavegar()) {
      return;
    }

    selectedListId = null;

    let resultado;

    switch (menuItem.dataset.view) {
      case 'gallery':
        resultado = showGallery();
        break;

      case 'create-book':
        resultado = showCreateBook();
        break;

      case 'create-list':
        resultado = showCreateList();
        break;

      default:
        console.warn('Tela não reconhecida:', menuItem.dataset.view);
        return;
    }

    setActiveMenu(menuItem);
    closeMobileMenu();

    return resultado;
  }

  // Itens da seção "Minhas Listas".
  function openList(listItem) {
    if (!podeNavegar()) {
      return;
    }

    closeMobileMenu();

    return showList(listItem.dataset.listId);
  }

  function openView(viewName) {
    const menuItem = sidebar.querySelector(
      `.sidebar-menu .menu-item[data-view="${viewName}"]`
    );

    if (menuItem) {
      return navigateTo(menuItem);
    }
  }

  // Descobre qual item do menu foi acionado (principal ou lista).
  function activate(target) {
    const menuItem = target.closest('.sidebar-menu .menu-item[data-view]');

    if (menuItem) {
      navigateTo(menuItem);
      return true;
    }

    const listItem = target.closest('.list-menu-item[data-list-id]');

    if (listItem) {
      openList(listItem);
      return true;
    }

    return false;
  }

  sidebar.addEventListener('click', (event) => {
    activate(event.target);
  });

  sidebar.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    if (activate(event.target)) {
      event.preventDefault();
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    try {
      await authService?.signOut();
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
  });

  // Estado inicial da interface: já responde antes de qualquer rede.
  updateSidebarState();
  setSidebarMessage('Carregando...', 'loader');
  showMessage('loader', 'Conectando...', 'Carregando a biblioteca.');
  console.log('[HiBook] interface pronta');

  // ========================================
  // PARTE 5: MÓDULOS E AUTENTICAÇÃO (rede)
  // ========================================

  // Falha com mensagem clara se o carregamento demorar demais.
  function comTimeout(promise, ms, nome) {
    let timer;

    const limite = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Tempo esgotado ao carregar ${nome}`)),
        ms
      );
    });

    return Promise.race([promise, limite]).finally(() => clearTimeout(timer));
  }

  const falhas = [];

  async function carregarModulo(caminho, nomeExport) {
    try {
      const modulo = await comTimeout(import(caminho), 10000, caminho);
      return modulo[nomeExport] ?? null;
    } catch (error) {
      console.error(`Falha ao carregar ${caminho}:`, error);
      falhas.push(`${caminho} → ${error?.message || error}`);
      return null;
    }
  }

  // Chamado quando o usuário entra ou sai.
  function handleUserChange(user) {
    currentUser = user;

    endBoot();
    setAuthMode(!user);

    if (sidebarFooter) {
      sidebarFooter.hidden = !user;
    }

    if (logoutBtn) {
      logoutBtn.title = user?.email ? `Sair (${user.email})` : 'Sair';
    }

    if (user) {
      loadSidebarLists();
      openView('gallery');
    } else {
      listsCache = [];
      selectedListId = null;
      lastView = { type: 'gallery' };
      setSidebarMessage('Faça login para ver suas listas', 'lock');

      // Se a página foi aberta por um link inválido/expirado, mostra o aviso uma única vez.
      showAuth({ linkError: pendingLinkError });
      pendingLinkError = null;
    }
  }

  // Link de recuperação aberto: mostra a tela de nova senha, sem entrar no app.
  function startRecovery() {
    currentUser = null;

    endBoot();

    if (sidebarFooter) {
      sidebarFooter.hidden = true;
    }

    showAuth({
      mode: 'reset',
      onRecoveryFinished: ({ updated }) => {
        recoveryMode = false;
        lastUserId = null; // a sessão temporária foi encerrada: o próximo login deve ser tratado

        showAuth({
          mode: 'login',
          notice: updated ? 'Senha atualizada com sucesso. Entre com a nova senha.' : null
        });
      }
    });
  }

  // Seletor de tema: usa só arquivos locais (sem rede), então aparece
  // mesmo se o Supabase demorar ou falhar.
  async function montarSeletorDeTema() {
    const destino = document.getElementById('header-actions');
    const themeView = await carregarModulo('./js/views/theme_view.js', 'themeView');

    if (destino && themeView) {
      destino.appendChild(themeView.createSwitch());
    }
  }

  montarSeletorDeTema();

  // Descobre (antes de o Supabase carregar e limpar a URL) se a página foi aberta
  // por um link de recuperação de senha ou por um link inválido/expirado.
  const lerRedirect = await carregarModulo('./js/services/auth_redirect.js', 'readAuthRedirect');
  const limparErroDaUrl = await carregarModulo('./js/services/auth_redirect.js', 'clearAuthErrorFromUrl');
  const decidirEventoDeAuth = await carregarModulo('./js/services/auth_redirect.js', 'decideAuthEvent');
  const redirect = lerRedirect ? lerRedirect() : { isRecovery: false, hasError: false };

  if (redirect.isRecovery) {
    recoveryExpected = true;
  }

  if (redirect.hasError) {
    pendingLinkError = { code: redirect.errorCode, description: redirect.errorDescription };

    // O link com erro não traz sessão: dá para limpar a URL para o aviso não voltar ao atualizar.
    if (typeof limparErroDaUrl === 'function') {
      limparErroDaUrl();
    }
  }

  [listService, bookService, noteService, authService, formView, authView, modalView, galleryView, bookDetailsView] =
    await Promise.all([
      carregarModulo('./js/services/list_service.js', 'listService'),
      carregarModulo('./js/services/book_service.js', 'bookService'),
      carregarModulo('./js/services/note_service.js', 'noteService'),
      carregarModulo('./js/services/auth_service.js', 'authService'),
      carregarModulo('./js/views/form_view.js', 'formView'),
      carregarModulo('./js/views/auth_view.js', 'authView'),
      carregarModulo('./js/views/modal_view.js', 'modalView'),
      carregarModulo('./js/views/gallery_view.js', 'galleryView'),
      carregarModulo('./js/views/book_details_view.js', 'bookDetailsView')
    ]);

  modulosProntos = true;
  console.log('[HiBook] módulos carregados', { falhas });

  if (!authService) {
    endBoot();
    setAuthMode(false);
    setSidebarMessage('Erro de conexão', 'alert-circle');
    showMessage(
      'alert-circle',
      'Não foi possível conectar ao Supabase',
      falhas[0] || 'Veja o console (F12) para mais detalhes.'
    );
    return;
  }

  authService.onAuthChange((user, evento) => {
    // A regra de decisão fica em js/services/auth_redirect.js (testada à parte).
    // Sem ela, cai no comportamento simples: tratar todo evento novo de usuário.
    const decisao = decidirEventoDeAuth
      ? decidirEventoDeAuth({ recoveryExpected, recoveryMode, lastUserId }, user, evento)
      : { action: 'handle', state: { recoveryExpected, recoveryMode, lastUserId: user?.id ?? null } };

    ({ recoveryExpected, recoveryMode, lastUserId } = decisao.state);

    // setTimeout evita chamar o Supabase de dentro do callback de autenticação.
    if (decisao.action === 'start-recovery') {
      setTimeout(startRecovery, 0);
    } else if (decisao.action === 'handle') {
      setTimeout(() => handleUserChange(user), 0);
    }
  });
});