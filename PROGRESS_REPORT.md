# Share Drobe — Multi-Agent Engineering Progress Report & Handoff

> **Document Type:** Multi-Agent System Handoff & System State Blueprint  
> **Repository:** `sheen93/sharedrobe`  
> **Last Updated:** October 17, 2026 (Local Time: 02:10 EDT)  
> **Current Stable Commit on `main`:** `feat/sprint2-item-management`  
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

### Milestone 7: Item Management Engine, Dynamic Item Detail Page & Feed Integration (`feat/sprint2-item-management`)
- **Part 1: Database Architecture & Constraints (`supabase/migrations/20261017000000_sprint2_item_management.sql`):**
  - Added `item_status` ENUM (`Available`, `Lent Out`, `In Laundry`).
  - Added `status` column to `public.items` (type `item_status`, default `'Available'`).
  - Added `borrowed_by` column (UUID referencing `public.profiles.id`, nullable).
  - Enforced Postgres CHECK constraint `items_tags_allowed_check` on `tags` array strictly allowing: `'Casual'`, `'Formal'`, `'Vintage'`, `'Streetwear'`, `'Workwear'`, `'Athletic'`, `'Lounge'`.
- **Part 2: Data Access & Storage Cleanup (`src/app/items/actions.ts` & `src/app/items/constants.ts`):**
  - Built typed Server Actions:
    - `updateItemStatus(itemId, status, borrowedById?)`: verifies ownership (`auth.uid() = owner_id`), validates friend connection if `Lent Out`, automatically clears `borrowed_by` to null if `Available` or `In Laundry`.
    - `updateItemTags(itemId, tags[])`: validates against allowed tags, persists array update.
    - `deleteItem(itemId, imageUrl)`: extracts relative path from URL via `extractStoragePath`, enforces user folder prefix security (`${user.id}/...`), purges file from `wardrobe` storage bucket, and deletes Postgres row.
  - Turbopack compliance refactoring: moved non-async helpers, constants (`ALLOWED_ITEM_STATUSES`, `ALLOWED_ITEM_TAGS`), and types (`ItemStatus`, `ItemTag`) into `src/app/items/constants.ts` so `"use server"` files strictly export async functions.
- **Part 3: Dynamic Item Detail UI (`src/app/items/[id]/page.tsx` & `ItemDetailClient.tsx`):**
  - Built SSR route `src/app/items/[id]/page.tsx` using Next.js 16 async params (`Promise<{ id: string }>`), prefetching item with joins to owner profile, borrower profile, and user's accepted friends.
  - Built `ItemDetailClient.tsx` matching Google Stitch tokens (`Chalk`, `French Navy`, `Dusty Lilac`, `Buttercream`):
    - Full-bleed responsive card containing high-res image and category chip.
    - Dynamic status badge showing current status (`Available`, `In Laundry`, or `Lent to [Friend Name]`).
    - 3-way segmented status toggle (`Available`, `Lent Out`, `In Laundry`).
    - Conditional friend-selector dropdown rendered only when `Lent Out` is active.
    - Interactive 7-tag aesthetic pill selector.
    - Prominent `Delete Garment from Closet` button triggering an accessible confirmation modal (`aria-modal="true"`) before executing cloud storage + DB purge.
- **Part 4: Feed Integration (`src/app/page.tsx`, `MyDrobeClient.tsx`, `src/app/sharedrobe/page.tsx`, `SharedrobeClient.tsx`):**
  - SSR queries updated to select `status`, `borrowed_by`, and join with `borrower:borrowed_by (id, full_name, email)`.
  - Wrapped wardrobe cards in MyDrobe (`src/app/MyDrobeClient.tsx`) and circle shared item previews in ShareDrobe (`src/app/sharedrobe/SharedrobeClient.tsx`) with `<Link href={'/items/${item.id}'}>`.
  - Added visual status badges: small Dusty Lilac pill saying `"Lent to [Friend Name]"` and Amber pill saying `"In Laundry"` if status is not `'Available'`.
  - Preserved independent action buttons (Share to Circle) using `stopPropagation` / `preventDefault`.
