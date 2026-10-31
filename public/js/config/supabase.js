// Cliente Supabase (único ponto de criação).
//
// URL e chave pública vêm de ./env.js, gerado por "npm run build" a partir do .env (local)
// ou das variáveis de ambiente da Vercel (veja scripts/generate-env.mjs).
// Depois de validar o app, fixe a versão do SDK (ex.: supabase-js@2.x.y/+esm).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let config = null;

try {
  config = await import('./env.js');
} catch {
  // arquivo ausente: tratado logo abaixo, com uma mensagem que diz o que fazer
}

if (!config?.SUPABASE_URL || !config?.SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Configuração do Supabase ausente. Rode "npm run build" para gerar js/config/env.js a partir do .env.');
}

export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
