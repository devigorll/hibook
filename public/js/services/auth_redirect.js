// Lê o que o Supabase coloca na URL quando o usuário abre um link recebido por e-mail.
// Este arquivo NÃO depende do Supabase: o app.js o usa ANTES de o cliente carregar,
// porque o cliente apaga os parâmetros da URL assim que os processa.
//
// Exemplos de URL:
//   link de recuperação válido:  #access_token=...&type=recovery
//   link expirado ou usado:      #error=access_denied&error_code=otp_expired&error_description=...

export function readAuthRedirect(location = window.location) {
  const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location.search || '');
  const get = (chave) => hash.get(chave) ?? query.get(chave);

  const type = get('type');
  const error = get('error');
  const errorCode = get('error_code');

  return {
    type,
    isRecovery: type === 'recovery',
    hasError: Boolean(error || errorCode),
    errorCode: errorCode ?? null,
    errorDescription: get('error_description') ?? null
  };
}

// Limpa os parâmetros de ERRO da URL (para o aviso não voltar ao atualizar a página).
// Só deve ser chamado quando há erro: um link válido precisa continuar na URL
// até o cliente do Supabase lê-lo.
export function clearAuthErrorFromUrl(win = window) {
  const url = new URL(win.location.href);

  ['error', 'error_code', 'error_description'].forEach((chave) => url.searchParams.delete(chave));

  win.history.replaceState(win.history.state, '', `${url.pathname}${url.search}`);
}

// Decide o que o app deve fazer a cada evento de autenticação do Supabase.
// É uma função pura (sem tela, sem rede) para poder ser testada isoladamente.
//
// state: { recoveryExpected, recoveryMode, lastUserId }
//   recoveryExpected: a URL indicava um link de recuperação
//   recoveryMode:     o usuário está definindo a nova senha
//   lastUserId:       último usuário já tratado (null = ninguém logado, undefined = nada tratado ainda)
//
// Retorna { action, state } com action:
//   'start-recovery'  mostrar a tela de nova senha (sem entrar no app)
//   'handle'          tratar normalmente (entrar no app ou mostrar o login)
//   'ignore'          nada a fazer (evento repetido, renovação de token ou troca de senha em andamento)
export function decideAuthEvent(state, user, evento) {
  const userId = user?.id ?? null;
  let { recoveryExpected, recoveryMode, lastUserId } = state;

  // Link de recuperação: o Supabase abre uma sessão temporária.
  // (Pode chegar como SIGNED_IN logo antes de PASSWORD_RECOVERY, ou só como INITIAL_SESSION.)
  if (evento === 'PASSWORD_RECOVERY' || (recoveryExpected && user)) {
    return {
      action: recoveryMode ? 'ignore' : 'start-recovery',
      state: { recoveryExpected: false, recoveryMode: true, lastUserId: userId }
    };
  }

  // O link de recuperação não gerou uma sessão válida: segue para o login normal.
  if (recoveryExpected && !user && evento === 'INITIAL_SESSION') {
    recoveryExpected = false;
  }

  // Durante a troca de senha, ignora entradas e saídas (inclusive o logout automático do final).
  if (recoveryMode) {
    return { action: 'ignore', state: { recoveryExpected, recoveryMode, lastUserId } };
  }

  // Evento repetido (ex.: renovação de token) para o mesmo usuário.
  if (userId === lastUserId) {
    return { action: 'ignore', state: { recoveryExpected, recoveryMode, lastUserId } };
  }

  return { action: 'handle', state: { recoveryExpected, recoveryMode, lastUserId: userId } };
}