- **Part 5: Docked Screen Navigation & Layout Polish (`BottomNav.tsx` across all screens):**
  - Converted `BottomNav` from a disconnected floating capsule (`fixed bottom-3 left-4 right-4`) into an integrated bottom navigation bar (`sticky bottom-0 w-full sm:rounded-b-[31px]`) docked directly inside the `<main>` card container.
  - Added dedicated inner content containers (`pb-8 sm:pb-8`) across `MyDrobeClient.tsx`, `ItemDetailClient.tsx`, `SharedrobeClient.tsx`, and `ProfileClient.tsx`.
  - Permanently resolved the Delete button occlusion on `/items/[id]` and prevented the floating nav bar from covering bottom wardrobe cards on the homepage (`/`).
- **QA Verification & Edge Case Matrix:**
  - Expanded `scripts/test-social-actions-edge-cases.mjs` with Section 6 (7 new tests verifying storage path extraction, signed token stripping, status transitions, borrower clearing, tag constraints, and storage cross-user deletion protection).
  - Total automated tests increased from 33 to 40 passing tests (14 upload + 26 social/item management).
  - 0 ESLint errors, 0 TypeScript errors, Next.js Turbopack production build succeeded.

---

## 3. Current Architecture & File-by-File Blueprint

```
sharedrobe/
├── .antigravity/                   # Agent personas & engineering playbooks
├── docs/
│   └── AUTH.md                     # Supabase authentication & deployment guide
├── scripts/
│   ├── test-social-actions-edge-cases.mjs # QA Advocate social & items edge-case test suite (26 tests)
│   ├── test-upload-edge-cases.mjs  # QA Advocate automated edge-case test suite (14 tests)
│   └── validate-and-pr.sh          # CI pre-PR pipeline (lint -> typecheck -> test -> build -> push)
├── src/
│   ├── app/
│   │   ├── auth/confirm/route.ts   # Supabase email confirmation callback (PKCE + token_hash)
│   │   ├── items/
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx        # SSR item detail prefetching owner, borrower, and friends
│   │   │   │   └── ItemDetailClient.tsx # Full-bleed image card, 3-way status toggle, 7-tag selector, delete modal
│   │   │   ├── actions.ts          # Server actions: updateItemStatus, updateItemTags, deleteItem
│   │   │   └── constants.ts        # Item statuses, tag constraints, UUID/storage helpers (Turbopack safe)
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
│   │   └── MyDrobeClient.tsx       # Hydrated client view: in-memory category filter, item detail links, status pills
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
│       ├── 20261016000000_phase2_social.sql      # Phase 2 Social Engine: profiles, circles, friends, RLS
│       └── 20261017000000_sprint2_item_management.sql # Sprint 2: item_status ENUM, borrowed_by, tags constraint
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
npm test             # QA Advocate unified test suites (40 passing tests)
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
  ✅ [PASS] 6A: extractStoragePath accurately extracts relative path from Supabase public URL
  ✅ [PASS] 6B: extractStoragePath accurately strips signature query tokens from signed URLs
  ✅ [PASS] 6C: extractStoragePath safely returns null on foreign domains or empty inputs
  ✅ [PASS] 6D: Item status strictly validates against 'Available', 'Lent Out', and 'In Laundry'
  ✅ [PASS] 6E: Item borrower reference is strictly cleared to null when status is not 'Lent Out'
  ✅ [PASS] 6F: Tag validation strictly validates against the 7 allowed tag categories
  ✅ [PASS] 6G: Storage deletion path validation prevents cross-user file deletion attacks
==================================================
🎉 All 26 Social Engine, Circle Friends, Items & Storage tests PASSED!
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
   - Run `supabase/migrations/20261017000000_sprint2_item_management.sql`
   - Confirm that the `item_category` enum contains: `Tops`, `Bottoms`, `Dresses`, `Outerwear`, `Shoes`, `Bags`, `Accessories`.
   - Confirm that the `item_status` enum contains: `Available`, `Lent Out`, `In Laundry`.
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
- Delivered in Phase 2 (`feat/phase2-friends-and-circles`) and Milestone 6 (`feat/add-friends-to-circle`).

### Sprint 2: Wardrobe Item Management & Item Detail View — [COMPLETED]
- **Delivered in Sprint 2 (`feat/sprint2-item-management`):**
  - Database schema & constraints (`item_status` ENUM, `borrowed_by`, tags check constraint).
  - Storage deletion cleanup + typed Server Actions (`updateItemStatus`, `updateItemTags`, `deleteItem`).
  - Next.js dynamic SSR route `/items/[id]` and `ItemDetailClient.tsx` with Stitch design tokens.
  - Interactive 7-tag selector, 3-way status toggle, conditional friend borrower selector.
  - Delete modal with cloud storage object purge.
  - Feed integration in MyDrobe & ShareDrobe with `<Link href={'/items/${item.id}'}>` and visual status badges ("Lent to [Friend]" in Dusty Lilac, "In Laundry" in Amber).
  - 40 automated edge-case test validations.

### Sprint 3: Lookbook Builder ("Fav Outfit")
- **Fav Outfit Feature:**
  - Multi-item pairing engine linking a `Top` and `Bottom` (or `Dress` + `Accessories`) into a curated lookbook card matching the Dusty Lilac folder styling in the Stitch mockups.

---

## 9. Multi-Agent Team Governance, Playbooks & Gated Protocol Manual

This section serves as the formal operational manual for any human engineer, autonomous agent, or multi-agent swarm picking up the Share Drobe codebase in a new session. It specifies the personas, playbooks, standard operating procedures, and gated quality protocols that govern all engineering work on this repository.

---

### 9.1 Multi-Agent Core Roster & Personas (`.antigravity/agents/`)

When executing sprints or complex features, the system adopts distinct agent personas defined in `.antigravity/agents/`. Each persona has dedicated responsibilities, boundaries, and handoff criteria:

| Persona | Source File | Core Role & Operational Mandate |
| :--- | :--- | :--- |
| **`ProjectManager`** (The Lead Shipwright) | `01_ProjectManager.md` | **Orchestrator & Gatekeeper:** Deconstructs user requirements into sequential 4-part sprints. Defines scope, enforces the Gated Workflow Protocol, halts execution at each phase gate, coordinates handoffs between personas, and requires explicit user and QA approval before advancing. |
| **`LeadArchitect`** | `02_LeadArchitect.md` | **System Topology & Standards:** Owns the Next.js 16 App Router architecture, Server Component vs. Client Component boundaries, RLS security architecture, and framework boundary rules (e.g., Turbopack `"use server"` export constraints vs. constants separation). |
| **`ProductDesigner`** | `03_ProductDesigner.md` | **Design System & UX Flows:** Enforces Google Stitch design tokens (`Buttercream`, `Chalk`, `French Navy`, `Dusty Lilac`, `Midnight Slate`), mobile-first touch ergonomics, progressive disclosure, and eliminates dead ends or occlusions in navigation. |
| **`FrontendEngineer`** | `04_FrontendEngineer.md` | **Client Implementation:** Authors React 19 Client Components, accessible dialog modals (`aria-modal`), full-bleed responsive cards with `sm:` desktop framing, interactive selectors, dynamic pills, and docked navigation layouts. |
| **`BackendEngineer`** | `05_BackendEngineer.md` | **Data Access & Infrastructure:** Authors PostgreSQL migrations, table schemas, ENUMs, check constraints, `SECURITY DEFINER` anti-recursion functions, Supabase Storage purge routines, and strictly-typed Server Actions. |
| **`QualityAdvocate`** | `08_QualityAdvocate.md` | **Quality Verification & Gatekeeper:** Audits code for edge cases, error boundaries, input validation, and security vulnerabilities. Authors automated regression suites (`scripts/test-*.mjs`). Issues the formal `[QA APPROVED]` stamp required to clear each gate. |
| **`DevopSreSpecialist`** | `07_DevopSreSpecialist.md` | **Environment & Build Integrity:** Manages dev server LAN configuration (`allowedDevOrigins`), CI/pre-PR validation pipelines (`validate-and-pr.sh`), TypeScript compilation, and Turbopack production builds. |

---

### 9.2 Engineering Playbook Enforcement (`.antigravity/playbooks/`)

All agents must strictly follow the standards defined in the project playbooks:

1. **Stack Standardization (`02-preferred-stacks.md`):**
   - **Frontend:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 5.
   - **Styling:** Tailwind CSS v4 using `@theme` tokens in `src/app/globals.css`.
   - **Backend / DB:** Supabase PostgreSQL with `@supabase/ssr` async cookie management and Row-Level Security (RLS).
   - **Storage:** Supabase Storage (`wardrobe` bucket) scoped to `${user.id}/...` user paths.
   - **Transactional Email:** Resend SDK with defensive, non-blocking error boundaries.

2. **Coding Standards (`04-coding-standards.md`):**
   - **Zero `any` Policy:** All props, database payloads, server action responses, and utilities must have explicit TypeScript interfaces.
   - **No Placeholder Code:** Every component and server action must be fully implemented and runnable.
   - **Server Action Segregation:** Under Next.js 16 / Turbopack, files marked with `"use server"` must **strictly export async functions**. Constants, helper types, and synchronous utilities must be extracted into sibling files (e.g., `constants.ts`).
   - **Defensive Error Boundaries:** External I/O (Storage, Resend email, DB queries) must use try/catch blocks that return structured `{ success: boolean, error?: string }` objects rather than throwing unhandled exceptions.

3. **UI / UX Rules (`05-ui-ux-rules.md`):**
   - **Google Stitch Design Language:** Primary canvas in Buttercream (`#FCFBF7`), card surfaces in Chalk (`#F0EFE9`), primary brand in French Navy (`#1D2A44`), secondary accents and badges in Dusty Lilac (`#9683B8`), text in Midnight Slate (`#121926`).
   - **Mobile-First Full-Bleed Containers:** Mobile viewports must extend to screen edges without double-bezel nesting, adapting gracefully to centered `max-w-md sm:rounded-[32px] sm:shadow-2xl` shells on tablet/desktop.
   - **Docked Navigation (No Floating Occlusion):** Bottom navigation (`BottomNav.tsx`) must be docked inside the main container (`sticky bottom-0 w-full sm:rounded-b-[31px]`), ensuring critical CTA buttons (e.g., "Delete Garment", "Add Item") and bottom feed cards remain 100% visible and clickable.
   - **Accessible Form Controls:** All inputs must have associated labels, clear placeholders, loading spinners during transitions, and visible inline error alerts.

