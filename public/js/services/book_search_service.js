// Cliente das rotas /api (Vercel Functions): busca de edições, capas e resenhas.
import { supabase } from '../config/supabase.js';

const TTL = 5 * 60 * 1000;
const cache = new Map();
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function api(path, params, signal) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Faça login para usar este recurso.');
  let res;
  try {
    res = await fetch(`${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('Sem conexão com o servidor. Verifique sua internet.');
  }
  if (!(res.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('Serviço de busca indisponível. Em ambiente local, execute com "vercel dev" para habilitar a pasta api/.');
  }
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || 'Não foi possível concluir a busca.');
  return body;
}

export const bookSearchService = {
  // Miniaturas passam pelo próprio domínio (o CSP do site só aceita imagens de 'self' e do Supabase).
  coverThumbUrl: (url) => `/api/cover?url=${encodeURIComponent(url)}`,

  async search(query, { page = 0, signal } = {}) {
    const key = `${query.toLowerCase()}|${page}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.data;
    const data = await api('/api/books-search', { q: query, page }, signal);
    cache.set(key, { at: Date.now(), data });
    return data;
  },

  reviews: ({ title, author = '', isbn = '' }, signal) => api('/api/reviews', { title, author, isbn }, signal),

  // Baixa a capa pelo servidor (valida host, tipo e tamanho) e devolve um File pronto para o Storage.
  async importCover(url) {
    const res = await fetch(this.coverThumbUrl(url));
    if (!res.ok) throw new Error('Capa indisponível.');
    const blob = await res.blob();
    if (!EXT[blob.type]) throw new Error('Formato de capa inválido.');
    return new File([blob], `capa.${EXT[blob.type]}`, { type: blob.type });
  }
};