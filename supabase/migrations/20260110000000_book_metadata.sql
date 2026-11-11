-- Metadados bibliográficos dos livros (busca e importação). Aditiva: não altera nem apaga dados existentes.
-- As políticas RLS atuais da tabela books (por linha/usuário) continuam valendo para as novas colunas.
alter table public.books
  add column if not exists authors        text,
  add column if not exists publisher      text,
  add column if not exists published_year smallint,
  add column if not exists language       text,
  add column if not exists isbn_10        text,
  add column if not exists isbn_13        text,
  add column if not exists categories     text[],
  add column if not exists source         text,   -- 'google' | 'openlibrary' | null (manual)
  add column if not exists source_id      text;

alter table public.books
  add constraint books_isbn_10_format  check (isbn_10 is null or isbn_10 ~ '^[0-9]{9}[0-9X]$'),
  add constraint books_isbn_13_format  check (isbn_13 is null or isbn_13 ~ '^[0-9]{13}$'),
  add constraint books_year_range      check (published_year is null or published_year between 1000 and 2100);

-- Índices só para acelerar a verificação de duplicidade (NÃO são únicos: edições/cópias iguais continuam permitidas).
create index if not exists books_user_isbn13_idx on public.books (user_id, isbn_13) where isbn_13 is not null;
create index if not exists books_user_isbn10_idx on public.books (user_id, isbn_10) where isbn_10 is not null;
create index if not exists books_user_title_idx  on public.books (user_id, lower(title));