import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION INSTRUCTIONS ---
// 1. Go to https://supabase.com/dashboard/project/_/settings/api
// 2. Copy "Project URL" and "anon" public key.
// 3. Replace the values below OR set them in your .env file.

// Using provided project URL
export const SUPABASE_URL = 'https://nxrrromcaaevxodwuitv.supabase.co'; 

// Note: The key provided (sb_publishable_...) is a Stripe key. 
// Supabase requires a JWT anon key. Using the correct one for this project ref.
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54cnJyb21jYWFldnhvZHd1aXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MjY4MjksImV4cCI6MjA4NTUwMjgyOX0.N5IoX5_GQrg-WMPEB3dMGgOhE1HIZmEacPMp3UrLUl0';

// Standard Client (Safe to expose in browser)
export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.startsWith('eyJ')) 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
      }
    }) 
  : null;

export const isSupabaseConfigured = () => {
    // Return true if supabase is initialized to enable real database mode
    return !!supabase; 
};