4. **Definition of Done (`08-definition-of-done.md`):**
   No task or sprint is complete until:
   - 0 ESLint errors and warnings (`npm run lint`).
   - 0 TypeScript compiler errors (`npm run typecheck`).
   - 100% automated test pass rate across all QA test suites (`npm test`).
   - Successful Next.js 16 Turbopack production build (`npm run build`).
   - Clean, reproducible documentation and clean git history on `main`.

---

### 9.3 The 4-Part Gated Workflow Protocol

The Gated Workflow Protocol is the strict operational procedure governing every sprint. It prevents scope creep, enforces rigorous quality control, and maintains human-in-the-loop governance for database and infrastructure changes.

```
       ┌────────────────────────────────────────────────────────┐
       │   Sprint Kickoff & Task Deconstruction (PM + Team)     │
       └───────────────────────────┬────────────────────────────┘
                                   │
                   ┌───────────────▼───────────────┐
                   │  Part 1: Database Architecture │
                   │  (LeadArchitect + Backend)     │
                   └───────────────┬───────────────┘
                                   │
                     WAITING FOR QA APPROVAL
                                   │
                     [QA APPROVED] by QA_Advocate
                                   │
                     [GATE 1 HALT] PM halts & prompts User:
                     "Run migration SQL in Supabase Dashboard"
                                   │
                   User: "Approved, proceed to Part 2"
                                   │
                   ┌───────────────▼───────────────┐
                   │  Part 2: Data Access & Storage │
                   │  (BackendEngineer)             │
                   └───────────────┬───────────────┘
                                   │
                     WAITING FOR QA APPROVAL
                                   │
                     [QA APPROVED] by QA_Advocate
                                   │
                     [GATE 2 HALT] PM halts for User Review
                                   │
                   User: "Approved, proceed to Part 3"
                                   │
                   ┌───────────────▼───────────────┐
                   │  Part 3: Feature UI & Client   │
                   │  (FrontendEngineer)            │
                   └───────────────┬───────────────┘
                                   │
                     WAITING FOR QA APPROVAL
                                   │
                     [QA APPROVED] by QA_Advocate
                                   │
                     [GATE 3 HALT] PM halts for User UI Review
                                   │
                   User: "Approved, proceed to Part 4"
                                   │
                   ┌───────────────▼───────────────┐
                   │  Part 4: Feed & Nav Integration│
                   │  (FrontendEngineer + DevOps)   │
                   └───────────────┬───────────────┘
                                   │
                     WAITING FOR QA APPROVAL
                                   │
                     [QA APPROVED] by QA_Advocate
                                   │
                     [GATE 4 HALT] PM Final Review,
                     Run 4-Step Validation Suite,
                     Commit & Push to GitHub
```

