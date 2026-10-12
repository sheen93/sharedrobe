# Product Requirements Document (PRD) & Product Brief

**Product Name:** Share Drobe  
**Phase / Milestone:** MVP v1 (Database Architecture Edition)  
**Document Status:** Approved Baseline  
**Document Author:** Stitch Design System & Product Spec  
**Target Release:** Q2 2025  

---

## 1. Executive Summary & Vision

### 1.1 Vision Statement
**Share Drobe** is a lightweight, circular fashion platform designed to eliminate apparel waste and foster social wardrobe sharing. Instead of complicated social feeds, **MVP v1** focuses on utility-first personal inventory management and friction-free circle-based closet sharing structured like an organized personal database.

### 1.2 Core Problem Statement
- **Underutilized Clothing:** The average consumer wears only 20–30% of their closet regularly.
- **Lending Friction:** Borrowing clothes from close friends, roommates, or local fashion circles is awkward and untracked (forgotten loans, damaged items, unclear availability).
- **Complexity Bloat:** Existing fashion platforms are cluttered with social media bloat, heavy marketplace transactions, and algorithms rather than solving basic inventory and friend-group lending logistics.

### 1.3 MVP v1 Objective
Deliver a rock-solid, minimalist database interface allowing users to:
1. Catalog their clothes into 5 essential categories with rapid photographic capture.
2. Form sharing circles ("ShareDrobes") with friends to browse each other’s closets.
3. Manage a clean 3-field user account with zero clutter.

---

## 2. Design System & Brand Identity

The visual language is anchored in the **"Parisian Navy & Dusty Lilac"** palette: clean, elevated, editorial, and functional.

### 2.1 Color Tokens
| Token Name | Hex Code | Usage |
| :--- | :--- | :--- |
| **Buttercream Ivory** | `#FCFBF7` | Primary canvas & screen background |
| **Chalk Alabaster** | `#F0EFE9` | Card surfaces, folder rows, input fields |
| **French Navy** | `#1D2A44` | Primary brand accent, primary buttons, bottom navigation container |
| **Dusty Lilac** | `#9683B8` | Secondary accent, active highlights, action popups, special badges |
| **Midnight Slate** | `#121926` | Primary high-contrast typography and headers |
| **Cool Slate / Muted** | `#64748B` | Secondary labels, directory metadata, monospaced counters |
| **Border Neutral** | `#E5E2D6` | Subtle dividers, card borders, form outlines |

### 2.2 Typography & Tone
- **Headings:** Sans-serif, geometric or humanist (Inter / Plus Jakarta Sans), weights 600–700.
- **Body & Metadata:** Crisp sans-serif with subtle uppercase monospaced tags (`DIRECTORY // MY_DROBE`, `CIRCULATION // SHARED`).
- **Corner Radii:** `rounded-2xl` (16px) for cards, `rounded-xl` (12px) for buttons/folders, `rounded-full` for badges.
- **Elevation:** Flat, ultra-soft shadows (`shadow-sm` / ambient light only).

---

## 3. Information Architecture & Navigation

The MVP app utilizes a fixed 3-tab bottom navigation bar present across all screens:
1. **MyDrobe** (`Hanger` icon) — The user's personal closet database.
2. **ShareDrobe** (`Users` icon) — Community group directories & sharing circles.
3. **Profile** (`UserCircle` icon) — Minimal account credentials management.

---

## 4. Feature Specifications by Screen

### Screen 1: MyDrobe (Personal Closet Database)
*Purpose: Serve as the single source of truth for the user's personal wardrobe items.*

- **Header:**
  - Screen title: `MyDrobe` with breadcrumb metadata (`DIRECTORY // MY_DROBE`).
  - Total inventory indicator (e.g., `5 Categorized Folders · 38 Items Total`).
  - Primary Action Button: Top-right `+` button in French Navy (`#1D2A44`) to launch camera/photo uploader for adding items.
- **Body — 5 Category Folders:**
  - Folders structured as tappable list cards with folder icon, title, subtitle description, and item count badge:
    1. **Top** (e.g., shirts, blouses, knitwear, tees).
    2. **Bottom** (e.g., jeans, trousers, skirts, shorts).
    3. **Dress** (e.g., midi, maxi, cocktail, jumpsuits).
    4. **Accessories** (e.g., bags, scarves, belts, jewelry).
    5. **Fav Outfit** (curated lookbook combinations, highlighted with a Dusty Lilac tint).
- **Interactions:**
  - Tapping `+` opens quick camera snapshot / photo picker with item tags (Color, Size, Brand).
  - Tapping a folder navigates to the item sub-grid.

