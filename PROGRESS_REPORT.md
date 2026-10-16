# Share Drobe — Multi-Agent Engineering Progress Report & Handoff

> **Document Type:** Multi-Agent System Handoff & System State Blueprint  
> **Repository:** `sheen93/sharedrobe`  
> **Last Updated:** October 16, 2026 (Local Time: 18:15 EDT)  
> **Current Stable Commit on `main`:** `e835bca`  
> **Active Environment:** Next.js 16.3.5 (App Router, Turbopack) / React 19 / TypeScript 5 / Tailwind CSS v4 / Supabase (@supabase/ssr)

---

## 1. Executive Summary & Project Purpose

**Share Drobe** is a circular fashion platform designed for minimalist personal wardrobe cataloging and friction-free circle-based closet sharing. The MVP prioritizes high-utility personal wardrobe database management, low-friction sharing directories with close friends/circles, and clean authentication without social feed bloat.

This document serves as an exhaustive, definitive record of every engineering decision, architectural pattern, bug fix, test suite, and cloud configuration completed to date. Any multi-agent system or human engineering team can resume work immediately from this checkpoint.

---

## 2. Complete Chronological Timeline of Engineering Work

### Milestone 1: Supabase SSR Authentication & Stitch Design System (`feat/supabase-auth-ui`)
- **Tokens & Styling Migration:**
  - Modernized `src/app/globals.css` using Tailwind CSS v4 `@theme` block. Replaced initial sage/cream prototype colors with the exact **Parisian Navy & Dusty Lilac** palette from the Google Stitch export (`Buttercream #FCFBF7`, `Chalk #F0EFE9`, `French Navy #1D2A44`, `Dusty Lilac #9683B8`, `Midnight Slate #121926`, `Cool Slate #64748B`, `Border Neutral #E5E2D6`).
  - Added font fallbacks for `Plus Jakarta Sans` and `JetBrains Mono` without build-time network blocking.
- **Next.js 16 Proxy Route Protection:**
  - Implemented `src/proxy.ts` (Next.js 16 deprecation/replacement for legacy `middleware.ts`).
  - Implemented `src/utils/supabase/proxy.ts` with session refresh via `supabase.auth.getUser()` to safely persist refreshed cookies across redirects.
  - Protected `/`, `/profile`, and `/sharedrobe` routes; unauthenticated users redirect to `/login`, while authenticated users hitting `/login` redirect to `/`.
- **Server and Browser Clients:**
  - Created `src/utils/supabase/server.ts` using `@supabase/ssr` with Next.js 16 asynchronous `cookies()`.
  - Created `src/utils/supabase/client.ts` for Client Components with environment validation in `src/utils/supabase/env.ts`.
- **Frontend Authentication Screen (`src/app/login/page.tsx`):**
  - Built mobile-responsive login/signup view with segmented toggle, accessible inputs, and server actions (`src/app/login/actions.ts`).
  - Added email confirmation route handler at `src/app/auth/confirm/route.ts` supporting both PKCE code exchange and `token_hash` verification.
- **Frontend Profile Screen (`src/app/profile/page.tsx` & `ProfileClient.tsx`):**
  - Built 3-field account view (Name, Verified Email, Masked Password) with password update modal trigger, credentials save, and sign-out server actions.
- **User Wardrobe Isolation:**
  - Updated `src/app/page.tsx` (`MyDrobe`) to scope item queries to `.eq("owner_id", user.id)`.
- **Initial Database RLS Migration:**
  - Authored `supabase/migrations/20261012000000_auth_owner_rls.sql`.
- **Automated Validation & Pre-PR Script:**
  - Created `scripts/validate-and-pr.sh` and npm scripts (`npm run typecheck`, `npm run validate-and-pr`).

---

### Milestone 2: Mobile Access, Upload Logic Refactor & Missing Route (`fix/auth-upload-and-routing-v2`)
- **Mobile Access Dev Configuration:**
  - Updated `next.config.ts` with `allowedDevOrigins: ["192.168.1.52"]` to allow local Wi-Fi mobile debugging without cross-origin dev server blocks.
