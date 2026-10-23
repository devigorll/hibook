// Cliente Supabase (carregado via CDN em formato ES Module)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Project Settings > API. A publishable key é pública por design:
// quem protege os dados são as políticas RLS no Supabase, não o segredo da chave.
const SUPABASE_URL = 'https://rgjaybymwfxhqxwkdxxk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__gy6sQM1AxgeDtcw5LgnOA_5vgmg-DU';

// Avisa somente se as credenciais estiverem vazias ou com o texto de exemplo.
const credenciaisValidas =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('SEU_PROJETO') &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes('SUA_CHAVE');

if (!credenciaisValidas) {
  console.error('Configure SUPABASE_URL e SUPABASE_ANON_KEY em public/js/config/supabase.js');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
