# Supabase Authentication & Security Guide

This document details the Supabase Email/Password authentication setup, Next.js 16 Proxy route protection, Row-Level Security (RLS) policies, and dashboard configurations for **Share Drobe**.

---

## 1. Environment Variables

Create or ensure `.env.local` contains the following keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> **Security Note:** Never commit `.env.local` or service role keys to Git.

---

## 2. Supabase Dashboard Configuration

### 2.1 Enable Email Provider
1. Go to your Supabase Project Dashboard -> **Authentication** -> **Providers**.
2. Select **Email** and verify it is enabled.
3. Choose whether **Confirm email** is required:
   - If enabled: user must click the confirmation link before their first login.
   - If disabled: user is signed in immediately upon registration.

### 2.2 Site URL & Redirect URLs
Under **Authentication** -> **URL Configuration**:
- **Site URL:** `http://localhost:3000` (or your production domain).
- **Redirect URLs:** Add:
  - `http://localhost:3000/auth/confirm`
  - `http://localhost:3000/**`
  - `https://your-production-domain.com/auth/confirm`

### 2.3 Email Templates (Confirmation Link)
Under **Authentication** -> **Email Templates** -> **Confirm signup**:
Update the link to use the token hash route:
```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your account:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a></p>
```

---

## 3. Database & Storage Migration

Execute the migration file located at:
`supabase/migrations/20261012000000_auth_owner_rls.sql`

In your Supabase Dashboard:
1. Navigate to **SQL Editor**.
2. Paste the contents of `20261012000000_auth_owner_rls.sql`.
3. Click **Run**.

This migration:
- Adds `owner_id` (foreign key to `auth.users(id)`) to the `items` table.
- Enables **Row Level Security (RLS)** on `items`.
- Restricts insertion, updates, and deletes to the authenticated owner (`auth.uid() = owner_id`).
- Creates/configures the `wardrobe` storage bucket with user-scoped upload isolation (`<user_id>/filename`).

---

## 4. Architecture Overview

- **Server Client (`src/utils/supabase/server.ts`):**
  Uses `@supabase/ssr` `createServerClient` with Next.js 16 async `cookies()`.
- **Browser Client (`src/utils/supabase/client.ts`):**
  Uses `createBrowserClient` for interactive client-side operations.
- **Route Protection (`src/proxy.ts` & `src/utils/supabase/proxy.ts`):**
  Next.js 16 proxy convention refreshing cookies via `supabase.auth.getUser()`.
  Redirects unauthenticated users attempting to access `/` or `/profile` to `/login`.
  Redirects authenticated users hitting `/login` back to `/`.
- **Server Actions:**
  - `src/app/login/actions.ts`: `signIn` and `signUp`.
  - `src/app/profile/actions.ts`: `updateProfile`, `updatePassword`, and `signOut`.
- **UI & Design Tokens:**
  Tailwind v4 tokens in `src/app/globals.css` matching the Parisian Navy & Dusty Lilac Stitch export (`Buttercream`, `Chalk`, `French Navy`, `Dusty Lilac`, `Midnight Slate`, `Muted`, `Border Neutral`).

---

## 5. Local Validation & Testing

Run the full validation pipeline:
```bash
npm run typecheck
npm run lint
npm run build
```

Or trigger the automated pre-PR pipeline:
```bash
npm run validate-and-pr
```