- **Upload Logic Refactor (`src/components/AddItemModal.tsx`):**
  - Integrated client-side image compression (`browser-image-compression`) targeting < 0.8 MB.
  - Scoped Supabase Storage uploads to `${user.id}/${fileName}` in bucket `wardrobe`.
  - Extracted public URLs and explicitly inserted records into `items` table with `owner_id: user.id`.
- **Community Hub Route (`src/app/sharedrobe/page.tsx`):**
  - Scaffolded the `/sharedrobe` screen as an editorial "Coming Soon" directory hub featuring Stitch design tokens, preview circles ("College Roommates", "Weekend Gala Circle"), and the active `<BottomNav />`.
  - Updated `src/components/BottomNav.tsx` so the `ShareDrobe` icon links directly to `/sharedrobe`.
- **Strict RLS Database Migration:**
  - Authored `supabase/migrations/20261012000001_rls_insert_policy.sql` dropping all loose policies and establishing strict `auth.uid() = owner_id` for SELECT, INSERT, UPDATE, and DELETE.
- **Merged to `main` at commit `e77b05b`.**

---

### Milestone 3: Postgres Category ENUM Bug Fix & Hardened QA (`fix/enum-category-and-upload-qa`)
- **Root Cause Analysis:**
  - Insertions failed with `invalid input value for enum item_category` (Postgres error code `22P02`). The database ENUM type `item_category` is strictly plural:
    `'Tops'`, `'Bottoms'`, `'Dresses'`, `'Outerwear'`, `'Shoes'`, `'Bags'`, `'Accessories'`.
  - The frontend modal was sending singular values (`Top`, `Bottom`, `Dress`).
- **Dropdown & Enum Alignment:**
  - Rewrote `<select>` dropdown in `src/components/AddItemModal.tsx` using `VALID_ENUM_CATEGORIES = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories"]`.
  - Options display rich UX labels with garment hints while the underlying `value` attribute guarantees exact ENUM compatibility.
  - Updated `src/app/page.tsx` filter pills to match plural categories with plural/singular normalization.
- **QA Advocate Test Suite (`scripts/test-upload-edge-cases.mjs` & `src/utils/upload-errors.ts`):**
  - Extracted validation and error-mapping into pure functions in `src/utils/upload-errors.ts`.
  - Created automated test runner verifying 14 distinct failure scenarios:
    1. Missing file
    2. Missing title
    3. Invalid category
    4. Session expiration / missing user token
    5. Storage bucket missing (404)
    6. Storage permission denied (403)
    7. Storage payload too large (413)
    8. Storage network failure
    9. Postgres ENUM violation (`22P02`)
    10. Postgres RLS violation (`42501`)
    11. Postgres foreign key violation (`23503`)
    12. Generic DB error handling
    13. Integrity checks on all 7 ENUM values
  - Added `"test": "node scripts/test-upload-edge-cases.mjs"` to `package.json` and integrated into `scripts/validate-and-pr.sh`.
- **Merged to `main` at commit `be95d4c`.**

---

### Milestone 4: Mobile Closet Loading Freeze Fix & Full-Bleed Responsive Layout (`fix/mobile-closet-loading-and-layout`)
- **Bug Diagnosis & Root Causes:**
  1. *Mobile Loading Freeze:* On mobile browsers, `/` (`MyDrobe`) froze in an indefinite "Loading Closet..." spinner. In React 19, `createBrowserClient()` was re-instantiated on every render inside `src/app/page.tsx` within a client component, causing `navigator.locks` auth token acquisition deadlocks and effect cleanups that stranded `isLoading = true`.
  2. *Cross-Origin Dev Origin Blocking:* Accessing the dev server from local mobile devices (`192.168.1.153:3000`) was blocked by Next.js due to hardcoded single IP `192.168.1.52` in `next.config.ts`.
  3. *Double Bezel & Mockup Badges:* On physical mobile screens, fixed desktop demo shells (`max-w-[390px] rounded-[32px] border shadow-2xl p-4`) caused nested "phone-inside-a-phone" borders, and dev badges (`SCREEN 1`, `SCREEN 2`, `SCREEN 3`, `AUTH`) cluttered the interface.
