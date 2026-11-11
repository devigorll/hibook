// Escolha "buscar na internet" x "manual" e tela de pesquisa com cards de edições.
import { bookSearchService } from '../services/book_search_service.js';

const names = (() => { try { return new Intl.DisplayNames(['pt-BR'], { type: 'language' }); } catch { return null; } })();
const langName = (c) => { try { return names?.of(c) || c; } catch { return c; } };
const SOURCE = { google: 'Google Books', openlibrary: 'Open Library' };
let state = { q: '', items: [], keys: new Set(), page: 0, hasMore: false };
let controller = null;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function icon(name) {
  const i = document.createElement('i');
  i.setAttribute('data-lucide', name);
  i.setAttribute('aria-hidden', 'true');
  return i;
}
function button(cls, iconName, label, onClick) {
  const b = el('button', cls);
  b.type = 'button';
  if (iconName) b.appendChild(icon(iconName));
  b.appendChild(el('span', '', label));
  b.addEventListener('click', onClick);
  return b;
}
const refreshIcons = () => window.lucide?.createIcons?.();

function option(primary, iconName, title, text, onClick) {
  const b = el('button', `bs-option${primary ? ' bs-option-primary' : ''}`);
  b.type = 'button';
  b.append(icon(iconName), el('strong', '', title), el('span', 'bs-option-text', text));
  if (primary) b.appendChild(el('span', 'bs-badge', 'Recomendado'));
  b.addEventListener('click', onClick);
  return b;
}

function card(item, onSelect) {
  const art = el('article', 'bs-card');
  const cover = el('div', 'bs-cover');
  const placeholder = () => cover.replaceChildren(el('span', 'bs-nocover', 'Sem capa'));
  if (item.coverUrl) {
    const img = el('img');
    img.loading = 'lazy';
    img.alt = `Capa de ${item.title}`;
    img.addEventListener('error', placeholder);
    img.src = bookSearchService.coverThumbUrl(item.coverUrl);
    cover.appendChild(img);
  } else {
    placeholder();
  }
  const info = el('div', 'bs-info');
  info.appendChild(el('h4', 'bs-title', item.title));
  if (item.subtitle) info.appendChild(el('p', 'bs-subtitle', item.subtitle));
  info.appendChild(el('p', 'bs-authors', item.authors.join(', ') || 'Autor não informado'));
  const meta = el('ul', 'bs-meta');
  [['Editora', item.publisher], ['Ano', item.year], ['Páginas', item.pages], ['Idioma', item.language && langName(item.language)], ['ISBN-13', item.isbn13], ['ISBN-10', item.isbn10]]
    .filter(([, v]) => v)
    .forEach(([k, v]) => { const li = el('li'); li.append(el('span', 'bs-k', `${k}: `), document.createTextNode(String(v))); meta.appendChild(li); });
  info.appendChild(meta);
  const badges = el('div', 'bs-badges');
  badges.appendChild(el('span', 'bs-badge bs-badge-edition', item.editionLabel));
  item.sources.forEach((s) => badges.appendChild(el('span', 'bs-badge', SOURCE[s] || s)));
  info.appendChild(badges);
  info.appendChild(button('btn btn-primary bs-select', 'check', 'Selecionar edição', () => onSelect(item)));
  art.append(cover, info);
  return art;
}

export const bookSearchView = {
  // Tela inicial do "Adicionar livro": duas opções.
  renderChooser(container, { onManual, onSelect }) {
    const box = el('div', 'form-card bs-chooser');
    box.append(el('h3', '', 'Adicionar livro'), el('p', 'form-subtitle', 'Como você quer cadastrar o livro?'));
    const grid = el('div', 'bs-options');
    grid.append(
      option(true, 'search', 'Buscar livro na internet', 'Pesquise pelo título, autor ou ISBN, escolha a edição e os dados são preenchidos para você.', () => this.renderSearch(container, { onManual, onSelect })),
      option(false, 'pencil', 'Cadastrar manualmente', 'Preencha capa, título e demais dados você mesmo.', onManual)
    );
    box.appendChild(grid);
    container.replaceChildren(box);
    refreshIcons();
  },

  renderSearch(container, { onManual, onSelect }) {
    const box = el('div', 'form-card bs-search');
    const head = el('div', 'bs-head');
    head.append(button('btn btn-outline', 'arrow-left', 'Voltar', () => { controller?.abort(); this.renderChooser(container, { onManual, onSelect }); }), el('h3', '', 'Buscar livro na internet'));
    const form = el('form', 'bs-form');
    form.noValidate = true;
    const label = el('label', 'sr-only', 'Título, autor ou ISBN');
    label.htmlFor = 'bs-query';
    const input = el('input');
    Object.assign(input, { id: 'bs-query', type: 'search', maxLength: 120, autocomplete: 'off', placeholder: 'Ex.: Harry Potter e a Pedra Filosofal', value: state.q });
    const submit = button('btn btn-primary', 'search', 'Buscar', () => {});
    submit.type = 'submit';
    form.append(label, input, submit);
    const status = el('p', 'bs-status');
    status.setAttribute('role', 'status');
    const grid = el('div', 'bs-grid');
    const more = button('btn btn-outline bs-more', 'plus', 'Carregar mais resultados', () => run(state.q, state.page + 1));
    more.hidden = true;
    const again = button('link-btn', 'rotate-ccw', 'Nova pesquisa', () => { state = { q: '', items: [], keys: new Set(), page: 0, hasMore: false }; input.value = ''; draw(); input.focus(); });
    box.append(head, form, status, grid, more, again);
    container.replaceChildren(box);

    const select = (item) => onSelect(item, () => this.renderSearch(container, { onManual, onSelect }));
    function draw(message = '', isError = false) {
      grid.replaceChildren(...state.items.map((i) => card(i, select)));
      more.hidden = !state.hasMore;
      again.hidden = !state.items.length;
      status.className = `bs-status${isError ? ' error-text' : ''}`;
      status.textContent = message || (state.items.length ? `${state.items.length} edições encontradas. Escolha a que você possui.` : '');
      refreshIcons();
    }
    async function run(q, page) {
      controller?.abort();
      controller = new AbortController();
      const mine = controller;
      submit.disabled = more.disabled = true;
      status.className = 'bs-status';
      status.textContent = 'Buscando nos catálogos…';
      if (page === 0) { grid.replaceChildren(...Array.from({ length: 4 }, () => el('div', 'bs-card bs-skeleton'))); more.hidden = true; }
      try {
        const data = await bookSearchService.search(q, { page, signal: mine.signal });
        if (page === 0) state = { q, items: [], keys: new Set(), page: 0, hasMore: false };
        data.items.filter((i) => !state.keys.has(i.key)).forEach((i) => { state.keys.add(i.key); state.items.push(i); });
        Object.assign(state, { page, hasMore: data.hasMore });
        const partial = Object.values(data.sources || {}).includes('error');
        draw(!state.items.length ? 'Nenhum livro encontrado. Tente outro título, o nome do autor ou o ISBN.' : partial ? 'Uma das fontes não respondeu; os resultados podem estar incompletos.' : '');
      } catch (error) {
        if (error?.name === 'AbortError') return;
        draw(error?.message || 'Não foi possível buscar agora.', true);
      } finally {
        if (controller === mine) submit.disabled = more.disabled = false;
      }
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const q = input.value.trim();
      if (q.length < 2) { draw('Digite pelo menos 2 caracteres.', true); return; }
      run(q, 0);
    });
    draw();
    input.focus();
  }
};