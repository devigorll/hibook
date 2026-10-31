import { supabase } from '../config/supabase.js';

// Tamanho mínimo para NOVAS senhas (cadastro e redefinição).
// Para o servidor aceitar o mesmo mínimo, ajuste em Authentication > Sign In / Providers
// (Minimum password length) no painel do Supabase.
export const MIN_PASSWORD_LENGTH = 8;

function createError(message, code) {
  const error = new Error(message);

  if (code) {
    error.code = code;
  }

  return error;
}

// Traduz os erros mais comuns do Supabase Auth para mensagens claras.
// Retorna um Error (com .code = 'session_missing' quando o link expirou).
function convertAuthError(error) {
  const msg = (error?.message || '').toLowerCase();
  const code = error?.code || '';

  if (msg.includes('auth session missing') || code === 'session_not_found') {
    return createError('O link expirou ou já foi usado. Solicite um novo link.', 'session_missing');
  }
  if (code === 'same_password' || msg.includes('different from the old password')) {
    return createError('A nova senha precisa ser diferente da senha atual.');
  }
  if (code === 'weak_password' || msg.includes('weak')) {
    return createError(`Senha fraca. Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres, misturando letras e números.`);
  }
  if (msg.includes('invalid login credentials')) {
    return createError('E-mail ou senha incorretos.');
  }
  if (msg.includes('email not confirmed')) {
    return createError('Confirme seu e-mail antes de entrar.');
  }
  if (msg.includes('already registered')) {
    // Mensagem genérica: não confirma se o e-mail já tem conta (evita descobrir quem é cadastrado).
    return createError('Não foi possível criar a conta com estes dados. Se você já tem conta, entre ou use "Esqueci minha senha".');
  }
  if (msg.includes('password should be at least')) {
    return createError('A senha não atende ao tamanho mínimo exigido.');
  }
  if (msg.includes('rate limit') || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return createError('Muitas tentativas. Aguarde um minuto e tente de novo.');
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return createError('Sem conexão com o servidor. Verifique sua internet.');
  }

  return createError(error?.message || 'Ocorreu um erro inesperado.');
}

export const authService = {
  // Cria a conta. Se a confirmação de e-mail estiver ativa, data.session vem nula.
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw convertAuthError(error);
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw convertAuthError(error);
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw convertAuthError(error);
  },

  // Pede o e-mail de recuperação. O link do e-mail leva de volta para esta mesma página.
  // (Essa URL precisa estar em Authentication > URL Configuration > Redirect URLs.)
  async requestPasswordReset(email) {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw convertAuthError(error);
  },

  // Define a nova senha. Só funciona com a sessão temporária aberta pelo link do e-mail.
  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw convertAuthError(error);
  },

  // Avisa sempre que o usuário entrar ou sair. Dispara também na carga da página.
  // callback(usuário, evento) — evento: 'INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT',
  // 'PASSWORD_RECOVERY' etc. Retorna uma função para cancelar a assinatura.
  onAuthChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((authEvent, session) => {
      callback(session?.user ?? null, authEvent);
    });
    return () => data.subscription.unsubscribe();
  }
};