- **Architectural Solutions:**
  - **Server-Side Data Fetching (SSR Streaming):**
    - Converted `src/app/page.tsx` into an asynchronous Server Component utilizing `createClient()` from `@/utils/supabase/server.ts` with cookie-based session verification.
    - Wardrobe items are loaded server-side and streamed immediately in initial HTML, entirely eliminating client-side loading spinners on initial page visit.
  - **Hydrated Client Component (`src/app/MyDrobeClient.tsx`):**
    - Created `MyDrobeClient.tsx` receiving preloaded items as props.
    - Category filtering is evaluated directly in-memory with zero network latency.
    - Upload refresh is handled cleanly via React 19 `useTransition` and `router.refresh()` without tearing or duplicate state.
  - **Singleton Browser Client (`src/utils/supabase/client.ts`):**
    - Updated `createClient()` to reuse a module-level `browserClient` singleton, resolving mobile browser `navigator.locks` token contention.
  - **Full-Bleed Responsive Layout Shell:**
    - Standardized all application views (`/`, `/sharedrobe`, `/profile`, `/login`) to use a responsive `<main>` shell (`flex w-full max-w-md flex-1 flex-col bg-buttercream p-4 pb-28 sm:rounded-[32px] sm:border sm:border-border-neutral sm:p-5 sm:shadow-2xl`).
    - On mobile phones, content extends smoothly to the screen edges with native ergonomics; on desktop, it displays as an elegant centered card.
    - Removed all artificial mockup badge tags (`SCREEN 1`, `SCREEN 2`, `SCREEN 3`, `AUTH // Secure Closet Access`).
  - **LAN Dev Access (`next.config.ts`):**
    - Expanded `allowedDevOrigins` to support active LAN IP `192.168.1.153`, local subnet wildcards (`192.168.*.*`, `10.*.*.*`, `172.*.*.*`), and `localhost`.
- **Validation & Quality Gates:**
  - 0 ESLint errors (ESLint 9 compliant).
  - 0 TypeScript errors (`tsc --noEmit`).
  - 14/14 automated QA edge-case tests passing (`npm test`).
  - Next.js 16 Turbopack production build succeeded (`npm run build`).
- **Merged to `main` at commit `0afeac2`.**

---

### Milestone 5: Phase 2 Social Engine — Circles, Friends, Real-Time Search & Garment Sharing (`feat/phase2-friends-and-circles`)
- **Part 1: Database Architecture & Circle-Aware RLS (`supabase/migrations/20261016000000_phase2_social.sql`):**
  - `profiles`: Synced with `auth.users(id)` via trigger `on_auth_user_created` and idempotent backfill script.
  - `friendships`: Canonical pair index `(LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))` and check constraint preventing self-friending.
  - `circles` & `circle_members`: Group hierarchy with `admin` and `member` roles. Trigger automatically adds circle creators as approved admins.
  - `circle_items`: Junction table tracking which garments are shared to which circles.
  - RLS Anti-Recursion Architecture: `SECURITY DEFINER` STABLE functions (`is_circle_admin`, `is_circle_member`, `is_item_shared_with_user`) to bypass Postgres recursive policy evaluation.
  - Updated `items` RLS policy `items_select_owner_or_circle_policy`: items are visible to their owner OR any approved member of a mutual circle where the item is shared.
- **Part 2: Typed Server Actions & Resend Email Integration (`src/app/sharedrobe/actions.ts` & `src/utils/email/resend.ts`):**
  - Resend SDK integration with Stitch-styled transactional HTML emails for friend requests and circle member applications.
  - Graceful error boundary: missing `RESEND_API_KEY` or transient mail network timeouts are caught safely (`skipped: true`), preventing database rollback.
  - Fully typed actions: `sendFriendRequest`, `respondToFriendRequest`, `createCircle`, `requestJoinCircle`, `shareItemToCircle`, `getUserApprovedCirclesForItem`, `shareItemToCircles`, `respondToCircleMemberRequest`, and `searchSocial`.
- **Part 3: Community Hub UI (`src/app/sharedrobe/`):**
  - SSR data prefetching in Server Component `src/app/sharedrobe/page.tsx`.
  - Live client view `SharedrobeClient.tsx` with 3 segmented tabs:
    - **My Circles:** Displays approved circles, admin tags, member counts, shared garment galleries, and pending circle requests.
    - **My Friends:** Displays connected friends with two-letter avatar badges, emails, and outgoing requests.
    - **Search:** Real-time debounced fuzzy search with loading spinners, filter pills (`All`, `People`, `Circles`), and contextual action buttons (`+ Add Friend`, `Join Circle`, `Connected`, `Member`).
  - Prominent **Pending Action Requests** banner allowing 1-tap accept/decline for incoming friend and circle requests.
  - `CreateCircleModal.tsx` for creating circles with character validation.