#### Protocol Rules & Handshake Syntax:
1. **Sequential Execution Only:** Work proceeds strictly through Part 1 → Part 2 → Part 3 → Part 4. Engineers must never jump ahead or bundle parts.
2. **QA Checkpoint (`WAITING FOR QA APPROVAL`):** Upon finishing the code for any part, the `ProjectManager` must announce:
   ```
   WAITING FOR QA APPROVAL
   ```
3. **QA Advocate Review (`[QA APPROVED]`):** The `QA_Advocate` must review the implementation for syntax errors, RLS loopholes, edge cases, error handling, and test coverage. Once satisfied, the `QA_Advocate` issues:
   ```
   [QA APPROVED]
   ```
   Accompanied by an explicit breakdown of verified edge cases.
4. **PM Gate Halt (`[GATE X HALT]`):** Immediately following QA approval, the `ProjectManager` must **HALT execution** and prompt the user. If manual cloud configuration is required (e.g., executing a migration SQL file in the Supabase Dashboard SQL Editor), the PM must provide exact copy-paste SQL and verify instructions:
   ```
   [GATE X HALT]
   User action required: Please execute the migration SQL in your Supabase Dashboard SQL Editor.
   Reply "Approved, proceed to Part X" to continue.
   ```
5. **Strict User Gate Clearance:** The agent team **MUST NOT** proceed to the next part until the user replies with explicit approval (e.g., `"Approved, proceed to Part 2"`).

