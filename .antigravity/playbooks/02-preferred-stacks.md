# 02-preferred-stacks.md

## Objective
Standardize framework and infrastructure choices across the multi-agent system to minimize decision fatigue, maximize cross-agent compatibility, and enforce modern development patterns[cite: 27].

## Core Tool Selection Rules
*   Recommend the simplest stack that fits the product well[cite: 27]. Do not overengineer early MVPs[cite: 27].
*   If a more scalable architecture is needed, explain why[cite: 27].
*   Prefer proven, maintainable technologies over trendy choices[cite: 27].
*   Choose tools based on project fit, speed, cost, and maintainability[cite: 27].

## Default Web App Stack
*   **Frontend Framework:** Next.js[cite: 27].
*   **Language:** TypeScript[cite: 27].
*   **Styling:** Tailwind CSS[cite: 27].
*   **Backend:** Next.js API routes or a separate backend if needed[cite: 27].
*   **Database:** PostgreSQL[cite: 27].
*   **Auth & Backend Platform:** Supabase (Auth and Platform) or Clerk (Auth)[cite: 27].
*   **Hosting:** Vercel[cite: 27].
*   **Reasoning:** Fast MVP development, modern tooling, scalable enough for many products[cite: 27].

## Default Mobile App Stack
*   **Framework:** React Native with Expo[cite: 27].
*   **Language:** TypeScript[cite: 27].
*   **Backend & Auth:** Supabase or Firebase depending on app needs[cite: 27].
*   **Database:** PostgreSQL if using Supabase[cite: 27].
*   **Reasoning:** Fast iteration, shared JavaScript/TypeScript skills, easier deployment workflow[cite: 27].

## Default Landing Page / Website Stack
*   **Framework:** Next.js or static HTML/CSS/JS if simple[cite: 27].
*   **Styling:** Tailwind CSS[cite: 27].
*   **Hosting:** Vercel or Netlify[cite: 27].
*   **Priorities:** SEO, speed, responsiveness, clean UI[cite: 27].

## Default Backend / API Stack
*   **Preferred Option 1:** FastAPI for clean Python backends[cite: 27].
*   **Preferred Option 2:** Node.js with Express or NestJS for JavaScript/TypeScript ecosystems[cite: 27].
*   **Database:** PostgreSQL[cite: 27].
*   **Cache:** Redis if needed[cite: 27].
*   **API Style:** REST by default; GraphQL only if clearly justified[cite: 27].

## Database Hierarchy
*   **Primary Choice:** PostgreSQL[cite: 27].
*   **Prototyping:** SQLite is acceptable for quick prototypes[cite: 27].
*   **Document Storage:** Use MongoDB only if the data model truly fits document storage[cite: 27].
*   **Caching/Queues:** Use Redis for caching, queues, rate limiting, or session-like needs[cite: 27].

## Deployment Targets
*   **Frontend:** Vercel or Netlify[cite: 27].
*   **Full-Stack Apps:** Vercel + Supabase, or Render/Railway if needed[cite: 27].
*   **Backends:** Render, Railway, Fly.io, or AWS depending on complexity[cite: 27].
*   **Storage:** Supabase Storage, Cloudinary, or S3[cite: 27].
*   **CI/CD:** GitHub + GitHub Actions[cite: 27].