import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && anonKey && !url.includes('TU-PROYECTO'));
export const supabase = configured ? createClient(url, anonKey, {
  // Clave propia: las webs comparten el mismo origen en GitHub Pages y sin esto compartirían la sesión (admin, conductor).
  auth: { storageKey: 'pasajerosar-pasajero-auth' }
}) : null;
