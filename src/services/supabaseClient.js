import { createClient } from '@supabase/supabase-js';

// Client Supabase unique et robuste de l'application
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ubdevaemtwbzxksjlhjg.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_1qhA0xAnNSd3VxpoLdxYrQ_yUemEhaP';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;
