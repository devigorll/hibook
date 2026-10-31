import { supabase } from '../config/supabase.js';
import { requireUser } from './session.js';
import { translateDbError } from './errors.js';

const BUCKET = 'book-covers';
const MAX_COVER_SIZE = 5 * 1024 * 1024; // 5 MB (igual ao limite do bucket)
const COVER_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

// ============================================================
// Funções auxiliares
// ============================================================
// Valida a imagem da capa. Retorna o texto do erro ou null se estiver tudo certo.
function validateCover(file) {
  if (!file) {
    return 'Selecione a imagem da capa.';
  }

  if (!COVER_TYPES[file.type]) {
    return 'Formato inválido. Use uma imagem JPG, PNG ou WebP.';
  }

  if (file.size > MAX_COVER_SIZE) {
    return 'A imagem é muito grande. O limite é de 5 MB.';
  }

  return null;
}

// Valida e normaliza título, descrição e páginas. Lança erro se algo estiver inválido.
function validateBookData({ title, description, pagesCount }) {
  const cleanTitle = (title ?? '').trim();

  if (!cleanTitle) {
    throw new Error('Informe o título do livro.');
  }

  if (cleanTitle.length > 200) {
    throw new Error('O título pode ter no máximo 200 caracteres.');
  }

  const cleanDescription = (description ?? '').trim() || null;

  if (cleanDescription && cleanDescription.length > 2000) {
    throw new Error('A descrição pode ter no máximo 2000 caracteres.');
  }

  let totalPages = null;

  if (pagesCount !== null && pagesCount !== undefined && pagesCount !== '') {
    const pageNumber = Number(pagesCount);

    if (!Number.isInteger(pageNumber) || pageNumber <= 0 || pageNumber > 100000) {
      throw new Error('A quantidade de páginas deve ser um número inteiro positivo.');
    }

    totalPages = pageNumber;
  }

  return { cleanTitle, cleanDescription, totalPages };
}

// Traduz erros do Storage para mensagens compreensíveis.
function translateStorageError(error) {
  const msg = (error?.message || '').toLowerCase();

  if (msg.includes('row-level security') || msg.includes('not authorized')) {
    return 'Sem permissão para enviar a imagem. Verifique as políticas do Storage.';
  }
  if (msg.includes('bucket not found')) {
    return 'O bucket "book-covers" não foi encontrado no Supabase.';
  }
  if (msg.includes('mime type') || msg.includes('not supported')) {
    return 'Tipo de arquivo não permitido. Use JPG, PNG ou WebP.';
  }
  if (msg.includes('maximum allowed size') || msg.includes('too large') || msg.includes('payload')) {
    return 'A imagem é muito grande. O limite é de 5 MB.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Sem conexão com o servidor. Verifique sua internet.';
  }

  return error?.message || 'Não foi possível enviar a imagem.';
}

// Erros do banco para as tabelas de livros.
function translateBookError(error) {
  return translateDbError(error, {
    rule: 'Algum dado não atende às regras do banco (título, nota ou páginas inválidos).',
    notFound: 'Livro não encontrado ou sem permissão para alterá-lo.'
  });
}

