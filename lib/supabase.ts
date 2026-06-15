import { createClient } from '@supabase/supabase-js';

// Server-side admin client. The service_role key is set as a Vercel env var and is NEVER
// exposed to the browser (only used inside API route handlers).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function rpc(name: string, args?: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(name, args ?? {});
  if (error) throw new Error(error.message);
  return data;
}