- **Part 4: Garment Sharing Integration (`src/components/ShareItemModal.tsx` & `src/app/MyDrobeClient.tsx`):**
  - Item cards in MyDrobe updated with a dedicated "Share" button and circle count indicator (`Private` vs. `In X Circles`).
  - `ShareItemModal.tsx` fetches user's approved circles, displays an interactive checklist, disables already-shared circles, and executes batch sharing with duplicate prevention.
- **Validation & Quality Gates:**
  - 0 ESLint errors (ESLint 9 compliant).
  - 0 TypeScript errors (`tsc --noEmit`).
  - 27/27 automated QA edge-case tests passing (`npm test`).
  - Next.js 16 Turbopack production build succeeded (`npm run build`).
- **Merged to `main` at commit `e835bca`.**

---

### Milestone 6: Circle Member Friends Addition & Notification Engine (`feat/add-friends-to-circle`)
- **Backend & Server Actions (`src/app/sharedrobe/actions.ts`):**
  - Built typed server action `addFriendsToCircle(circleId, friendUserIds)`:
    - UUID format validation for circle and friend IDs.
    - Session authentication verification.
    - Verifies current user is an approved admin or member of the circle.
    - Strict friendship verification: confirms all targets are accepted friends in `friendships`.
    - Duplicate member filtering: prevents duplicate key constraint errors by filtering out already-approved members.
    - Inserts new members into `circle_members` with `role: 'member'` and `status: 'approved'`.
    - Dispatches transactional Resend notification emails via `sendCircleAddedNotificationEmail`.
    - Revalidates `/sharedrobe`.
  - Built typed server action `getCircleFriendsStatus(circleId)`:
    - Maps all connected friends against `circle_members` to accurately indicate member/pending/available statuses.
- **Resend Email Integration (`src/utils/email/resend.ts`):**
  - Added `sendCircleAddedNotificationEmail`:
    - Sends clean, Stitch-styled transactional HTML email notifying friends that they were added to the circle.
    - Defensive error boundary: skips safely if `RESEND_API_KEY` is not configured without failing the action.
- **Frontend & Stitch UI Components:**
  - Created `src/components/AddFriendsToCircleModal.tsx`:
    - Google Stitch modal with responsive full-bleed mobile container and centered desktop card.
    - Real-time search filter for large friend lists.
    - Displays friend avatar badges, full names, emails, and live circle status (`MEMBER`, `PENDING`, or selectable checkbox).
    - Quick "Select All" / "Deselect All" action.
    - Empty state with direct shortcut to search members if no friends are connected yet.
  - Updated `src/app/sharedrobe/SharedrobeClient.tsx`:
    - Added "+ Add Friends" quick action button directly on each circle card header.
    - Added dedicated member management bar and "+ Add Friends to Circle" button inside the expanded circle drawer.
    - Added instant feedback banners on successful friend additions.
  - Updated `src/app/sharedrobe/page.tsx`:
    - SSR queries enriched to fetch `user_id` in `circle_members` and preload `memberUserIds` on `UserCircleData` for zero-latency instant hydration.
- **QA Verification & Edge Case Matrix:**
  - Expanded `scripts/test-social-actions-edge-cases.mjs` with Section 5 (6 new tests for empty lists, invalid UUIDs, non-friends, duplicate prevention, and HTML template escaping).
  - Total automated tests increased from 27 to 33 passing tests (14 upload + 19 social).
  - 0 ESLint errors, 0 TypeScript errors, Turbopack build succeeded.
- **Merged to `main` at commit `2186d0e`.**

---

## 3. Current Architecture & File-by-File Blueprint

