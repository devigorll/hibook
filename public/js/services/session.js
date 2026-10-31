import { supabase } from '../config/supabase.js';
import { translateDbError } from './errors.js';

// Retorna o usuário logado ou lança um erro com a mensagem informada.
export async function requireUser(messageWhenLoggedOut) {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(translateDbError(error));
  }

  if (!user) {
    throw new Error(messageWhenLoggedOut);
  }

  return user;
}
