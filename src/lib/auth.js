// ─── Auth Abstraction ────────────────────────────────────────
// Real Supabase Auth with guest fallback

import { supabase } from './supabase';
import { GUEST_USER } from './nodes';
import { DEFAULT_SETTINGS } from './tokens';
import db from './db';

// Convert Supabase user to app user shape
function toAppUser(supabaseUser, profile = null) {
  return {
    id: supabaseUser.id,
    name: profile?.name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
    email: supabaseUser.email || '',
    avatar: profile?.avatar_url || supabaseUser.user_metadata?.avatar_url || null,
    plan: profile?.plan || 'free',
    provider: supabaseUser.app_metadata?.provider || 'email',
    createdAt: supabaseUser.created_at,
  };
}

// Load profile from profiles table
async function loadProfile(userId) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('loadProfile failed:', e);
    return null;
  }
}

// Load settings from user_settings table
export async function loadUserSettings(userId) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data?.settings || null;
  } catch (e) {
    console.warn('loadUserSettings failed:', e);
    return null;
  }
}

// Save settings to user_settings table
export async function saveUserSettings(userId, settings) {
  if (!supabase || !userId) return;
  try {
    await supabase.from('user_settings').upsert({
      user_id: userId,
      settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (e) {
    console.warn('saveUserSettings failed:', e);
  }
}

// Load custom themes from custom_themes table
export async function loadCustomThemes(userId) {
  if (!supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('custom_themes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(row => ({
      id: row.id,
      label: row.name,
      emoji: row.emoji,
      ...row.theme_data,
    }));
  } catch (e) {
    console.warn('loadCustomThemes failed:', e);
    return [];
  }
}

// Save a custom theme
export async function saveCustomTheme(userId, theme) {
  if (!supabase || !userId) return null;
  try {
    const { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, bgColor, textColor, accentColor } = theme;
    const { data, error } = await supabase.from('custom_themes').insert({
      user_id: userId,
      name: theme.label,
      emoji: theme.emoji,
      theme_data: { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, bgColor, textColor, accentColor },
    }).select().single();
    if (error) throw error;
    return { id: data.id, label: data.name, emoji: data.emoji, ...data.theme_data };
  } catch (e) {
    console.warn('saveCustomTheme failed:', e);
    return null;
  }
}

// Delete a custom theme
export async function deleteCustomTheme(userId, themeId) {
  if (!supabase || !userId) return;
  try {
    await supabase.from('custom_themes').delete().eq('id', themeId).eq('user_id', userId);
  } catch (e) {
    console.warn('deleteCustomTheme failed:', e);
  }
}

// Auth operations
const auth = {
  async signIn({ email, password }) {
    if (!supabase) return { user: null, error: 'Supabase not configured' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: error.message };
    const profile = await loadProfile(data.user.id);
    return { user: toAppUser(data.user, profile), error: null };
  },

  async signUp({ email, password, name }) {
    if (!supabase) return { user: null, error: 'Supabase not configured' };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name || email.split('@')[0] } },
    });
    if (error) return { user: null, error: error.message };
    // Profile is auto-created by the database trigger
    return { user: toAppUser(data.user), error: null };
  },

  async signInWithProvider(provider) {
    if (!supabase) return { user: null, error: 'Supabase not configured' };
    const { error } = await supabase.auth.signInWithOAuth({ provider });
    if (error) return { user: null, error: error.message };
    // OAuth redirects — onAuthStateChange handles the return
    return { user: null, error: null };
  },

  async signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  async updateProfile(userId, updates) {
    if (!supabase || !userId) return;
    try {
      await supabase.from('profiles').update({
        ...updates,
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
    } catch (e) {
      console.warn('updateProfile failed:', e);
    }
  },

  // Get current session on app load
  async getSession() {
    if (!supabase) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;
      const profile = await loadProfile(session.user.id);
      return toAppUser(session.user, profile);
    } catch {
      return null;
    }
  },

  // Subscribe to auth state changes (returns unsubscribe function)
  onAuthStateChange(callback) {
    if (!supabase) return () => {};
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await loadProfile(session.user.id);
        callback(toAppUser(session.user, profile), event);
      } else if (event === 'SIGNED_OUT') {
        callback(GUEST_USER, event);
      }
    });
    return () => subscription.unsubscribe();
  },
};

export default auth;
