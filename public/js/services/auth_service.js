import { supabase } from '../config/supabase.js';

// Tamanho mínimo para NOVAS senhas (cadastro e redefinição).
// Para o servidor aceitar o mesmo mínimo, ajuste em Authentication > Sign In / Providers
// (Minimum password length) no painel do Supabase.
export const MIN_PASSWORD_LENGTH = 8;

function criarErro(mensagem, codigo) {
  const erro = new Error(mensagem);

  if (codigo) {
    erro.code = codigo;
  }

  return erro;
}

// Traduz os erros mais comuns do Supabase Auth para mensagens claras.
// Retorna um Error (com .code = 'session_missing' quando o link expirou).
function converterErro(error) {
  const msg = (error?.message || '').toLowerCase();
  const codigo = error?.code || '';

  if (msg.includes('auth session missing') || codigo === 'session_not_found') {
    return criarErro('O link expirou ou já foi usado. Solicite um novo link.', 'session_missing');
  }
  if (codigo === 'same_password' || msg.includes('different from the old password')) {
    return criarErro('A nova senha precisa ser diferente da senha atual.');
  }
  if (codigo === 'weak_password' || msg.includes('weak')) {
    return criarErro(`Senha fraca. Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres, misturando letras e números.`);
  }
  if (msg.includes('invalid login credentials')) {
    return criarErro('E-mail ou senha incorretos.');
  }
  if (msg.includes('email not confirmed')) {
    return criarErro('Confirme seu e-mail antes de entrar.');
  }
  if (msg.includes('already registered')) {
    return criarErro('Este e-mail já está cadastrado.');
  }
  if (msg.includes('password should be at least')) {
    return criarErro('A senha não atende ao tamanho mínimo exigido.');
  }
  if (msg.includes('rate limit') || codigo === 'over_email_send_rate_limit' || codigo === 'over_request_rate_limit') {
    return criarErro('Muitas tentativas. Aguarde um minuto e tente de novo.');
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return criarErro('Sem conexão com o servidor. Verifique sua internet.');
  }

  return criarErro(error?.message || 'Ocorreu um erro inesperado.');
}

export const authService = {
  // Cria a conta. Se a confirmação de e-mail estiver ativa, data.session vem nula.
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw converterErro(error);
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw converterErro(error);
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw converterErro(error);
  },

  // Pede o e-mail de recuperação. O link do e-mail leva de volta para esta mesma página.
  // (Essa URL precisa estar em Authentication > URL Configuration > Redirect URLs.)
  async requestPasswordReset(email) {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw converterErro(error);
  },

  // Define a nova senha. Só funciona com a sessão temporária aberta pelo link do e-mail.
  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw converterErro(error);
  },

  // Avisa sempre que o usuário entrar ou sair. Dispara também na carga da página.
  // callback(usuário, evento) — evento: 'INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT',
  // 'PASSWORD_RECOVERY' etc. Retorna uma função para cancelar a assinatura.
  onAuthChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((evento, session) => {
      callback(session?.user ?? null, evento);
    });
    return () => data.subscription.unsubscribe();
  }
};