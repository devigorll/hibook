// Utilitários das Vercel Functions: autenticação (token do Supabase), respostas e fetch com timeout.
const UA = `Highbook/1.0 (${process.env.CONTACT_EMAIL || 'https://hibook.vercel.app'})`;

export function send(res, status, body, cache = 'no-store') {
  res.setHeader('Cache-Control', cache);
  return res.status(status).json(body);
}

// Confere o token enviado pelo app com o próprio Supabase Auth. Retorna o usuário ou null.
export async function requireUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('missing-supabase-env');
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
  return r.ok ? r.json() : null;
}

export async function fetchJson(url, { headers = {}, timeout = 8000 } = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export const allowedCoverHost = (h) => h === 'books.google.com' || h === 'covers.openlibrary.org' || h === 'archive.org' || h.endsWith('.archive.org');
export { UA };

// Garante a autenticação nas rotas privadas; devolve true se a resposta já foi enviada.
export async function guard(req, res) {
  if (req.method !== 'GET') { send(res, 405, { error: 'Método não permitido.' }); return true; }
  try {
    if (!(await requireUser(req))) { send(res, 401, { error: 'Faça login para usar este recurso.' }); return true; }
  } catch {
    send(res, 500, { error: 'Servidor sem SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY configurados.' });
    return true;
  }
  return false;
}