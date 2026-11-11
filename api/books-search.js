// GET /api/books-search?q=...&page=0  ->  edições normalizadas do Google Books + Open Library.
import { fetchJson, send, guard } from './_lib/http.js';
import { normalizeGoogle, normalizeOpenLibraryEdition, normalizeOpenLibraryWork, mergeResults, cleanIsbn, isIsbn10, isIsbn13, isbn10to13 } from './_lib/normalize.js';

const PAGE = 20, OL_WORKS = 6, OL_WITH_EDITIONS = 3, OL_EDITIONS = 15;

async function searchGoogle(q, isbn, page) {
  const p = new URLSearchParams({ q: isbn ? `isbn:${isbn}` : q, maxResults: String(PAGE), startIndex: String(page * PAGE), printType: 'books', orderBy: 'relevance', fields: 'items(id,volumeInfo)' });
  if (process.env.GOOGLE_BOOKS_API_KEY) p.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  const d = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${p}`);
  return { items: (d.items || []).map(normalizeGoogle).filter(Boolean), more: (d.items || []).length === PAGE };
}

async function searchOpenLibrary(q, isbn, page) {
  const p = new URLSearchParams({ q: isbn ? `isbn:${isbn}` : q, limit: String(OL_WORKS), page: String(page + 1), fields: 'key,title,author_name,first_publish_year,cover_i,subject' });
  const d = await fetchJson(`https://openlibrary.org/search.json?${p}`, { timeout: 5000 });
  const docs = d.docs || [];
  const lists = await Promise.all(docs.map(async (doc, i) => {
    if (i >= OL_WITH_EDITIONS) return [normalizeOpenLibraryWork(doc)];
    try {
      const e = await fetchJson(`https://openlibrary.org${doc.key}/editions.json?limit=${OL_EDITIONS}`, { timeout: 4000 });
      let eds = (e.entries || []).map((x) => normalizeOpenLibraryEdition(x, doc)).filter(Boolean);
      if (isbn) eds = eds.filter((x) => [x.isbn13, x.isbn10, x.isbn10 && isbn10to13(x.isbn10)].includes(isbn));
      return eds.length ? eds : [normalizeOpenLibraryWork(doc)];
    } catch {
      return [normalizeOpenLibraryWork(doc)];
    }
  }));
  return { items: lists.flat().filter(Boolean), more: docs.length === OL_WORKS };
}

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const q = String(req.query.q || '').trim().slice(0, 120);
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 0, 0), 9);
  if (q.length < 2) return send(res, 400, { error: 'Digite pelo menos 2 caracteres.' });
  const code = cleanIsbn(q);
  const isbn = isIsbn10(code) || isIsbn13(code) ? code : null;
  const [g, o] = await Promise.allSettled([searchGoogle(q, isbn, page), searchOpenLibrary(q, isbn, page)]);
  const sources = { google: g.status === 'fulfilled' ? 'ok' : 'error', openlibrary: o.status === 'fulfilled' ? 'ok' : 'error' };
  if (g.status === 'rejected' && o.status === 'rejected') {
    return send(res, 502, { error: 'Não foi possível consultar os catálogos online agora. Tente novamente em instantes.', sources });
  }
  const items = mergeResults([g.value?.items || [], o.value?.items || []], q);
  return send(res, 200, { items, hasMore: Boolean(g.value?.more || o.value?.more), sources }, 'private, max-age=60');
}