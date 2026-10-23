import { supabase } from '../config/supabase.js';

// Busca o usuário logado ou lança um erro com a mensagem informada.
async function getUserOrThrow(mensagemSemLogin) {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error(mensagemSemLogin);
  }

  return user;
}

export const listService = {
  async getLists() {
    const user = await getUserOrThrow('Faça login para visualizar suas listas.');

    const { data, error } = await supabase
      .from('lists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  },

  async createList(name) {
    const listName = name.trim();

    if (!listName) {
      throw new Error('Informe o nome da lista.');
    }

    const user = await getUserOrThrow('Faça login para criar uma lista.');

    const { data, error } = await supabase
      .from('lists')
      .insert({
        name: listName,
        user_id: user.id
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  },

  async renameList(listId, newName) {
    const listName = newName.trim();

    if (!listName) {
      throw new Error('Informe o nome da lista.');
    }

    await getUserOrThrow('Faça login para renomear a lista.');

    const { data, error } = await supabase
      .from('lists')
      .update({ name: listName })
      .eq('id', listId)
      .select()
      .single();

    if (error) {
      // PGRST116 = nenhuma linha atualizada (lista inexistente ou sem permissão).
      if (error.code === 'PGRST116') {
        throw new Error('Lista não encontrada ou sem permissão para alterá-la.');
      }

      throw error;
    }

    return data;
  },

  // Exclui só a lista. Os livros continuam existindo (o vínculo é removido por CASCADE).
  async deleteList(listId) {
    await getUserOrThrow('Faça login para excluir a lista.');

    const { data, error } = await supabase
      .from('lists')
      .delete()
      .eq('id', listId)
      .select('id');

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('Lista não encontrada ou sem permissão para excluí-la.');
    }
  }
};