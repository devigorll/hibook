import { supabase } from '../config/supabase.js';

// Traduz as mensagens de erro mais comuns do Supabase Auth.
function traduzirErro(error) {
  const msg = (error?.message || '').toLowerCase();

  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (msg.includes('already registered')) return 'Este e-mail já está cadastrado.';
  if (msg.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  if (msg.includes('failed to fetch')) return 'Sem conexão com o servidor. Verifique sua internet.';

  return error?.message || 'Ocorreu um erro inesperado.';
}

export const authService = {
  // Cria a conta. Se a confirmação de e-mail estiver ativa, data.session vem nula.
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(traduzirErro(error));
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(traduzirErro(error));
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(traduzirErro(error));
  },

  // Avisa sempre que o usuário entrar ou sair. Dispara também na carga da página.
  // Retorna uma função para cancelar a assinatura.
  onAuthChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((_evento, session) => {
      callback(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }
};
