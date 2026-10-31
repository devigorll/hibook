// Tradução dos erros do Supabase (banco e API) para mensagens ao usuário.
// Cada serviço pode trocar mensagens específicas pelo parâmetro "overrides".

const DEFAULT_MESSAGES = {
  permission: 'Sem permissão para esta operação. Verifique as políticas (RLS) do banco.',
  rule: 'Algum dado não atende às regras do banco.',
  duplicate: 'Este registro já existe.',
  notFound: 'Registro não encontrado ou sem permissão.',
  missingTable: 'Tabela não encontrada. Execute os scripts SQL da pasta supabase/.',
  network: 'Sem conexão com o servidor. Verifique sua internet.',
  fallback: 'Ocorreu um erro inesperado.'
};

export function translateDbError(error, overrides = {}) {
  const messages = { ...DEFAULT_MESSAGES, ...overrides };
  const code = error?.code ?? '';
  const text = (error?.message ?? '').toLowerCase();

  if (code === '42501') return messages.permission;
  if (code === '23505') return messages.duplicate;
  if (code === '23514') return messages.rule;
  if (code === 'PGRST116') return messages.notFound;
  if (code === '42P01' || code === 'PGRST205' || text.includes('schema cache')) return messages.missingTable;
  if (text.includes('failed to fetch') || text.includes('network')) return messages.network;

  return error?.message || messages.fallback;
}
