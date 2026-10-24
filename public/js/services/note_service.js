import { supabase } from '../config/supabase.js';

// Limites iguais aos do banco (tabela book_notes, veja supabase/004_reading_features.sql).
const MAX_TITLE = 120;
const MAX_CONTENT = 5000;

// Traduz erros do banco e da API para mensagens claras.
function traduzirErro(error) {
  const msg = (error?.message || '').toLowerCase();
  const codigo = error?.code || '';

  // Gatilho do banco: página maior que o total de páginas do livro.
  if (codigo === '23514' && msg.includes('excede')) {
    return 'A página da anotação excede o total de páginas do livro.';
  }
  if (codigo === '23514') {
    return 'Algum dado não atende às regras (título, página ou comentário inválidos).';
  }
  if (codigo === '42501') {
    return 'Sem permissão para alterar anotações. Verifique as políticas (RLS) do banco.';
  }
  // Tabela inexistente: o SQL 004 ainda não foi executado.
  if (codigo === '42P01' || codigo === 'PGRST205' || msg.includes('schema cache')) {
    return 'A tabela de anotações não foi encontrada. Execute o SQL 004 no Supabase.';
  }
  if (codigo === 'PGRST116') {
    return 'Anotação não encontrada ou sem permissão para alterá-la.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Sem conexão com o servidor. Verifique sua internet.';
  }

  return error?.message || 'Não foi possível concluir a operação.';
}

// Valida e normaliza os dados de uma anotação para o livro informado.
// Lança um Error com a mensagem para o usuário se algo estiver inválido.
function validarNota(book, { title, page, content }) {
  const titulo = (title ?? '').trim();

  if (!titulo) {
    throw new Error('Informe o título da anotação.');
  }

  if (titulo.length > MAX_TITLE) {
    throw new Error(`O título pode ter no máximo ${MAX_TITLE} caracteres.`);
  }

  const textoPagina = String(page ?? '').trim();
  const pagina = Number(textoPagina);

  if (textoPagina === '' || !Number.isInteger(pagina) || pagina <= 0) {
    throw new Error('Informe um número de página válido (maior que zero).');
  }

  // A página precisa existir neste livro (quando o total de páginas é conhecido).
  if (book.pages_count && pagina > book.pages_count) {
    throw new Error(`Este livro tem ${book.pages_count} páginas. Informe uma página de 1 a ${book.pages_count}.`);
  }

  const comentario = (content ?? '').trim();

  if (!comentario) {
    throw new Error('Escreva o comentário da anotação.');
  }

  if (comentario.length > MAX_CONTENT) {
    throw new Error(`O comentário pode ter no máximo ${MAX_CONTENT} caracteres.`);
  }

  return { titulo, pagina, comentario };
}

export const noteService = {
  validate: validarNota,

  // Anotações de UM livro, em ordem crescente de página.
  async getNotes(bookId) {
    const { data, error } = await supabase
      .from('book_notes')
      .select('*')
      .eq('book_id', bookId)
      .order('page', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(traduzirErro(error));
    }

    return data ?? [];
  },

  // dados: { title, page, content }
  async createNote(book, dados) {
    const { titulo, pagina, comentario } = validarNota(book, dados);

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError) {
      throw new Error(traduzirErro(authError));
    }

    if (!user) {
      throw new Error('Faça login para criar anotações.');
    }

    const { data, error } = await supabase
      .from('book_notes')
      .insert({
        book_id: book.id,
        user_id: user.id,
        title: titulo,
        page: pagina,
        content: comentario
      })
      .select()
      .single();

    if (error) {
      throw new Error(traduzirErro(error));
    }

    return data;
  },

  async updateNote(book, note, dados) {
    const { titulo, pagina, comentario } = validarNota(book, dados);

    const { data, error } = await supabase
      .from('book_notes')
      .update({ title: titulo, page: pagina, content: comentario })
      .eq('id', note.id)
      .select()
      .single();

    if (error) {
      throw new Error(traduzirErro(error));
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
      throw new Error(traduzirErro(error));
    }

    if (!data || data.length === 0) {
      throw new Error('Anotação não encontrada ou sem permissão para excluí-la.');
    }
  }
};