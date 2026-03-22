// ─── Storage Abstraction ─────────────────────────────────────
// TODO: Session 2 — Swap to Supabase client
// import { supabase } from './auth';
//
// Production swap:
//   save → supabase.from('documents').upsert({ user_id, key, data, updated_at })
//   load → supabase.from('documents').select('data').eq('user_id', uid).eq('key', key).single()
//   remove → supabase.from('documents').delete().eq('user_id', uid).eq('key', key)

const db = {
  async save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn("db.save failed:", e);
    }
  },
  async load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("db.load failed:", e);
      return null;
    }
  },
  async remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("db.remove failed:", e);
    }
  },
};

export default db;
