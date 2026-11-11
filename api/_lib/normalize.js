// Normalização e fusão dos resultados do Google Books e do Open Library (sem dependências).
const LANG3 = { por: 'pt', eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', jpn: 'ja', chi: 'zh', zho: 'zh', rus: 'ru', lat: 'la', kor: 'ko', ara: 'ar', dut: 'nl', nld: 'nl', pol: 'pl', swe: 'sv' };

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const arr = (v) => (Array.isArray(v) ? v.map((x) => cleanText(x)).filter(Boolean) : []);
const posInt = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n <= 100000 ? n : null; };

export function cleanText(v) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}
export function cleanDescription(v) {
  const raw = typeof v === 'string' ? v : typeof v?.value === 'string' ? v.value : '';
  return raw.replace(/<\s*(br|\/p|\/li)\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

export const cleanIsbn = (s) => String(s ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
export function isIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  return [...s].reduce((sum, c, i) => sum + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 === 0;
}
export function isIsbn13(s) {
  if (!/^\d{13}$/.test(s)) return false;
  return [...s].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0;
}
export function isbn10to13(s) {
  const body = `978${s.slice(0, 9)}`;
  const check = (10 - ([...body].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) % 10)) % 10;
  return body + check;
}
export const parseYear = (v) => { const m = String(v ?? '').match(/\b(1\d{3}|20\d{2})\b/); return m ? Number(m[1]) : null; };
export const normLang = (c) => { const s = String(c ?? '').toLowerCase(); return s.length === 3 ? LANG3[s] || s : s.slice(0, 2); };
const https = (u) => (typeof u === 'string' && /^https?:\/\//.test(u) ? u.replace(/^http:/, 'https:') : null);

function finish(b) {
  const isbn13 = b.isbn13 || (b.isbn10 ? isbn10to13(b.isbn10) : null);
  const label = [b.publisher, b.year, b.language && b.language.toUpperCase(), b.pages && `${b.pages} p.`].filter(Boolean).join(' · ');
  const key = isbn13 ? `i:${isbn13}` : `t:${norm(b.title)}|${norm(b.authors[0])}|${norm(b.publisher)}|${b.year ?? ''}`;
  return { subtitle: '', description: '', categories: [], isWork: false, infoUrl: null, ...b, key, editionLabel: b.isWork ? 'Obra (edições não detalhadas)' : label || 'Edição sem detalhes' };
}
const pickIsbn = (list, ok) => list.map(cleanIsbn).find(ok) || null;

export function normalizeGoogle(item) {
  const v = item?.volumeInfo;
  if (!item?.id || !v?.title) return null;
  const ids = Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers : [];
  const cover = https(v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail);
  return finish({
    id: `google:${item.id}`, sources: ['google'], title: cleanText(v.title), subtitle: cleanText(v.subtitle), authors: arr(v.authors), publisher: cleanText(v.publisher),
    year: parseYear(v.publishedDate), language: normLang(v.language) || null, pages: posInt(v.pageCount),
    isbn10: pickIsbn(ids.filter((x) => x.type === 'ISBN_10').map((x) => x.identifier), isIsbn10),
    isbn13: pickIsbn(ids.filter((x) => x.type === 'ISBN_13').map((x) => x.identifier), isIsbn13),
    categories: arr(v.categories).slice(0, 8), description: cleanDescription(v.description),
    coverUrl: cover ? cover.replace('&edge=curl', '').replace('zoom=1', 'zoom=2') : null,
    infoUrl: https(v.infoLink)
  });
}

export function normalizeOpenLibraryEdition(ed, work) {
  if (!ed?.key) return null;
  const cover = (ed.covers || []).find((n) => Number(n) > 0);
  return finish({
    id: `openlibrary:${ed.key.split('/').pop()}`, sources: ['openlibrary'], title: cleanText(ed.title) || cleanText(work.title), subtitle: cleanText(ed.subtitle),
    authors: arr(work.author_name), publisher: cleanText((ed.publishers || [])[0]), year: parseYear(ed.publish_date),
    language: normLang(((ed.languages || [])[0]?.key || '').split('/').pop()) || null, pages: posInt(ed.number_of_pages),
    isbn10: pickIsbn(ed.isbn_10 || [], isIsbn10), isbn13: pickIsbn(ed.isbn_13 || [], isIsbn13),
    categories: arr(work.subject).slice(0, 4), description: cleanDescription(ed.description),
    coverUrl: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg?default=false` : null, infoUrl: `https://openlibrary.org${ed.key}`
  });
}

export function normalizeOpenLibraryWork(doc) {
  if (!doc?.key || !doc.title) return null;
  return finish({
    id: `openlibrary:${doc.key.split('/').pop()}`, sources: ['openlibrary'], isWork: true, title: cleanText(doc.title), authors: arr(doc.author_name),
    publisher: '', year: null, language: null, pages: null, isbn10: null, isbn13: null, categories: arr(doc.subject).slice(0, 4),
    coverUrl: doc.cover_i > 0 ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false` : null, infoUrl: `https://openlibrary.org${doc.key}`
  });
}

function merge(a, b) {
  const out = { ...a, sources: [...new Set([...a.sources, ...b.sources])] };
  for (const f of ['subtitle', 'publisher', 'year', 'language', 'pages', 'isbn10', 'isbn13', 'coverUrl', 'infoUrl']) if (!out[f]) out[f] = b[f];
  if (!out.authors.length) out.authors = b.authors;
  if (!out.categories.length) out.categories = b.categories;
  if (b.description.length > out.description.length) out.description = b.description;
  return out;
}

// Junta as fontes sem perder edições diferentes: só funde o que tem a mesma chave (ISBN ou título+autor+editora+ano).
export function mergeResults(lists, query) {
  const map = new Map();
  for (const item of lists.flat()) map.set(item.key, map.has(item.key) ? merge(map.get(item.key), item) : item);
  let items = [...map.values()];
  const editions = new Set(items.filter((i) => !i.isWork).map((i) => `${norm(i.title)}|${norm(i.authors[0])}`));
  items = items.filter((i) => !i.isWork || !editions.has(`${norm(i.title)}|${norm(i.authors[0])}`));
  const tokens = norm(query).split(' ').filter((t) => t.length > 1);
  const score = (i) => {
    const hay = norm(`${i.title} ${i.subtitle} ${i.authors.join(' ')}`);
    const hit = tokens.length ? tokens.filter((t) => hay.includes(t)).length / tokens.length : 0;
    return hit * 10 + (i.coverUrl ? 1 : 0) + (i.isbn13 || i.isbn10 ? 1 : 0) + (i.pages ? 0.5 : 0) + (i.description ? 0.5 : 0) - (i.isWork ? 2 : 0);
  };
  return items.map((i, n) => ({ i, n, s: score(i) })).sort((x, y) => y.s - x.s || x.n - y.n).map((x) => x.i);
}