```
sharedrobe/
├── .antigravity/                   # Agent personas & engineering playbooks
├── docs/
│   └── AUTH.md                     # Supabase authentication & deployment guide
├── scripts/
│   ├── test-social-actions-edge-cases.mjs # QA Advocate social actions test suite (19 tests)
│   ├── test-upload-edge-cases.mjs  # QA Advocate automated edge-case test suite (14 tests)
│   └── validate-and-pr.sh          # CI pre-PR pipeline (lint -> typecheck -> test -> build -> push)
├── src/
│   ├── app/
│   │   ├── auth/confirm/route.ts   # Supabase email confirmation callback (PKCE + token_hash)
│   │   ├── login/
│   │   │   ├── actions.ts          # Server actions for signIn and signUp
│   │   │   └── page.tsx            # Stitch-themed mobile login & registration UI
│   │   ├── profile/
│   │   │   ├── actions.ts          # Server actions for updateProfile, updatePassword, signOut
│   │   │   ├── page.tsx            # Server Component fetching authenticated user
│   │   │   └── ProfileClient.tsx   # Interactive profile form with password modal trigger
│   │   ├── sharedrobe/
│   │   │   ├── actions.ts          # Phase 2 Server actions (friends, circles, item sharing, add friends)
│   │   │   ├── page.tsx            # Community Hub SSR Server Component prefetching circles & friends
│   │   │   └── SharedrobeClient.tsx # 3-tab UI: My Circles, My Friends, Real-Time Search & Pending Requests
│   │   ├── globals.css             # Tailwind v4 @theme design tokens (Parisian Navy & Dusty Lilac)
│   │   ├── layout.tsx              # Root HTML shell with typography & viewport settings
│   │   ├── page.tsx                # Server Component: authenticates & prefetches MyDrobe items via SSR
│   │   └── MyDrobeClient.tsx       # Hydrated client view: in-memory category filter, ShareItemModal trigger
│   ├── components/
│   │   ├── ui/
│   │   │   ├── FieldCard.tsx       # Stitch-styled chalk form card with labels & captions
│   │   │   ├── FormMessage.tsx     # Accessible inline alert banner (error / success)
│   │   │   ├── IconInput.tsx       # Text/password/email input with trailing Lucide icons
│   │   │   ├── InfoBar.tsx         # Compact status strip below screen headers
│   │   │   ├── ScreenHeader.tsx    # Header with uppercase mono breadcrumb + screen title
│   │   │   └── SubmitButton.tsx    # Accessible CTA button with pending loader (useFormStatus)
│   │   ├── AddFriendsToCircleModal.tsx # Modal for adding members from friends list into a circle
│   │   ├── AddItemModal.tsx        # Camera/upload modal with compression & error handling
│   │   ├── BottomNav.tsx           # Floating Parisian Navy 3-tab pill (MyDrobe, ShareDrobe, Profile)
│   │   ├── CreateCircleModal.tsx   # Modal for creating new wardrobe circles
│   │   └── ShareItemModal.tsx      # Modal for sharing garments into approved circles
│   ├── proxy.ts                    # Next.js 16 route proxy (middleware replacement)
│   └── utils/
│       ├── auth/
│       │   ├── errors.ts           # Friendly error copy mapper for Supabase Auth errors
│       │   ├── form-state.ts       # Type definitions for form state across server actions
│       │   └── validation.ts       # Pure validators for sign in, sign up, profile, passwords
│       ├── cn.ts                   # Tailwind class merge utility (clsx + twMerge)
│       ├── email/
│       │   └── resend.ts           # Resend email notification client & transactional HTML templates
│       ├── supabase/
│       │   ├── client.ts           # Singleton browser Supabase client (prevents mobile navigator.locks deadlock)
│       │   ├── env.ts              # Strongly-typed environment variable validator
│       │   ├── proxy.ts            # Proxy session refresher & redirect engine
│       │   └── server.ts           # SSR Supabase client using Next.js 16 async cookies()
│       └── upload-errors.ts        # Category enum definitions & error resolution logic
├── supabase/
│   └── migrations/
│       ├── 20261012000000_auth_owner_rls.sql     # Baseline owner_id column & RLS setup
│       ├── 20261012000001_rls_insert_policy.sql  # Strict RLS (auth.uid() = owner_id) & Storage policies
│       └── 20261016000000_phase2_social.sql      # Phase 2 Social Engine: profiles, circles, friends, RLS
├── next.config.ts                  # Allowed dev origins (192.168.1.153, 192.168.*.*, etc.) for mobile LAN dev
├── package.json                    # Scripts & dependencies
└── tsconfig.json                   # Strict TypeScript compiler options
```

