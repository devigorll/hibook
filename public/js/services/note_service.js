import { supabase } from '../config/supabase.js';
import { requireUser } from './session.js';
import { translateDbError } from './errors.js';

// Limites iguais aos do banco (tabela book_notes, veja supabase/004_reading_features.sql).
const MAX_TITLE = 120;
const MAX_CONTENT = 5000;

// Erros do banco para as anotações. O gatilho do banco recusa página maior que o total do livro.
function translateNoteError(error) {
  if (error?.code === '23514' && (error.message ?? '').toLowerCase().includes('excede')) {
    return 'A página da anotação excede o total de páginas do livro.';
  }

  return translateDbError(error, {
    rule: 'Algum dado não atende às regras (título, página ou comentário inválidos).',
    permission: 'Sem permissão para alterar anotações. Verifique as políticas (RLS) do banco.',
    missingTable: 'A tabela de anotações não foi encontrada. Execute o SQL 004 no Supabase.',
    notFound: 'Anotação não encontrada ou sem permissão para alterá-la.'
  });
}

// Valida e normaliza os dados de uma anotação para o livro informado.
// Lança um Error com a mensagem para o usuário se algo estiver inválido.
function validateNote(book, { title, page, content }) {
  const cleanTitle = (title ?? '').trim();

  if (!cleanTitle) {
    throw new Error('Informe o título da anotação.');
  }

  if (cleanTitle.length > MAX_TITLE) {
    throw new Error(`O título pode ter no máximo ${MAX_TITLE} caracteres.`);
  }

  const pageText = String(page ?? '').trim();
  const pageNumber = Number(pageText);

  if (pageText === '' || !Number.isInteger(pageNumber) || pageNumber <= 0) {
    throw new Error('Informe um número de página válido (maior que zero).');
  }

  // A página precisa existir neste livro (quando o total de páginas é conhecido).
  if (book.pages_count && pageNumber > book.pages_count) {
    throw new Error(`Este livro tem ${book.pages_count} páginas. Informe uma página de 1 a ${book.pages_count}.`);
  }

  const cleanContent = (content ?? '').trim();

  if (!cleanContent) {
    throw new Error('Escreva o comentário da anotação.');
  }

  if (cleanContent.length > MAX_CONTENT) {
    throw new Error(`O comentário pode ter no máximo ${MAX_CONTENT} caracteres.`);
  }

  return { cleanTitle, pageNumber, cleanContent };
}

export const noteService = {
  // Anotações de UM livro, em ordem crescente de página.
  async getNotes(bookId) {
    const { data, error } = await supabase
      .from('book_notes')
      .select('*')
      .eq('book_id', bookId)
      .order('page', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(translateNoteError(error));
    }

    return data ?? [];
  },

  // noteData: { title, page, content }
  async createNote(book, noteData) {
    const { cleanTitle, pageNumber, cleanContent } = validateNote(book, noteData);

    const user = await requireUser('Faça login para criar anotações.');

    const { data, error } = await supabase
      .from('book_notes')
      .insert({
        book_id: book.id,
        user_id: user.id,
        title: cleanTitle,
        page: pageNumber,
        content: cleanContent
      })
      .select()
      .single();

    if (error) {
      throw new Error(translateNoteError(error));
    }

    return data;
  },

  async updateNote(book, note, noteData) {
    const { cleanTitle, pageNumber, cleanContent } = validateNote(book, noteData);

    const { data, error } = await supabase
      .from('book_notes')
      .update({ title: cleanTitle, page: pageNumber, content: cleanContent })
      .eq('id', note.id)
      .select()
      .single();

    if (error) {
      throw new Error(translateNoteError(error));
    }

    return data;
  },

  async deleteNote(noteId) {
    const { data, error } = await supabase
      .from('book_notes')
      .delete()
      .eq('id', noteId)
      .select('id');

    if (error) {
      throw new Error(translateNoteError(error));
    }

    if (!data || data.length === 0) {
      throw new Error('Anotação não encontrada ou sem permissão para excluí-la.');
    }
  }
};