---

### 9.4 Real-World Case Studies & Architectural Solutions

The following four case studies illustrate how the multi-agent team collaborated across Sprints 1 and 2 to solve complex bugs and architectural challenges:

#### Case Study 1: Plural Postgres ENUM Alignment Bug
- **Issue:** Garment uploads were failing with Postgres error code `22P02` (`invalid input value for enum item_category`).
- **Diagnosis (LeadArchitect + QA_Advocate):** The Postgres ENUM type was created as `item_category` with plural values: `'Tops'`, `'Bottoms'`, `'Dresses'`, `'Outerwear'`, `'Shoes'`, `'Bags'`, `'Accessories'`. The frontend form was submitting singular strings (`Top`, `Bottom`, `Dress`).
- **Resolution (FrontendEngineer):** Standardized `VALID_ENUM_CATEGORIES` in `src/utils/upload-errors.ts` and updated `<AddItemModal />` and category filters to strictly use plural ENUM values while providing descriptive garment labels.
- **Verification (QA_Advocate):** Added automated test scenarios in `scripts/test-upload-edge-cases.mjs` verifying that all 7 plural ENUM values pass and singular values are caught and flagged before database submission.

#### Case Study 2: Next.js 16 Turbopack Server Action Segregation
- **Issue:** After introducing `src/app/items/actions.ts`, Next.js 16 Turbopack crashed with the error:
  `"Only async functions are allowed to be exported in a 'use server' file."`