---

## 4. Design System & Token Specifications

Tailwind CSS v4 design tokens are configured in `src/app/globals.css` under `@theme`:

| Token Name | Hex Code | Purpose |
| :--- | :--- | :--- |
| **Buttercream Ivory** | `#FCFBF7` | Primary canvas, screen background, input fields |
| **Chalk Alabaster** | `#F0EFE9` | Card surfaces, folder rows, field cards |
| **Linen** | `#F4F2EB` | Outer page background behind mobile container |
| **French Navy** | `#1D2A44` | Primary brand accent, primary buttons, bottom nav pill |
| **French Navy Hover** | `#28395B` | Hover state for primary buttons |
| **Dusty Lilac** | `#9683B8` | Secondary accent, active highlights, badges, icons |
| **Midnight Slate** | `#121926` | High-contrast headers and primary text |
| **Graphite** | `#475467` | Descriptive body copy |
| **Cool Slate / Muted**| `#64748B` | Secondary labels, directory metadata, monospaced counters |
| **Border Neutral** | `#E5E2D6` | Subtle dividers, card borders, outline contours |
| **Border Strong** | `#D9D6CC` | Input outlines, icon tiles, scrollbar thumb |

---

## 5. Database Schema & RLS Security

### 5.1 Tables
```sql
-- items table structure
create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade default auth.uid(),
  category public.item_category not null, -- ENUM ('Tops','Bottoms','Dresses','Outerwear','Shoes','Bags','Accessories')
  title text not null,
  image_url text not null,
  tags text[] default array[]::text[],
  is_sharable boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

### 5.2 Strict Row-Level Security (RLS)
The active migration is `supabase/migrations/20261012000001_rls_insert_policy.sql`:
- **SELECT:** `USING (auth.uid() = owner_id)` (Strictly scoped to the item owner).
- **INSERT:** `WITH CHECK (auth.uid() = owner_id)` (Users can only write items with their own user ID).
- **UPDATE:** `USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id)`.
- **DELETE:** `USING (auth.uid() = owner_id)`.

### 5.3 Storage Bucket (`wardrobe`)
- **Bucket Visibility:** `public = true`.
- **File Hierarchy:** `wardrobe/<owner_id>/<timestamp>-<rand>.<ext>`.
- **Storage Policies:**
  - `INSERT`: Authenticated users can only upload into `(storage.foldername(name))[1] = auth.uid()::text`.
  - `SELECT`: Public read enabled for item display.
  - `UPDATE` / `DELETE`: Authenticated users can only modify/delete files in their own folder.

### 5.4 Phase 2 Social Schema & Anti-Recursion RLS (`20261016000000_phase2_social.sql`)
```sql
-- profiles (mirrors auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- friendships
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending', -- 'pending', 'accepted'
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  check (requester_id <> addressee_id)
);

-- circles & circle_members
create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create table public.circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.circle_role not null default 'member', -- 'admin', 'member'
  status public.circle_member_status not null default 'pending', -- 'pending', 'approved'
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique (circle_id, user_id)
);

-- circle_items
create table public.circle_items (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique (circle_id, item_id)
);
```

#### Anti-Recursion Security Definer Functions:
In Postgres/Supabase, querying `circle_members` within a `circle_members` policy creates infinite recursion (`42P17`). This is resolved using `SECURITY DEFINER` functions with fixed search paths:
- `public.is_circle_admin(check_circle_id uuid, check_user_id uuid) returns boolean`
- `public.is_circle_member(check_circle_id uuid, check_user_id uuid) returns boolean`
- `public.is_item_shared_with_user(check_item_id uuid, check_user_id uuid) returns boolean`

#### Circle-Aware Garment RLS:
`public.items` policy `items_select_owner_or_circle_policy`:
- Garments are visible to their owner (`auth.uid() = owner_id`) OR any user where `public.is_item_shared_with_user(id, auth.uid())` returns true.

---

## 6. QA Verification Matrix & Test Results

Run all checks locally with:
```bash
npm run lint         # ESLint 9 (0 errors, 0 warnings)
npm run typecheck    # TypeScript 5 (No type errors)
npm test             # QA Advocate unified test suites (33 passing tests)
npm run build        # Next.js 16 Turbopack build (All routes compiled)
```

### Automated Edge Case Test Run Output
```
> sharedrobe@0.1.0 test
> node scripts/test-upload-edge-cases.mjs && node scripts/test-social-actions-edge-cases.mjs

