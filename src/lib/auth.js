// ─── Auth Abstraction ────────────────────────────────────────
// TODO: Session 2 — Swap to Supabase Auth
// import { createClient } from '@supabase/supabase-js';
// export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
//
// signIn → supabase.auth.signInWithPassword({ email, password })
// signUp → supabase.auth.signUp({ email, password, options: { data: { name } } })
// signInWithProvider → supabase.auth.signInWithOAuth({ provider: 'google' })
// signOut → supabase.auth.signOut()
// updateProfile → supabase.auth.updateUser({ data: updates })

// For Session 1, mock auth lives inside SecondBrain.jsx (it needs component state)
// It will be extracted into a useAuth hook in Session 2

export default null;
