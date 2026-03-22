// ─── Storage Abstraction ─────────────────────────────────────
// Uses Supabase for authenticated users, localStorage for guests.
// Same async interface: save(key, data), load(key), remove(key)

import { supabase } from './supabase';

// Get the current user ID (null if guest)
async function getUserId() {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

const db = {
  async save(key, data) {
    const userId = await getUserId();
    if (userId && supabase) {
      try {
        const { error } = await supabase.from('documents').upsert({
          user_id: userId,
          key,
          data,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,key' });
        if (error) throw error;
      } catch (e) {
        console.warn('db.save (supabase) failed, falling back to localStorage:', e);
        try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
      }
    } else {
      try { localStorage.setItem(key, JSON.stringify(data)); }
      catch (e) { console.warn('db.save failed:', e); }
    }
  },

  async load(key) {
    const userId = await getUserId();
    if (userId && supabase) {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('data')
          .eq('user_id', userId)
          .eq('key', key)
          .single();
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
        return data?.data || null;
      } catch (e) {
        console.warn('db.load (supabase) failed, falling back to localStorage:', e);
        try {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      }
    } else {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { console.warn('db.load failed:', e); return null; }
    }
  },

  async remove(key) {
    const userId = await getUserId();
    if (userId && supabase) {
      try {
        const { error } = await supabase
          .from('documents')
          .delete()
          .eq('user_id', userId)
          .eq('key', key);
        if (error) throw error;
      } catch (e) {
        console.warn('db.remove (supabase) failed:', e);
      }
    }
    // Always clear localStorage too
    try { localStorage.removeItem(key); }
    catch (e) { console.warn('db.remove failed:', e); }
  },

  // Migrate localStorage data to Supabase on first sign-in
  async migrateLocalToSupabase(key) {
    const userId = await getUserId();
    if (!userId || !supabase) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      // Check if Supabase already has data for this key
      const { data: existing } = await supabase
        .from('documents')
        .select('id')
        .eq('user_id', userId)
        .eq('key', key)
        .single();
      if (!existing) {
        // No Supabase data yet — migrate localStorage
        await supabase.from('documents').upsert({
          user_id: userId,
          key,
          data,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,key' });
        console.log(`Migrated ${key} from localStorage to Supabase`);
      }
    } catch (e) {
      console.warn('Migration failed:', e);
    }
  },
};

export default db;
