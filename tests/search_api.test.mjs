// Testes das funções de busca com respostas simuladas (formato documentado das APIs). Rodam sem internet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGoogle, normalizeOpenLibraryEdition, normalizeOpenLibraryWork, mergeResults, isIsbn10, isIsbn13, isbn10to13, cleanDescription } from '../api/_lib/normalize.js';
import { allowedCoverHost } from '../api/_lib/http.js';

const google = (id, o = {}) => ({ id, volumeInfo: { title: 'Harry Potter e a Pedra Filosofal', authors: ['J. K. Rowling'], publisher: 'Rocco', publishedDate: '2000-08-01', description: '<p>Um menino bruxo.<br>Fim.</p>', pageCount: 264, language: 'pt-BR',
  industryIdentifiers: [{ type: 'ISBN_10', identifier: '8532511015' }, { type: 'ISBN_13', identifier: '9788532511010' }, { type: 'OTHER', identifier: 'x' }],
  imageLinks: { thumbnail: 'http://books.google.com/books/content?id=1&zoom=1&edge=curl' }, categories: ['Fiction'], ...o } });
const olWork = { key: '/works/OL82563W', title: 'Harry Potter and the Philosopher\'s Stone', author_name: ['J. K. Rowling'], cover_i: 8, subject: ['Magic'] };
const olEd = { key: '/books/OL1M', title: 'Harry Potter e a Pedra Filosofal', publishers: ['Rocco'], publish_date: 'Aug 2000', number_of_pages: 264, isbn_13: ['9788532511010'], languages: [{ key: '/languages/por' }], covers: [123] };

test('isbn: validação e conversão', () => {
  assert.ok(isIsbn10('0306406152') && isIsbn13('9780306406157') && !isIsbn13('9780306406158'));
  assert.equal(isbn10to13('0306406152'), '9780306406157');
});
test('Google: campos, HTML removido, https e sem inventar dados', () => {
  const b = normalizeGoogle(google('A'));
  assert.equal(b.isbn13, '9788532511010'); assert.equal(b.isbn10, '8532511015'); assert.equal(b.year, 2000); assert.equal(b.language, 'pt');
  assert.match(b.coverUrl, /^https:\/\/books\.google\.com.*zoom=2/); assert.ok(!b.coverUrl.includes('edge=curl')); assert.equal(b.description, 'Um menino bruxo.\nFim.');
  const bare = normalizeGoogle({ id: 'B', volumeInfo: { title: 'Sem dados' } });
  assert.deepEqual([bare.authors, bare.pages, bare.isbn13, bare.coverUrl, bare.year], [[], null, null, null, null]);
  assert.equal(normalizeGoogle({ id: 'C', volumeInfo: {} }), null);
});
test('Open Library: edição e obra', () => {
  const e = normalizeOpenLibraryEdition(olEd, olWork);
  assert.deepEqual([e.publisher, e.year, e.pages, e.language, e.isbn13], ['Rocco', 2000, 264, 'pt', '9788532511010']);
  assert.match(e.coverUrl, /b\/id\/123-L\.jpg\?default=false/);
  const w = normalizeOpenLibraryWork(olWork);
  assert.ok(w.isWork && !w.isbn13 && !w.publisher && w.year === null);
});
test('fusão: mesmo ISBN funde fontes; ISBN diferente = outra edição; obra redundante some', () => {
  const g1 = normalizeGoogle(google('A')), g2 = normalizeGoogle(google('B', { publisher: 'Outra', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780306406157' }] }));
  const items = mergeResults([[g1, g2], [normalizeOpenLibraryEdition(olEd, olWork), normalizeOpenLibraryWork({ ...olWork, title: g1.title })]], 'harry potter pedra filosofal');
  assert.equal(items.length, 2);
  const m = items.find((i) => i.isbn13 === '9788532511010');
  assert.deepEqual(m.sources.sort(), ['google', 'openlibrary']);
});
test('cleanDescription e hosts de capa', () => {
  assert.equal(cleanDescription('<b>A</b> &amp; B'), 'A & B');
  assert.ok(allowedCoverHost('covers.openlibrary.org') && allowedCoverHost('ia800.us.archive.org'));
  assert.ok(!allowedCoverHost('evil.com') && !allowedCoverHost('archive.org.evil.com'));
});

// --- Funções com fetch simulado ---
const res = () => ({ h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } });
const json = (o, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => o, headers: new Headers() });
process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'k';
const authed = (q) => ({ method: 'GET', query: q, headers: { authorization: 'Bearer t' } });

test('books-search: exige login, mescla fontes e tolera falha de uma delas', async () => {
  const { default: handler } = await import('../api/books-search.js');
  let r = res(); await handler({ method: 'GET', query: { q: 'harry' }, headers: {} }, r); assert.equal(r.code, 401);
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json({ id: 'u' });
    if (u.includes('googleapis.com/books')) return json({ items: [google('A')] });
    if (u.includes('search.json')) return json({ docs: [olWork] });
    if (u.includes('/editions.json')) return json({ entries: [olEd] });
    throw new Error(u);
  };
  r = res(); await handler(authed({ q: 'harry potter' }), r);
  assert.equal(r.code, 200); assert.equal(r.body.items.length, 1); assert.deepEqual(r.body.sources, { google: 'ok', openlibrary: 'ok' });
  global.fetch = async (url) => (String(url).includes('/auth/v1/user') ? json({ id: 'u' }) : String(url).includes('googleapis') ? json({}, false) : json({ docs: [olWork] }));
  r = res(); await handler(authed({ q: 'harry potter' }), r);
  assert.equal(r.code, 200); assert.equal(r.body.sources.google, 'error'); assert.ok(r.body.items.length >= 1);
  global.fetch = async (url) => (String(url).includes('/auth/v1/user') ? json({ id: 'u' }) : json({}, false));
  r = res(); await handler(authed({ q: 'harry potter' }), r); assert.equal(r.code, 502);
});

