// GET /api/cover?url=...  ->  baixa a capa (somente de hosts permitidos), valida e devolve a imagem.
// Serve às miniaturas (o CSP do site só aceita imagens do próprio domínio) e à cópia para o Supabase Storage.
import { send, allowedCoverHost, UA } from './_lib/http.js';

const MAX = 5 * 1024 * 1024; // mesmo limite do bucket book-covers
const kind = (b) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG' ? 'image/png' : b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null);

export default async function handler(req, res) {
  let u;
  try { u = new URL(String(req.query.url || '')); } catch { return send(res, 400, { error: 'URL inválida.' }); }
  for (let hop = 0; hop < 4; hop += 1) {
    if (u.protocol !== 'https:' || !allowedCoverHost(u.hostname)) return send(res, 400, { error: 'Origem da imagem não permitida.' });
    let r;
    try { r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } }); } catch { return send(res, 502, { error: 'Não foi possível baixar a imagem.' }); }
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      try { u = new URL(r.headers.get('location') || '', u); } catch { break; }
      continue;
    }
    if (!r.ok) return send(res, 404, { error: 'Imagem indisponível.' });
    if (Number(r.headers.get('content-length') || 0) > MAX) return send(res, 413, { error: 'Imagem maior que 5 MB.' });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) return send(res, 413, { error: 'Imagem maior que 5 MB.' });
    const type = buf.length < 1500 ? null : kind(buf);
    if (!type) return send(res, 422, { error: 'A imagem é inválida ou não é JPG, PNG ou WebP.' });
    res.setHeader('Content-Type', type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return res.status(200).send(buf);
  }
  return send(res, 502, { error: 'Imagem indisponível.' });
}