---

### Screen 2: ShareDrobe (The Community Sharing Hub)
*Purpose: Organize and grant access to shared closet directories among friends and circles.*

- **Header:**
  - Title: `ShareDrobe` with metadata (`CIRCULATION // SHARED`).
  - Primary Action Button: Top-right `+` button in Dusty Lilac (`#9683B8`).
  - **Quick Actions Modal / Popup:**
    - Triggered upon tapping `+`:
      - **Add Friend** (`user-plus` icon): Search friend handle or contacts to start a 1:1 wardrobe share.
      - **Add Group** (`users` icon): Create a new shared circle (e.g., "Roommates", "Trip to Paris").
- **Body — Community Wardrobe Folders:**
  - List of active friend circles structured as directory folders:
    - Circle Name (e.g., *College Roommates*, *Weekend Gala Circle*, *Brooklyn Fashion Swap*, *Work Besties Collective*).
    - Subtext indicating member count (e.g., `4 Members • Emma, Maya & You`).
    - Tag / badge indicating total borrowable items in that circle (e.g., `18 items`, `41 items`).
- **Interactions:**
  - Tapping a circle opens the shared circle closet view showing all borrowable garments with direct "Borrow / Request" availability.

---

### Screen 3: Profile (Minimal Account Management)
*Purpose: Ultra-clean, low-friction user credential and identity record.*

- **Header:**
  - Title: `Profile` with metadata (`USER // ACCOUNT`).
  - Verified user security badge.
- **Body — Strictly 3 MVP Fields:**
  1. **Name:** Full user display name (e.g., `Sophia Chen`), with helper caption: *"Displayed to circle friends in shared wardrobes."*
  2. **Email:** Verified user email address (e.g., `sophia.chen@example.com`), with helper caption: *"Used for authentication and share requests."*
  3. **Password:** Masked password field (`••••••••••••••••`) with last updated timestamp.
- **Actions:**
  - Primary CTA: **"Update Credentials"** button styled in French Navy (`#1D2A44`).

---

## 5. Technical Requirements & Architecture

### 5.1 Tech Stack
- **Frontend Framework:** Next.js 14+ (App Router), React 18+
- **Styling:** Tailwind CSS with custom design tokens (`tailwind.config.js`)
- **Icons:** Lucide React (`Shirt` / `Hanger`, `Users`, `UserCircle`, `Folder`, `Plus`, `ChevronRight`, `Mail`, `Lock`, `User`)
- **Backend / Database (Recommended for MVP):** Supabase / PostgreSQL (ideal for folder/relation hierarchies, user auth, and row-level security for private circles).
- **Object Storage:** Cloud storage bucket (S3 / Cloudflare R2 / Supabase Storage) for image compression and delivery.

### 5.2 Data Schema (MVP Entities)
1. **`users`**
   - `id` (UUID, PK)
   - `name` (TEXT)
   - `email` (TEXT, UNIQUE)
   - `password_hash` (TEXT)
   - `avatar_url` (TEXT, optional)
   - `created_at` (TIMESTAMP)

2. **`items`**
   - `id` (UUID, PK)
   - `owner_id` (UUID, FK -> users.id)
   - `folder_category` (ENUM: `top`, `bottom`, `dress`, `accessories`, `fav_outfit`)
   - `name` (TEXT)
   - `image_url` (TEXT)
   - `is_sharable` (BOOLEAN, default: true)
   - `created_at` (TIMESTAMP)

3. **`groups` / `circles`**
   - `id` (UUID, PK)
   - `name` (TEXT)
   - `creator_id` (UUID, FK -> users.id)
   - `created_at` (TIMESTAMP)

4. **`group_members`**
   - `group_id` (UUID, FK -> groups.id)
   - `user_id` (UUID, FK -> users.id)
   - `role` (ENUM: `admin`, `member`)

---

## 6. Success Metrics & Post-MVP Roadmap

### 6.1 MVP Key Performance Indicators (KPIs)
- **Activation Rate:** % of new users who upload at least 5 clothing items within 48 hours.
- **Circle Formation:** Average number of shared circles joined per active user (target: ≥ 1.5 circles).
- **Lend / Borrow Initiation:** Ratio of view-to-request actions inside shared circles.

### 6.2 Roadmap (v1.1 - v2.0)
- **v1.1:** Status tags on items (`Available`, `Lent Out`, `In Laundry`) and in-app borrow request notifications.
- **v1.2:** Multi-item "Fav Outfit" builder linking specific tops and bottoms together.
- **v2.0:** Sustainability & carbon offset tracker calculating emissions saved per borrowed garment.
