# NerdVerse India

Custom collectibles storefront backed by Supabase.

## Deployment model

- **Frontend:** GitHub Pages from `main`
- **Database/Auth/Edge Functions:** Supabase
- **Payments:** Razorpay (server-side Edge Functions)
- **Transactional email:** Resend

## Supabase source of truth

Database changes must live in `supabase/migrations/`. Do not add new production-only
schema changes to `supabase/schema.sql`; that file is retained as a readable baseline/seed
reference.

The Supabase GitHub integration is configured with working directory `.` and production
branch `main`. Merges to `main` therefore deploy versioned migrations and Edge Functions.

## Secrets

Never commit Supabase secret/service-role keys, Razorpay secrets, webhook secrets, or
Resend API keys. Browser code may contain only the project URL and Supabase publishable key.

See `SETUP_COMMERCE.md` for the remaining account-level configuration.
