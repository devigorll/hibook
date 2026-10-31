import { supabase } from '../config/supabase.js';
import { requireUser } from './session.js';
import { translateDbError } from './errors.js';

function toError(error) {
  return new Error(
    translateDbError(error, {
      duplicate: 'Você já tem uma lista com esse nome.',
      notFound: 'Lista não encontrada ou sem permissão.'
    })
  );
}

function cleanName(name) {
  const clean = name.trim();

  if (!clean) {
    throw new Error('Informe o nome da lista.');
  }

  return clean;
}

export const listService = {
  async getLists() {
    const user = await requireUser('Faça login para visualizar suas listas.');

    const { data, error } = await supabase
      .from('lists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      throw toError(error);
    }

    return data ?? [];
  },

  async createList(name) {
    const listName = cleanName(name);
    const user = await requireUser('Faça login para criar uma lista.');

    const { data, error } = await supabase
      .from('lists')
      .insert({ name: listName, user_id: user.id })
      .select()
      .single();

    if (error) {
      throw toError(error);
    }

    return data;
  },

  async renameList(listId, newName) {
    const listName = cleanName(newName);
    await requireUser('Faça login para renomear a lista.');

    const { data, error } = await supabase
      .from('lists')
      .update({ name: listName })
      .eq('id', listId)
      .select()
      .single();

    if (error) {
      throw toError(error);
    }

    return data;
  },

  // Exclui só a lista: os livros continuam existindo (o vínculo some por CASCADE).
  async deleteList(listId) {
    await requireUser('Faça login para excluir a lista.');

    const { data, error } = await supabase.from('lists').delete().eq('id', listId).select('id');

    if (error) {
      throw toError(error);
    }

    if (!data || data.length === 0) {
      throw new Error('Lista não encontrada ou sem permissão para excluí-la.');
    }
  }
};
