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
  let modulesReady = false;

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

  // Os serviços já devolvem mensagens prontas para o usuário.
  function getErrorMessage(error) {
    return error?.message || 'Ocorreu um erro inesperado.';
  }

  // ============================================================
  // PARTE 1: INTERFACE (não depende de rede)
  // ============================================================
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

      const isOpen = sidebar.classList.contains('mobile-open');

      toggleSidebarBtn?.setAttribute('aria-expanded', String(isOpen));

      // Com o menu aberto no celular, a página de trás não rola
      document.body.classList.toggle('sidebar-open', isOpen);
    } else {
      sidebar.classList.remove('mobile-open');
      document.body.classList.remove('sidebar-open');

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

  // Fechar o menu no celular: botão ✕, toque no fundo escuro ou tecla Esc.
  function dismissMobileMenu() {
    if (mobileQuery.matches && sidebar.classList.contains('mobile-open')) {
      sidebar.classList.remove('mobile-open');
      updateSidebarState();
      toggleSidebarBtn?.focus();
    }
  }

  document.getElementById('sidebar-backdrop')?.addEventListener('click', dismissMobileMenu);
  document.getElementById('sidebar-close-btn')?.addEventListener('click', dismissMobileMenu);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      dismissMobileMenu();
    }
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
  function showMessage(icon, title, text) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <i data-lucide="${icon}"></i>
        <h3></h3>
        <p></p>
      </div>
    `;

    // textContent evita inserir HTML vindo de mensagens de erro.
    contentArea.querySelector('h3').textContent = title;
    contentArea.querySelector('p').textContent = text;
    refreshIcons();
  }

  // Aviso curto no topo da área principal (sucesso ou erro de uma ação).
  function showNotice(text, tone = 'error') {
    let noticeElement = contentArea.querySelector('#notice');

    if (!noticeElement) {
      noticeElement = document.createElement('p');
      noticeElement.id = 'notice';
      noticeElement.setAttribute('role', 'status');
      contentArea.prepend(noticeElement);
    }

    noticeElement.textContent = text;
    noticeElement.className = `form-message ${tone === 'error' ? 'error-text' : 'success-text'}`;
  }

  // Avisos para quando um módulo da tela não carregou (o detalhe técnico está no console).
  function showUnavailable(what, file) {
    showMessage('alert-circle', `Não foi possível abrir ${what}`, `Verifique o console (F12) e o arquivo ${file}.`);
  }

  function noticeUnavailable(what) {
    showNotice(`Não foi possível abrir ${what}. Veja o console (F12).`);
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

  // ============================================================
  // PARTE 2: LISTAS (sidebar, renomear, excluir)
  // ============================================================
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
      setSidebarMessage(getErrorMessage(error), 'alert-circle');
    }
  }

  async function renameList(list) {
    if (!modalView || !listService) {
      noticeUnavailable('a janela de edição');
      return;
    }

    const saved = await modalView.editText({
      title: 'Renomear lista',
      label: 'Novo nome',
      initialValue: list.name,
      confirmText: 'Salvar',
      maxLength: 60,
      onSubmit: async (newName) => {
        try {
          await listService.renameList(list.id, newName);
        } catch (error) {
          console.error('Erro ao renomear lista:', error);
          throw new Error(getErrorMessage(error));
        }
      }
    });

    if (!saved) {
      return;
    }

    await loadSidebarLists();
    await showList(list.id);
  }

  async function deleteList(list) {
    if (!modalView || !listService) {
      noticeUnavailable('a confirmação');
      return;
    }

    const confirmed = await modalView.confirm({
      title: 'Excluir lista',
      message:
        `A lista "${list.name}" será excluída. ` +
        'Os livros que estão nela não serão apagados: eles apenas deixarão de pertencer a esta lista.',
      confirmText: 'Excluir',
      danger: true
    });

    if (!confirmed) {
      return;
    }

    try {
      await listService.deleteList(list.id);

      selectedListId = null;
      await loadSidebarLists();
      await openView('gallery');
      showNotice(`Lista "${list.name}" excluída.`, 'success');
    } catch (error) {
      console.error('Erro ao excluir lista:', error);
      showNotice(getErrorMessage(error));
    }
  }

  // ============================================================
  // PARTE 3: LIVROS (galeria, detalhes, editar, excluir)
  // ============================================================
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

      galleryView.renderError(container, getErrorMessage(error), () =>
        loadBooksInto(container, token, listId, emptyInfo)
      );
      refreshIcons();
    }
  }

  function openBookDetails(book) {
    if (!bookDetailsView || !bookService) {
      noticeUnavailable('os detalhes');
      return;
    }

    const bookListNames = (book.book_lists ?? [])
      .map((link) => listsCache.find((list) => list.id === link.list_id)?.name)
      .filter(Boolean);

    bookDetailsView.open({
      book,
      listNames: bookListNames,
      onRate: (targetBook, rating) => bookService.setRating(targetBook.id, rating),
      onSaveProgress: (targetBook, page) => bookService.setCurrentPage(targetBook, page),
      // Anotações por página (nulo se o módulo não carregou: a janela abre sem essa seção).
      notesApi: noteService
        ? {
            list: (targetBook) => noteService.getNotes(targetBook.id),
            create: (targetBook, noteData) => noteService.createNote(targetBook, noteData),
            update: (targetBook, note, noteData) => noteService.updateNote(targetBook, note, noteData),
            remove: (note) => noteService.deleteNote(note.id)
          }
        : null,
      confirmDelete: modalView ? (dialogOptions) => modalView.confirm(dialogOptions) : null,
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
      showUnavailable('o formulário', 'js/views/form_view.js');
      return;
    }

    try {
      formView.renderEditBookForm(contentArea, {
        book,
        lists: listsCache,
        onCancel: () => refreshCurrentView(),
        onSaved: async () => {
          await refreshCurrentView();
          showNotice('Livro atualizado com sucesso!', 'success');
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
      noticeUnavailable('a confirmação');
      return;
    }

    const confirmed = await modalView.confirm({
      title: 'Excluir livro',
      message: `O livro "${book.title}" e a imagem da capa serão excluídos permanentemente.`,
      confirmText: 'Excluir',
      danger: true
    });

    if (!confirmed) {
      return;
    }

    try {
      await bookService.deleteBook(book);

      await refreshCurrentView();
      showNotice(`Livro "${book.title}" excluído.`, 'success');
    } catch (error) {
      console.error('Erro ao excluir livro:', error);
      showNotice(getErrorMessage(error));
    }
  }

  // ============================================================
  // PARTE 4: TELAS E NAVEGAÇÃO
  // ============================================================
  // Telas de autenticação ocupam a tela toda: sem menu lateral e sem cabeçalho.
  function setAuthMode(isActive) {
    document.body.classList.toggle('auth-mode', isActive);
    contentArea.setAttribute('aria-live', isActive ? 'off' : 'polite');
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
      showUnavailable('o login', 'js/views/auth_view.js');
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
      showUnavailable('o formulário', 'js/views/form_view.js');
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
      showUnavailable('o formulário', 'js/views/form_view.js');
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
  function canNavigate() {
    if (!modulesReady) {
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
    if (!canNavigate()) {
      return;
    }

    selectedListId = null;

    let navigationResult;

    switch (menuItem.dataset.view) {
      case 'gallery':
        navigationResult = showGallery();
        break;

      case 'create-book':
        navigationResult = showCreateBook();
        break;

      case 'create-list':
        navigationResult = showCreateList();
        break;

      default:
        console.warn('Tela não reconhecida:', menuItem.dataset.view);
        return;
    }

    setActiveMenu(menuItem);
    closeMobileMenu();

    return navigationResult;
  }

  // Itens da seção "Minhas Listas".
  function openList(listItem) {
    if (!canNavigate()) {
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

  // ============================================================
  // PARTE 5: MÓDULOS E AUTENTICAÇÃO (rede)
  // ============================================================
  // Falha com mensagem clara se o carregamento demorar demais.
  function withTimeout(promise, ms, name) {
    let timer;

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Tempo esgotado ao carregar ${name}`)),
        ms
      );
    });

    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
  }

  const loadFailures = [];

  async function loadModule(modulePath, exportName) {
    try {
      const loadedModule = await withTimeout(import(modulePath), 10000, modulePath);
      return loadedModule[exportName] ?? null;
    } catch (error) {
      console.error(`Falha ao carregar ${modulePath}:`, error);
      loadFailures.push(`${modulePath} → ${error?.message || error}`);
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
  async function mountThemeSwitch() {
    const target = document.getElementById('header-actions');
    const themeView = await loadModule('./js/views/theme_view.js', 'themeView');

    if (target && themeView) {
      target.appendChild(themeView.createSwitch());
    }
  }

  mountThemeSwitch();

  // Descobre (antes de o Supabase carregar e limpar a URL) se a página foi aberta
  // por um link de recuperação de senha ou por um link inválido/expirado.
  const readAuthRedirect = await loadModule('./js/services/auth_redirect.js', 'readAuthRedirect');
  const clearAuthErrorFromUrl = await loadModule('./js/services/auth_redirect.js', 'clearAuthErrorFromUrl');
  const decideAuthEvent = await loadModule('./js/services/auth_redirect.js', 'decideAuthEvent');
  const authRedirect = readAuthRedirect ? readAuthRedirect() : { isRecovery: false, hasError: false };

  if (authRedirect.isRecovery) {
    recoveryExpected = true;
  }

  if (authRedirect.hasError) {
    pendingLinkError = { code: authRedirect.errorCode, description: authRedirect.errorDescription };

    // O link com erro não traz sessão: dá para limpar a URL para o aviso não voltar ao atualizar.
    if (typeof clearAuthErrorFromUrl === 'function') {
      clearAuthErrorFromUrl();
    }
  }

  [listService, bookService, noteService, authService, formView, authView, modalView, galleryView, bookDetailsView] =
    await Promise.all([
      loadModule('./js/services/list_service.js', 'listService'),
      loadModule('./js/services/book_service.js', 'bookService'),
      loadModule('./js/services/note_service.js', 'noteService'),
      loadModule('./js/services/auth_service.js', 'authService'),
      loadModule('./js/views/form_view.js', 'formView'),
      loadModule('./js/views/auth_view.js', 'authView'),
      loadModule('./js/views/modal_view.js', 'modalView'),
      loadModule('./js/views/gallery_view.js', 'galleryView'),
      loadModule('./js/views/book_details_view.js', 'bookDetailsView')
    ]);

  modulesReady = true;

  if (!authService) {
    endBoot();
    setAuthMode(false);
    setSidebarMessage('Erro de conexão', 'alert-circle');
    showMessage(
      'alert-circle',
      'Não foi possível conectar ao Supabase',
      loadFailures[0] || 'Veja o console (F12) para mais detalhes.'
    );
    return;
  }

  authService.onAuthChange((user, authEvent) => {
    // A regra de decisão fica em js/services/auth_redirect.js (testada à parte).
    // Sem ela, cai no comportamento simples: tratar todo evento novo de usuário.
    const decision = decideAuthEvent
      ? decideAuthEvent({ recoveryExpected, recoveryMode, lastUserId }, user, authEvent)
      : { action: 'handle', state: { recoveryExpected, recoveryMode, lastUserId: user?.id ?? null } };

    ({ recoveryExpected, recoveryMode, lastUserId } = decision.state);

    // setTimeout evita chamar o Supabase de dentro do callback de autenticação.
    if (decision.action === 'start-recovery') {
      setTimeout(startRecovery, 0);
    } else if (decision.action === 'handle') {
      setTimeout(() => handleUserChange(user), 0);
    }
  });
});