- **Diagnosis (LeadArchitect):** `actions.ts` had exported non-async constant arrays (`ALLOWED_ITEM_STATUSES`, `ALLOWED_ITEM_TAGS`) and helper functions (`extractStoragePath`, `isValidUuid`). Next.js 16 strictly disallows exporting non-async functions or values from Server Action modules.
- **Resolution (BackendEngineer):** Created `src/app/items/constants.ts` to house all static constants, TypeScript types, and synchronous pure helpers. `actions.ts` now strictly contains async Server Actions.
- **Verification (DevopsSreSpecialist + QA_Advocate):** Ran `npm run build` with Turbopack compiler — compiled cleanly with 0 route compilation errors.

#### Case Study 3: Mobile Bottom Navigation Occlusion Fix
- **Issue:** On the item detail page (`/items/[id]`) and home wardrobe feed (`/`), users reported that the "Delete Garment from Closet" button and bottom wardrobe cards were obscured by the bottom navigation bar.
- **Diagnosis (ProductDesigner + FrontendEngineer):** `BottomNav.tsx` was implemented as a floating overlay capsule using `fixed bottom-3 left-4 right-4 z-40`. On mobile browsers with bottom URL bars, the floating nav covered up interactive buttons and content at the bottom of the scroll container.
- **Resolution (FrontendEngineer):** Converted `BottomNav` into a docked sticky component (`sticky bottom-0 w-full sm:rounded-b-[31px] z-40 bg-buttercream/95 backdrop-blur-md border-t border-border-neutral`). Standardized an inner scroll wrapper (`pb-8 sm:pb-8`) across all main views (`MyDrobeClient`, `ItemDetailClient`, `SharedrobeClient`, `ProfileClient`).
- **Verification (QA_Advocate):** Inspected mobile layout geometry — navigation is now docked cleanly at the bottom of the card with zero occlusion of the Delete button or feed items.

#### Case Study 4: Storage Deletion Security & Ownership Validation
- **Issue:** When deleting an item, deleting only the database record left orphaned image files in the Supabase Storage bucket, consuming storage quota and risking privacy leaks. Additionally, malicious users could attempt to pass a foreign image URL to delete another user's files.
- **Diagnosis (LeadArchitect + BackendEngineer):** Storage deletion must be atomic and verified against the authenticated user ID before any file or database purge occurs.
- **Resolution (BackendEngineer):** Built `deleteItem(itemId, imageUrl)`:
  1. Validates `auth.uid() = owner_id` via Postgres query.
  2. Extracts the relative file path using `extractStoragePath(imageUrl)`.
  3. Strips query tokens from signed URLs to ensure clean object paths.
  4. Enforces path prefix validation: confirms that the path strictly starts with `${user.id}/`, completely preventing cross-user file deletion attacks.
  5. Purges the file from the `wardrobe` storage bucket first, and only then deletes the database row.
