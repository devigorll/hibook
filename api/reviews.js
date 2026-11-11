// GET /api/reviews?title=&author=&isbn=  ->  referências externas (Wikipédia, YouTube e web). Só links e trechos curtos.
// YouTube e web só funcionam com chave (YOUTUBE_API_KEY, BRAVE_SEARCH_API_KEY); sem chave, nada é inventado.
import { fetchJson, send, guard } from './_lib/http.js';
import { norm } from './_lib/normalize.js';

const KEYWORDS = /resenha|review|analise|critica|opiniao|vale a pena|sobre o livro|leitura/;
const SHOPS = /(amazon|mercadolivre|shopee|magazineluiza|americanas|submarino|aliexpress|shein|casasbahia|kabum|estantevirtual|travessa|saraiva)\./;
const PLATFORMS = /(goodreads|skoob|storygraph|librarything|bookwyrm|leitor\.net)/;
const short = (s, n = 200) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const mainTitle = (t) => norm(String(t).split(/[:(–—-]/)[0]);
const hasTitle = (text, title) => { const m = mainTitle(title); return m.length > 1 && ` ${norm(text)} `.includes(` ${m} `); };

async function wikipedia(title, author) {
  const results = await Promise.all(['pt', 'en'].map(async (lang) => {
    const out = [];
    const p = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${title} ${author}`.trim(), gsrlimit: '3', prop: 'extracts|info', exintro: '1', explaintext: '1', exchars: '300', inprop: 'url', redirects: '1' });
    const d = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${p}`, { timeout: 5000 }).catch(() => null);
    const last = norm(author).split(' ').pop();
    for (const pg of Object.values(d?.query?.pages || {})) {
      if (!hasTitle(pg.title, title) || (last && !norm(pg.extract).includes(last))) continue;
      out.push({ type: 'article', title: pg.title, source: `Wikipédia (${lang})`, description: short(pg.extract, 220), url: pg.fullurl });
    }
    return out;
  }));
  return results.flat().slice(0, 2);
}

async function youtube(title, author) {
  const p = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '10', q: `resenha ${title} ${author}`.trim(), relevanceLanguage: 'pt', safeSearch: 'moderate', key: process.env.YOUTUBE_API_KEY });
  const d = await fetchJson(`https://www.googleapis.com/youtube/v3/search?${p}`);
  return (d.items || []).filter((v) => v.id?.videoId && hasTitle(v.snippet?.title, title) && KEYWORDS.test(norm(`${v.snippet.title} ${v.snippet.description}`)))
    .slice(0, 5).map((v) => ({ type: 'video', title: short(v.snippet.title, 120), source: v.snippet.channelTitle, description: short(v.snippet.description, 160), url: `https://www.youtube.com/watch?v=${v.id.videoId}` }));
}

async function web(title, author) {
  const p = new URLSearchParams({ q: `"${title}" ${author} resenha livro`.trim(), count: '15', country: 'BR', search_lang: 'pt' });
  const d = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${p}`, { headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY } });
  const perHost = {};
  return (d.web?.results || []).filter((r) => {
    let host; try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch { return false; }
    r.host = host;
    const text = `${r.title} ${r.description}`;
    if (SHOPS.test(`${host}.`) || !hasTitle(text, title) || !KEYWORDS.test(norm(text))) return false;
    perHost[host] = (perHost[host] || 0) + 1;
    return perHost[host] <= 2;
  }).slice(0, 6).map((r) => ({ type: PLATFORMS.test(r.host) ? 'platform' : 'article', title: short(r.title, 120), source: r.host, description: short(r.description, 200), url: r.url }));
}

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const title = String(req.query.title || '').trim().slice(0, 200);
  const author = String(req.query.author || '').split(',')[0].trim().slice(0, 100);
  if (title.length < 2) return send(res, 400, { error: 'Informe o título do livro.' });
  const jobs = { wikipedia: wikipedia(title, author), youtube: process.env.YOUTUBE_API_KEY ? youtube(title, author) : null, web: process.env.BRAVE_SEARCH_API_KEY ? web(title, author) : null };
  const providers = {}; const items = [];
  await Promise.all(Object.entries(jobs).map(async ([name, job]) => {
    if (!job) { providers[name] = 'not_configured'; return; }
    try { items.push(...(await job)); providers[name] = 'ok'; } catch { providers[name] = 'error'; }
  }));
  const searches = [
    { label: 'Goodreads', url: `https://www.goodreads.com/search?q=${encodeURIComponent(req.query.isbn || `${title} ${author}`.trim())}` },
    { label: 'YouTube', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`resenha ${title} ${author}`.trim())}` },
    { label: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(`resenha "${title}" ${author}`.trim())}` }
  ];
  const order = { video: 0, article: 1, platform: 2 };
  return send(res, 200, { items: items.sort((a, b) => order[a.type] - order[b.type]), providers, searches }, 'private, max-age=3600');
}