// Envia a capa para user_id/uuid.ext e devolve o caminho e a URL pública.
async function uploadCover(userId, file) {
  const path = `${userId}/${crypto.randomUUID()}.${COVER_TYPES[file.type]}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false
  });

  if (error) {
    throw new Error(translateStorageError(error));
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  return { path, url };
}

// Remove um arquivo do Storage sem interromper o fluxo se falhar.
async function removeCover(path) {
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);

    if (error) {
      console.error('Não foi possível remover a capa do Storage:', error);
    }
  } catch (error) {
    console.error('Não foi possível remover a capa do Storage:', error);
  }
}

// Remove a capa somente se nenhum livro ainda a utiliza.
// Na dúvida (erro na consulta), NÃO apaga o arquivo.
async function removeCoverIfUnused(path) {
  try {
    const { count, error } = await supabase
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('cover_path', path);

    if (error) {
      console.error('Não foi possível verificar o uso da capa:', error);
      return;
    }

    if (count === 0) {
      await removeCover(path);
    }
  } catch (error) {
    console.error('Não foi possível verificar o uso da capa:', error);
  }
}

// Ajusta os vínculos do livro para que fiquem exatamente iguais a listIds.
async function syncBookLists(bookId, listIds) {
  const { data: currentLinks, error: readError } = await supabase
    .from('book_lists')
    .select('list_id')
    .eq('book_id', bookId);

  if (readError) {
    throw readError;
  }

  const currentSet = new Set((currentLinks ?? []).map((row) => row.list_id));
  const newSet = new Set(listIds);

  const toRemove = [...currentSet].filter((id) => !newSet.has(id));
  const toAdd = [...newSet].filter((id) => !currentSet.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('book_lists')
      .delete()
      .eq('book_id', bookId)
      .in('list_id', toRemove);

    if (error) {
      throw error;
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('book_lists')
      .insert(toAdd.map((listId) => ({ book_id: bookId, list_id: listId })));

    if (error) {
      throw error;
    }
  }
}

// Atualiza campos de um livro e devolve a linha atualizada.
async function updateFields(bookId, fields) {
  const { data, error } = await supabase
    .from('books')
    .update(fields)
    .eq('id', bookId)
    .select()
    .single();

  if (error) {
    throw new Error(translateBookError(error));
  }

  return data;
}

// ============================================================
// Serviço
// ============================================================
export const bookService = {
  validateCover,

  // Busca os livros do usuário (mais recentes primeiro).
  // Com listId, traz só os livros daquela lista.
  // Cada livro vem com book_lists: [{ list_id }] (todas as listas dele).
  async getBooks({ listId = null } = {}) {
    let ids = null;

    if (listId) {
      const { data: links, error: linksError } = await supabase
        .from('book_lists')
        .select('book_id')
        .eq('list_id', listId);

      if (linksError) {
        throw linksError;
      }

      ids = (links ?? []).map((link) => link.book_id);

      if (ids.length === 0) {
        return [];
      }
    }

    let query = supabase
      .from('books')
      .select('*, book_lists(list_id)')
      .order('created_at', { ascending: false });

    if (ids) {
      query = query.in('id', ids);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data ?? [];
  },

  // Cadastra um livro em 3 passos: envia a capa, salva o livro e vincula à lista.
  // Se um passo falhar, desfaz os anteriores para não deixar sobras.
  async createBook({ title, description, pagesCount, coverFile, listId }) {
    const { cleanTitle, cleanDescription, totalPages } = validateBookData({ title, description, pagesCount });

    const coverError = validateCover(coverFile);

    if (coverError) {
      throw new Error(coverError);
    }

    const user = await requireUser('Faça login para cadastrar um livro.');

    const cover = await uploadCover(user.id, coverFile);

    const { data: book, error: bookError } = await supabase
      .from('books')
      .insert({
        user_id: user.id,
        title: cleanTitle,
        description: cleanDescription,
        pages_count: totalPages,
        cover_path: cover.path,
        cover_url: cover.url
      })
      .select()
      .single();

    if (bookError) {
      await removeCover(cover.path);
      throw new Error(translateBookError(bookError));
    }

    if (listId) {
      const { error: linkError } = await supabase
        .from('book_lists')
        .insert({ book_id: book.id, list_id: listId });

      if (linkError) {
        // Desfaz tudo: o livro não pode ficar sem a lista que o usuário escolheu.
        await supabase.from('books').delete().eq('id', book.id);
        await removeCover(cover.path);
        throw new Error(translateBookError(linkError));
      }
    }

    return book;
  },

  // Atualiza os dados do livro, troca a capa (se enviada) e ajusta as listas.
  async updateBook({ book, title, description, pagesCount, coverFile, listIds = [] }) {
    const { cleanTitle, cleanDescription, totalPages } = validateBookData({ title, description, pagesCount });

    if (coverFile) {
      const coverError = validateCover(coverFile);

      if (coverError) {
        throw new Error(coverError);
      }
    }

    const user = await requireUser('Faça login para editar o livro.');

    // 1) Envia a nova capa (se houver). A antiga só é apagada depois que tudo der certo.
    let newCover = null;

    if (coverFile) {
      newCover = await uploadCover(user.id, coverFile);
    }

    // 2) Atualiza o registro.
    const fields = {
      title: cleanTitle,
      description: cleanDescription,
      pages_count: totalPages
    };

    // O banco não aceita página atual maior que o total: se o total diminuiu, ajusta.
    if (totalPages !== null && Number(book.current_page ?? 0) > totalPages) {
      fields.current_page = totalPages;
    }

    if (newCover) {
      fields.cover_path = newCover.path;
      fields.cover_url = newCover.url;
    }

    const { data: updatedBook, error: updateError } = await supabase
      .from('books')
      .update(fields)
      .eq('id', book.id)
      .select()
      .single();

    if (updateError) {
      if (newCover) {
        await removeCover(newCover.path);
      }

      throw new Error(translateBookError(updateError));
    }

    // 3) O registro já aponta para a nova capa: a antiga pode sair do Storage.
    if (newCover && book.cover_path && book.cover_path !== newCover.path) {
      await removeCoverIfUnused(book.cover_path);
    }

    // 4) Ajusta as listas.
    try {
      await syncBookLists(book.id, listIds);
    } catch (error) {
      console.error('Erro ao atualizar as listas do livro:', error);
      throw new Error(
        `Os dados do livro foram salvos, mas não foi possível atualizar as listas: ${translateBookError(error)}`
      );
    }

    return updatedBook;
  },

  // Avaliação de 0 a 5 (null = remove a avaliação).
  async setRating(bookId, rating) {
    if (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 5)) {
      throw new Error('A nota deve ser um número inteiro de 0 a 5.');
    }

    return updateFields(bookId, { rating });
  },

  // Página em que o usuário parou (0 = ainda não começou).
  async setCurrentPage(book, page) {
    const rawText = String(page ?? '').trim();
    const pageNumber = Number(rawText);

    if (rawText === '' || !Number.isInteger(pageNumber) || pageNumber < 0) {
      throw new Error('Informe um número de página válido (0 ou maior).');
    }

    if (book.pages_count && pageNumber > book.pages_count) {
      throw new Error(`A página atual não pode ser maior que o total de páginas (${book.pages_count}).`);
    }

    return updateFields(book.id, { current_page: pageNumber });
  },

  // Exclui o livro e sua capa (se nenhum outro livro usar o mesmo arquivo).
  async deleteBook(book) {
    let result = await supabase.from('books').delete().eq('id', book.id).select('id');

    // 23503 = ainda existem vínculos em book_lists: remove os vínculos e tenta de novo.
    if (result.error?.code === '23503') {
      const { error: linksError } = await supabase.from('book_lists').delete().eq('book_id', book.id);

      if (linksError) {
        throw new Error(translateBookError(linksError));
      }

      result = await supabase.from('books').delete().eq('id', book.id).select('id');
    }

    if (result.error) {
      throw new Error(translateBookError(result.error));
    }

    if (!result.data || result.data.length === 0) {
      throw new Error('Livro não encontrado ou sem permissão para excluí-lo.');
    }

    if (book.cover_path) {
      await removeCoverIfUnused(book.cover_path);
    }
  }
};