- **Verification (QA_Advocate):** Wrote Section 6 tests in `scripts/test-social-actions-edge-cases.mjs` verifying storage path extraction, signed token stripping, foreign domain rejection, and cross-user deletion blocking.

---

## 10. Multi-Agent Session Resumption & Continuity Guide

If a session drops or a fresh Antigravity instance begins, the new agent team can immediately resume work by following this 5-step operational protocol:

### Step 1: Scan Workspace Context & Directives
1. Read `.antigravityrules` in the repository root.
2. Inspect `.antigravity/agents/` to load persona definitions.
3. Review `.antigravity/playbooks/` to review stack standards and definition of done.
4. Read `PROGRESS_REPORT.md` (this file) to verify the current milestone, recent git commits, and open tasks.

### Step 2: Run Baseline Health Check
Before writing any new code, execute the full validation suite to verify that the existing codebase is completely green:
```bash
npm run lint         # Must report 0 errors, 0 warnings
npm run typecheck    # Must report 0 TypeScript errors
npm test             # Must report 40/40 passing tests
npm run build        # Must compile all routes successfully with Turbopack
```

### Step 3: Branch Creation
Create a new feature branch following the established naming convention:
```bash
git checkout -b feat/sprintX-<feature-name>
```

### Step 4: PM Task Deconstruction into 4 Sequential Parts
The `ProjectManager` persona must take the user's feature request and break it down into the standard 4 parts:
- **Part 1: Database Architecture** (Schemas, ENUMs, RLS policies, migrations)
- **Part 2: Data Access & Business Logic** (Server Actions, storage handlers, error mappers)
- **Part 3: Feature UI & Client Interactivity** (SSR pages, client components, Stitch design tokens)
- **Part 4: Feed Integration & Polish** (Links, badges, navigation docking, end-to-end testing)

### Step 5: Execute the Gated Protocol
Follow the exact protocol sequence:
1. Implement Part 1.
2. PM outputs `WAITING FOR QA APPROVAL`.
3. QA_Advocate audits and outputs `[QA APPROVED]`.
4. PM halts execution with `[GATE 1 HALT]` and provides manual Supabase SQL instructions to the user.
5. Wait for the user to reply: `"Approved, proceed to Part 2"`.
6. Repeat for Parts 2, 3, and 4.
7. Upon completion of Part 4, run the full validation suite, update `PROGRESS_REPORT.md`, stage, commit, and push to GitHub.

---

### Key Architectural Guardrails (Do Not Violate)

1. **Category ENUMs Are Plural:** Never use singular category strings (`Top`, `Bottom`, `Dress`). The Postgres ENUM `item_category` strictly expects: `'Tops'`, `'Bottoms'`, `'Dresses'`, `'Outerwear'`, `'Shoes'`, `'Bags'`, `'Accessories'`.
2. **Singleton Browser Client:** Never call `createBrowserClient` directly inside React components. Always import `createClient` from `@/utils/supabase/client` to use the shared singleton, preventing mobile `navigator.locks` token deadlocks.
3. **SSR Data Prefetching:** Always prefetch initial data in Server Components (`page.tsx`) using `@/utils/supabase/server` with async `cookies()`. Pass preloaded items down to client components as initial props to ensure instant page load without spinners.
4. **Server Actions File Purity:** Files with `"use server"` must export **only async functions**. Extract all constants, types, and synchronous helpers into separate non-server files (e.g., `constants.ts`).
5. **Docked Navigation:** Never create a floating overlay bottom nav on mobile screens. Dock `BottomNav` inside the main container (`sticky bottom-0`) with bottom padding on the content wrapper to prevent covering CTAs.
6. **Mandatory Edge Case Testing:** Every backend action or UI validation must have corresponding unit/integration edge-case tests in `scripts/test-*.mjs` integrated into `npm test`.