test('cover: valida host, tipo e tamanho', async () => {
  const { default: handler } = await import('../api/cover.js');
  let r = res(); await handler({ query: { url: 'https://evil.com/a.jpg' } }, r); assert.equal(r.code, 400);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(3000)]);
  global.fetch = async () => ({ ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => png });
  r = res(); await handler({ query: { url: 'https://covers.openlibrary.org/b/id/1-L.jpg' } }, r); assert.equal(r.code, 200); assert.equal(r.h['Content-Type'], 'image/png');
  global.fetch = async () => ({ ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => Buffer.from('<html>'.repeat(500)) });
  r = res(); await handler({ query: { url: 'https://books.google.com/x' } }, r); assert.equal(r.code, 422);
  global.fetch = async () => ({ ok: true, status: 302, headers: new Headers({ location: 'https://evil.com/a' }) });
  r = res(); await handler({ query: { url: 'https://books.google.com/x' } }, r); assert.equal(r.code, 400);
});

test('reviews: só mantém resultados relevantes e informa o que não está configurado', async () => {
  const { default: handler } = await import('../api/reviews.js');
  process.env.YOUTUBE_API_KEY = 'y'; delete process.env.BRAVE_SEARCH_API_KEY;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json({ id: 'u' });
    if (u.includes('en.wikipedia.org')) return json({});
    if (u.includes('wikipedia.org')) return json({ query: { pages: { 1: { title: 'Harry Potter e a Pedra Filosofal', extract: 'Livro de J. K. Rowling.', fullurl: 'https://pt.wikipedia.org/wiki/X' }, 2: { title: 'Outro assunto', extract: 'Rowling', fullurl: 'https://pt.wikipedia.org/wiki/Y' } } } });
    if (u.includes('youtube/v3')) return json({ items: [
      { id: { videoId: 'a1' }, snippet: { title: 'Resenha: Harry Potter e a Pedra Filosofal', channelTitle: 'Canal', description: 'Minha opinião' } },
      { id: { videoId: 'b2' }, snippet: { title: 'Top 10 filmes de 2020', channelTitle: 'Canal', description: 'Harry Potter e a Pedra Filosofal aparece rapidamente' } }] });
    throw new Error(u);
  };
  const r = res(); await handler(authed({ title: 'Harry Potter e a Pedra Filosofal', author: 'J. K. Rowling' }), r);
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.items.map((i) => [i.type, i.url.slice(0, 29)]), [['video', 'https://www.youtube.com/watch'], ['article', 'https://pt.wikipedia.org/wiki']]);
  assert.equal(r.body.providers.web, 'not_configured'); assert.ok(r.body.searches.length >= 3);
});
