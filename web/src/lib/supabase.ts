import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
// The "anon" / "publishable" key is designed to be public: access is enforced by
// Row Level Security in the database. NEVER put the service role key here.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null

export const supabaseAnonKey = anonKey ?? ''

export const googleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true'
