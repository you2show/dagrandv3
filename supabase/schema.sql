
-- COMBINED SETUP SCRIPT
-- Copy and paste this into the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. CONFIGURE ACCESS POLICIES (Row Level Security)

-- Step 1: Enable RLS
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Step 2: Clean up existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public Insert" ON articles;
DROP POLICY IF EXISTS "Public Update" ON articles;
DROP POLICY IF EXISTS "Public Delete" ON articles;
DROP POLICY IF EXISTS "Authenticated Insert" ON articles;
DROP POLICY IF EXISTS "Owner or Admin Update" ON articles;
DROP POLICY IF EXISTS "Owner or Admin Delete" ON articles;
DROP POLICY IF EXISTS "Public Read" ON articles;

-- Step 3: Create new strict policies

-- 1. Allow everyone to view articles (Public Read)
CREATE POLICY "Public Read" ON articles FOR SELECT USING (true);

-- 2. Allow only authenticated users (logged in) to write new articles
CREATE POLICY "Authenticated Insert" ON articles FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- 3. Allow users to update ONLY their own articles, OR Admins to update any
CREATE POLICY "Owner or Admin Update" ON articles FOR UPDATE 
USING (
  auth.uid()::text = "authorId" OR 
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- 4. Allow users to delete ONLY their own articles, OR Admins to delete any
CREATE POLICY "Owner or Admin Delete" ON articles FOR DELETE 
USING (
  auth.uid()::text = "authorId" OR 
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- =========================================================
-- 2. STORAGE SETUP (FOR AVATARS & BLOG IMAGES)
-- =========================================================

-- Create a bucket for 'avatars' if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create a bucket for 'blog-images' if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

-- STORAGE POLICIES (Allow public read, authenticated upload)

-- Clean up existing storage policies to avoid conflicts
DROP POLICY IF EXISTS "Avatar Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Avatar Auth Upload" ON storage.objects;
DROP POLICY IF EXISTS "Avatar Owner Update" ON storage.objects;

-- 1. Avatars Policies
CREATE POLICY "Avatar Public Read" ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

CREATE POLICY "Avatar Auth Upload" ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'avatars' AND auth.role() = 'authenticated' );

CREATE POLICY "Avatar Owner Update" ON storage.objects FOR UPDATE
USING ( bucket_id = 'avatars' AND auth.uid() = owner );

-- =========================================================
-- 3. GRANT ADMIN ROLE TO SPECIFIC USERS
-- =========================================================
-- Run this once after the target user has signed up.
-- It stamps role='admin' into their Supabase user_metadata so the RLS
-- policies above and the client-side AuthContext both treat them as admin.
--
-- ⚠️  The user must already exist in auth.users (i.e. they must have
--    signed up / been invited first).

-- soky@dagrand.net  (UID: bb3017a1-1284-44c4-b5ae-5f92645c08f5)
UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
  WHERE id = 'bb3017a1-1284-44c4-b5ae-5f92645c08f5';

-- mathyousos5@gmail.com  (looked up by email — run after sign-in at least once)
UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
  WHERE email = 'mathyousos5@gmail.com';

-- Generic pattern: grant admin role to any additional admin by email
-- UPDATE auth.users
--   SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
--   WHERE email = '<new-admin-email>';

-- =========================================================
-- 4. ADMIN EMAIL UPDATE FUNCTION (RPC FALLBACK)
-- =========================================================
-- Allows admins to update any user's email directly, bypassing the
-- email-confirmation flow.  Used as a fallback when the admin-actions
-- Edge Function is unavailable or returns a non-admin-role error.
--
-- Recognised as admin: user_metadata.role = 'admin'  OR
--                      app_metadata.role  = 'admin'  OR
--                      one of the two permanent admin emails below.

CREATE OR REPLACE FUNCTION public.admin_update_user_email(
    target_user_id uuid,
    new_email       text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    caller_role   text;
    caller_email  text;
    admin_emails  text[] := ARRAY['mathyousos5@gmail.com', 'soky@dagrand.net'];
    rows_updated  int;
BEGIN
    -- Identify calling user
    caller_role := coalesce(
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata'  ->> 'role'
    );
    SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();

    -- Enforce admin-only access
    IF caller_role IS DISTINCT FROM 'admin'
       AND NOT (lower(caller_email) = ANY(admin_emails))
    THEN
        RETURN json_build_object('error', 'Forbidden: Admin access required');
    END IF;

    -- Apply email change without requiring confirmation
    UPDATE auth.users
    SET
        email                  = new_email,
        email_confirmed_at     = now(),
        email_change           = '',
        email_change_token_new = '',
        email_change_sent_at   = NULL,
        updated_at             = now()
    WHERE id = target_user_id;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;

    IF rows_updated = 0 THEN
        RETURN json_build_object('error', 'User not found');
    END IF;

    RETURN json_build_object('success', true);
END;
$$;

-- Allow authenticated users to invoke this function
-- (the function body itself enforces admin-only access)
GRANT EXECUTE ON FUNCTION public.admin_update_user_email(uuid, text) TO authenticated;


-- =========================================================
-- 5. ADMIN CREATE USER FUNCTION (RPC FALLBACK)
-- =========================================================
-- Allows admins to create a new auth user directly in the database,
-- bypassing the admin-actions Edge Function.  Used as a fallback when
-- the Edge Function is unavailable or not yet deployed.
--
-- Recognised as admin: user_metadata.role = 'admin'  OR
--                      app_metadata.role  = 'admin'  OR
--                      one of the two permanent admin emails below.
--
-- Requires the pgcrypto extension (pre-installed on all Supabase projects).

CREATE OR REPLACE FUNCTION public.admin_create_user(
    new_email    text,
    new_password text,
    full_name    text DEFAULT '',
    user_role    text DEFAULT 'editor'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    caller_role      text;
    caller_email     text;
    admin_emails     text[] := ARRAY['mathyousos5@gmail.com', 'soky@dagrand.net'];
    new_user_id      uuid;
    existing_user_id uuid;
    clean_email      text;
BEGIN
    -- Identify calling user
    caller_role := coalesce(
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata'  ->> 'role'
    );
    SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();

    -- Enforce admin-only access
    IF caller_role IS DISTINCT FROM 'admin'
       AND NOT (lower(caller_email) = ANY(admin_emails))
    THEN
        RETURN json_build_object('error', 'Forbidden: Admin access required');
    END IF;

    clean_email := lower(trim(new_email));

    -- Check if email already exists
    SELECT id INTO existing_user_id FROM auth.users WHERE email = clean_email;
    IF existing_user_id IS NOT NULL THEN
        RETURN json_build_object('error', 'A user with this email address already exists');
    END IF;

    new_user_id := gen_random_uuid();

    -- Insert new user into auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_user_meta_data,
        raw_app_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        new_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        clean_email,
        crypt(new_password, gen_salt('bf')),
        now(),
        json_build_object('full_name', full_name, 'role', user_role)::jsonb,
        json_build_object('provider', 'email', 'providers', ARRAY['email'])::jsonb,
        now(),
        now(),
        '',
        '',
        '',
        ''
    );

    -- Insert identity record so the user can sign in with email/password
    BEGIN
        INSERT INTO auth.identities (
            provider_id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            clean_email,
            new_user_id,
            json_build_object('sub', new_user_id::text, 'email', clean_email)::jsonb,
            'email',
            now(),
            now(),
            now()
        );
    EXCEPTION WHEN others THEN
        -- Log the error so it surfaces in Supabase function logs.
        -- Identities table schema may vary across Supabase versions; the user
        -- record in auth.users was already created so they can still be found,
        -- but sign-in may require re-linking via the Supabase dashboard.
        RAISE WARNING 'admin_create_user: failed to insert auth.identities for user % (%): %',
            new_user_id, clean_email, SQLERRM;
    END;

    RETURN json_build_object(
        'user', json_build_object(
            'id', new_user_id,
            'email', clean_email,
            'user_metadata', json_build_object('full_name', full_name, 'role', user_role)
        )
    );
END;
$$;

-- Allow authenticated users to invoke this function
-- (the function body itself enforces admin-only access)
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text) TO authenticated;