==================================================
  QA Advocate: Upload Edge Cases & Error Verification
==================================================
  ✅ [PASS] Integrity: All 7 required Postgres ENUM categories are present
  ✅ [PASS] Scenario 1A: Fails gracefully when no file is selected
  ✅ [PASS] Scenario 1B: Fails gracefully when no title is entered
  ✅ [PASS] Scenario 1C: Fails gracefully when an invalid singular category is submitted
  ✅ [PASS] Scenario 2A: Session expired / user missing
  ✅ [PASS] Scenario 2B: Auth error returned by Supabase auth.getUser()
  ✅ [PASS] Scenario 3A: Storage bucket missing (404)
  ✅ [PASS] Scenario 3B: Storage bucket permission denied (403)
  ✅ [PASS] Scenario 3C: File too large / payload exceeds limit (413)
  ✅ [PASS] Scenario 3D: Network connection failed during upload
  ✅ [PASS] Scenario 4A: Postgres ENUM constraint failure (Code 22P02)
  ✅ [PASS] Scenario 4B: DB insert RLS violation (Code 42501)
  ✅ [PASS] Scenario 4C: DB insert foreign key error (Code 23503)
  ✅ [PASS] Scenario 4D: Generic database insert error
==================================================
🎉 All 14 Upload QA edge case test scenarios PASSED!

==================================================
  QA Advocate: Social Engine & Sharing Validation 
==================================================
  ✅ [PASS] 1A: UUID validation correctly accepts valid v4 UUIDs and rejects malformed strings
  ✅ [PASS] 1B: Self-friending comparison accurately detects identical requester and addressee
  ✅ [PASS] 2A: Rejects circle names under 2 characters
  ✅ [PASS] 2B: Rejects circle names over 50 characters, accepts valid names
  ✅ [PASS] 2C: Rejects circle descriptions exceeding 250 characters
  ✅ [PASS] 3A: Missing RESEND_API_KEY gracefully returns skipped without crashing
  ✅ [PASS] 3B: Resend network/exception failure is gracefully caught without throwing unhandled error
  ✅ [PASS] 3C: Resend API rejection error is captured cleanly
  ✅ [PASS] 3D: HTML template escaping effectively neutralizes potential script tags and special chars
  ✅ [PASS] 4A: Rejects sharing when circle checklist is empty
  ✅ [PASS] 4B: Rejects invalid or malformed circle IDs in share selection
  ✅ [PASS] 4C: Rejects invalid or malformed garment item IDs
  ✅ [PASS] 4D: Correctly filters out already-shared circles to prevent duplicate junction rows
  ✅ [PASS] 4E: Gracefully detects when garment is already shared in all selected circles
  ✅ [PASS] 5A: Rejects adding friends when friends selection is empty
  ✅ [PASS] 5B: Rejects invalid circle ID in addFriendsToCircle
  ✅ [PASS] 5C: Rejects malformed or invalid friend user IDs in batch selection
  ✅ [PASS] 5D: Correctly filters out friends who are already members of circle
  ✅ [PASS] 5E: Gracefully detects when all selected friends are already members
  ✅ [PASS] 5F: Circle added transactional notification safely escapes recipient and circle names
==================================================
🎉 All 19 Social Engine, Circle Friends & Sharing tests PASSED!
```

---

## 7. Cloud Prerequisites (Supabase Dashboard Checklist)

For any developer or agent running this repository on a fresh Supabase project:

1. **Environment Variables (`.env.local`):**
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   RESEND_API_KEY=re_... # Optional: transactional emails for friend/circle requests
   ```
2. **Execute Migrations in SQL Editor:**
   - Run `supabase/migrations/20261012000000_auth_owner_rls.sql`
   - Run `supabase/migrations/20261012000001_rls_insert_policy.sql`
   - Run `supabase/migrations/20261016000000_phase2_social.sql`
   - Confirm that the `item_category` enum contains: `Tops`, `Bottoms`, `Dresses`, `Outerwear`, `Shoes`, `Bags`, `Accessories`.
