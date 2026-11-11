// Seção "Resenhas e opiniões sobre este livro": só links e trechos curtos, sempre apontando para a fonte original.
import { bookSearchService } from '../services/book_search_service.js';

const TYPE = { video: 'Vídeo', article: 'Artigo / blog', platform: 'Plataforma de leitores' };
const safeUrl = (u) => (/^https:\/\//i.test(u) ? u : null);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function link(url, text, cls = '') {
  const a = el('a', cls, text);
  a.href = safeUrl(url) || '#';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export const reviewsView = {
  createSection({ book }) {
    const section = el('section', 'detail-section rv-section');
    section.append(el('h3', 'section-title', 'Resenhas e opiniões sobre este livro'));
    const hint = el('p', 'field-hint', 'Mostramos apenas links e trechos curtos; o conteúdo completo fica no site original.');
    const btn = el('button', 'btn btn-outline', 'Buscar resenhas');
    btn.type = 'button';
    const status = el('p', 'form-message');
    status.setAttribute('role', 'status');
    const list = el('ul', 'rv-list');
    const searches = el('p', 'rv-searches');
    section.append(hint, btn, status, list, searches);
    let controller = null;

    btn.addEventListener('click', async () => {
      controller?.abort();
      controller = new AbortController();
      btn.disabled = true;
      status.className = 'form-message';
      status.textContent = 'Procurando resenhas…';
      list.replaceChildren();
      searches.replaceChildren();
      try {
        const data = await bookSearchService.reviews({ title: book.title, author: book.authors || '', isbn: book.isbn_13 || book.isbn_10 || '' }, controller.signal);
        data.items.filter((i) => safeUrl(i.url)).forEach((i) => {
          const li = el('li', 'rv-item');
          li.append(el('span', 'bs-badge', TYPE[i.type] || 'Conteúdo'), link(i.url, i.title, 'rv-title'), el('span', 'rv-source', i.source));
          if (i.description) li.appendChild(el('p', 'rv-desc', i.description));
          list.appendChild(li);
        });
        const off = Object.entries(data.providers).filter(([, v]) => v === 'not_configured').map(([k]) => k);
        status.textContent = data.items.length ? '' : 'Nenhuma resenha relevante foi encontrada automaticamente.';
        if (off.includes('youtube') || off.includes('web')) {
          list.parentNode.insertBefore(el('p', 'field-hint', 'A busca automática de vídeos e blogs não está ativada neste servidor (ver instruções de configuração).'), searches);
        }
        searches.append('Pesquisar por conta própria: ');
        data.searches.forEach((s, n) => { if (n) searches.append(' · '); searches.appendChild(link(s.url, s.label)); });
        btn.textContent = 'Buscar novamente';
      } catch (error) {
        if (error?.name !== 'AbortError') { status.className = 'form-message error-text'; status.textContent = error?.message || 'Não foi possível buscar resenhas.'; }
      } finally {
        btn.disabled = false;
      }
    });
    return { element: section };
  }
};