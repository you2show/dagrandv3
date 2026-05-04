
// Setup:
// 1. Create function 'admin-actions' in Supabase Dashboard.
// 2. Add Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// 3. Optional: ADMIN_FALLBACK_EMAILS (comma-separated verified emails for temporary admin fallback).
// 4. Optional: ENABLE_ADMIN_EMAIL_FALLBACK=true to enable fallback mode explicitly.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Declare Deno to avoid TypeScript errors in the web editor
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const parseCsvSet = (value: string | undefined) =>
  new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );

type AuthorizedUser = {
  app_metadata?: { role?: string };
  user_metadata?: { role?: string };
  email?: string | null;
  email_confirmed_at?: string | null;
};

const FALLBACK_ADMIN_EMAILS = parseCsvSet(Deno.env.get('ADMIN_FALLBACK_EMAILS'));
const ENABLE_ADMIN_EMAIL_FALLBACK = Deno.env.get('ENABLE_ADMIN_EMAIL_FALLBACK') === 'true';

// Permanent admin emails — always authorised regardless of role metadata or env vars.
// Kept in sync with ADMIN_EMAILS in src/contexts/AuthContext.tsx.
const PERMANENT_ADMIN_EMAILS = new Set([
  'mathyousos5@gmail.com',
  'soky@dagrand.net',
]);

const getUserRole = (user: AuthorizedUser) => user.app_metadata?.role || user.user_metadata?.role;

const isFallbackAdmin = (user: AuthorizedUser) => {
  if (!ENABLE_ADMIN_EMAIL_FALLBACK || FALLBACK_ADMIN_EMAILS.size === 0) return false;
  const role = getUserRole(user);
  const hasExplicitRole = typeof role === 'string' && role.length > 0;
  const email = (user.email ?? '').trim().toLowerCase();
  const isVerifiedEmail = Boolean(user.email_confirmed_at);
  return !hasExplicitRole && isVerifiedEmail && FALLBACK_ADMIN_EMAILS.has(email);
};

const isPermanentAdmin = (user: AuthorizedUser) => {
  const email = (user.email ?? '').trim().toLowerCase();
  return Boolean(user.email_confirmed_at) && PERMANENT_ADMIN_EMAILS.has(email);
};

serve(async (req) => {
  // 1. Handle CORS (អនុញ្ញាតអោយវេបសាយហៅមកកាន់ Function នេះបាន)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Server Config Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // 2. បង្កើត Admin Client ដោយប្រើ Service Role Key (ដែលមានសិទ្ធិពេញលេញ)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 3. ពិនិត្យ Authorization Header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization Header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // 4. បង្កើត User Client ដើម្បីឆែកមើលថាអ្នកណាជាអ្នកហៅ (Security Check)
    const supabaseUser = createClient(supabaseUrl, anonKey, { 
        global: { headers: { Authorization: authHeader } } 
    })

    // 5. ផ្ទៀងផ្ទាត់សិទ្ធិ (Check Role)
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()

    if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized', details: userError?.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
        })
    }

    // ពិនិត្យមើលថា តើ User នោះមាន Role ជា 'admin' ដែរឬទេ?
    // Check both app_metadata (system role) and user_metadata (custom role)
    const role = getUserRole(user);
    const isFallbackAdminEmail = isFallbackAdmin(user);
    const isPermanentAdminEmail = isPermanentAdmin(user);
    
    if (role !== 'admin' && role !== 'service_role' && !isFallbackAdminEmail && !isPermanentAdminEmail) {
        return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
        })
    }
    if (isFallbackAdminEmail || isPermanentAdminEmail) {
        console.warn(`Admin fallback access granted for user ${user.id} (${user.email ?? 'unknown-email'})`)
    }

    // 6. អាន JSON Body (ដោយប្រុងប្រយ័ត្ន)
    let body;
    try {
        body = await req.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid Request Body (JSON)" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }

    const { action, payload } = body;
    let result;

    // 7. ដំណើរការតាម Action
    switch (action) {
        case 'listUsers':
            const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers()
            if (listError) throw listError
            result = { users: users.users }
            break

        case 'inviteUser': {
            const { email: invEmail, fullName: invFullName, role: invRole, redirectTo: invRedirectTo } = payload
            const { data: invData, error: invError } = await supabaseAdmin.auth.admin.inviteUserByEmail(invEmail, {
                data: { full_name: invFullName, role: invRole },
                redirectTo: invRedirectTo || ''
            })
            if (invError) throw invError
            result = { user: invData.user }
            break
        }

        case 'createUser':
            const { email, password, fullName, role } = payload
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { full_name: fullName, role }
            })
            if (createError) throw createError
            result = { user: newUser }
            break

        case 'deleteUser':
            const { userId } = payload
            if (userId === user.id) throw new Error("Cannot delete yourself");
            const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
            if (deleteError) throw deleteError
            result = { success: true }
            break

        case 'updateUser':
            const { userId: updateId, attributes } = payload
            const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(updateId, attributes)
            if (updateError) throw updateError
            result = { user: updatedUser }
            break

        default:
            throw new Error(`Unknown action: ${action}`)
    }

    // 8. ត្រឡប់លទ្ធផលទៅវិញ (Success)
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    // 9. ត្រឡប់ Error ទៅវិញ (Failure)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