3. **Storage Bucket Configuration:**
   - In Supabase Dashboard -> **Storage** -> **Buckets**, confirm bucket `wardrobe` is created and toggled to **Public**.
4. **Authentication Settings:**
   - Ensure **Email** provider is enabled.
   - Set Site URL to `http://localhost:3000` (or `http://192.168.1.153:3000`).
   - Add Redirect URLs:
     - `http://localhost:3000/auth/confirm`
     - `http://192.168.1.153:3000/auth/confirm`
     - `http://192.168.1.52:3000/auth/confirm`

---

## 8. Roadmap & Next Steps for Future Multi-Agent Iterations

The following tasks are prioritized for the next development sprints:

### Sprint 1: ShareDrobe Circles Engine (Phase 2 MVP) — [COMPLETED]
- **Delivered in Phase 2 (`feat/phase2-friends-and-circles`):**
  - Database schema & idempotent backfill in `supabase/migrations/20261016000000_phase2_social.sql`.
  - Anti-recursion security definer functions for safe circle member evaluation.
  - Circle-aware RLS policy on `public.items`.
  - Resend transactional email integration with Stitch HTML styling.
  - 3-tab Community Hub UI in `src/app/sharedrobe/` (My Circles, My Friends, Real-Time Fuzzy Search, Pending Requests banner).
  - Garment sharing modal (`ShareItemModal.tsx`) with circle checklist and batch sharing.
  - 13 automated social edge case tests in `scripts/test-social-actions-edge-cases.mjs` (27 total tests across project).

### Sprint 2: Wardrobe Item Management & Item Detail View
- **Item Detail Screen (`/items/[id]`):**
  - Full-screen item view with high-res image, category badge, and editable tags.
  - Delete item trigger with confirmation dialog and corresponding storage image cleanup.
  - Item status toggle: `Available`, `Lent Out`, `In Laundry`.

### Sprint 3: Lookbook Builder ("Fav Outfit")
- **Fav Outfit Feature:**
  - Multi-item pairing engine linking a `Top` and `Bottom` (or `Dress` + `Accessories`) into a curated lookbook card matching the Dusty Lilac folder styling in the Stitch mockups.

---

## 9. Multi-Agent System Onboarding & Quick-Start Cheatsheet

For any multi-agent system or incoming developer continuing development on Share Drobe:

### 9.1 Required Agent Roles & Governance
- **Lead Architect:** Adhere strictly to the Next.js 16 App Router architecture (`src/proxy.ts`, Server Components for initial fetches, Server Actions for mutations).
- **Frontend Engineer:** Maintain the Google Stitch design tokens in `src/app/globals.css` (`Buttercream`, `Chalk`, `French Navy`, `Dusty Lilac`, `Midnight Slate`). All mobile screens must use full-bleed responsive cards with `sm:` desktop framing.
- **QA Advocate:** Every new feature or refactor must be accompanied by edge-case test coverage in `scripts/test-upload-edge-cases.mjs` or dedicated test scripts.

### 9.2 Development Commands
```bash
# Start dev server bound to LAN (accessible via desktop and mobile Wi-Fi)
npm run dev -- -H 0.0.0.0

# Run full pre-PR validation gate (must pass with 0 errors before any commit/merge)
npm run lint && npm run typecheck && npm test && npm run build
```

### 9.3 Key Architectural Guardrails
1. **Never use singular category strings:** The Postgres ENUM `item_category` is strictly plural (`Tops`, `Bottoms`, `Dresses`, `Outerwear`, `Shoes`, `Bags`, `Accessories`). Any insert with a singular string will be rejected with code `22P02`.
2. **Never instantiate `createBrowserClient` unbound inside client components:** Always import `createClient` from `@/utils/supabase/client` which provides the singleton instance. Re-instantiating `createBrowserClient` causes `navigator.locks` contention and deadlocks auth requests on mobile browsers.
3. **Always fetch initial data in Server Components:** In Next.js 16, prefer async Server Components with `@/utils/supabase/server` for initial data queries, and pass preloaded items down to interactive client components to guarantee instant hydration without loading spinners.
4. **Preserve RLS Integrity:** Every insert into `public.items` must explicitly include `owner_id: user.id`. The active RLS policies strictly enforce `auth.uid() = owner_id`.

