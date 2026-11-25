-- As funções de gatilho não dependem do search_path de quem chama (aviso de segurança do Supabase).
ALTER FUNCTION arko_forbid_mutation() SET search_path = '';
ALTER FUNCTION arko_touch_updated_at() SET search_path = '';
