# Custozo by Remorphic

A CRM for small businesses such as clinics, salons, gyms and pickleball courts. It tracks customers, visits, leads, appointments and orders, takes online bookings, and sends WhatsApp reminders.

Live at https://remorphic-crm.vercel.app. Pickleball courts are also listed on www.indorepickleball.com (repository `remorphic-website`), which links to this app's booking pages.

## How it fits together

| Part | Where |
|---|---|
| Code | This repository, branch `main` |
| Hosting | Vercel project `remorphic-crm`, deploys `main` to production automatically |
| Database, sign-in and file storage | Supabase |
| WhatsApp messages | Twilio |

Built with Next.js 16 (App Router, `proxy.ts` for auth), React 19, Tailwind CSS 4, shadcn/ui and Supabase.

## Deploying

**Only merge to `main` to go live.** Vercel builds and deploys every push to `main`.

- Work on a branch and open a pull request.
- Don't run `vercel --prod` from a computer. It replaces the live site with whatever is on that computer, and GitHub never sees it.
- Before merging, check that production is still running what `main` contains (Vercel → Deployments → the one marked Production → its commit).
- To test a branch against the real database without putting it live, run `vercel deploy --prod --skip-domain` from a checkout of it. Branch previews have no environment variables, so they cannot talk to Supabase.
- To undo a bad release, use Vercel → Deployments → the previous production deployment → **Promote** (or Instant Rollback).

## Running locally

Requires Node.js 20.9 or later.

```bash
npm ci
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000. A local copy uses whichever Supabase project and Twilio account `.env.local` points to, so pointing it at production means real data and real WhatsApp messages.

Checks before opening a pull request:

```bash
npx tsc --noEmit
npx eslint
npm run build
```

## Settings

See [`.env.example`](.env.example) for the full list. In production they are set in Vercel for the **Production** environment only.

| Name | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server access to Supabase, limited by row-level security |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only work: public booking, staff invites, admin pages, file storage |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | Sending WhatsApp messages |
| `NEXT_PUBLIC_APP_URL` | The address in staff invite emails |

Keep a copy of the real values in a password manager as well.

## Database

SQL files in [`supabase/`](supabase) are run by hand in the Supabase SQL Editor. All are safe to run more than once unless noted. For a new project, run them in this order:

1. `schema.sql`
2. `staff_migration.sql`
3. `business_users_migration.sql` (replaces the staff table)
4. `appointments_migration.sql`
5. `customer_fields_migration.sql`
6. `inactive_threshold_migration.sql`
7. `leads_migration.sql`
8. `online_booking_migration.sql`
9. `business_types_migration.sql`
10. `security_hardening_migration.sql`
11. `member_removal_migration.sql`
12. `live_features_migration.sql`
13. `public_listing_migration.sql`
14. `booking_without_code_migration.sql`
15. `orders_migration.sql`

When code needs a database change, add a new file and note here where it goes in the order. Run it in Supabase **before** merging the code that depends on it.

Rules to keep:

- **Editable business columns:** members may update every `businesses` column except `id`, `user_id` and `created_at`. After adding a column, run `member_removal_migration.sql` again, or the new field will fail to save with "permission denied".
- **Public website access:** the public (anon) key may read only the `businesses` columns the IndorePickleball site shows. If that site starts showing another column, add it in `public_listing_migration.sql` and run it again.
- **Business membership:** `business_users` must never get an insert policy. One would let any signed-in user join any business. New businesses are created through the `create_business` function.
- **Server-only booking tables:** `booking_otps`, `booking_requests` and the booking functions are for the service role only.
- **Orders are written only through functions:** members can read `orders` and `order_items`, but every change goes through `create_order`, `update_order`, `set_order_status` and `set_order_payment`, which keep order numbers, totals and stock in step. Stock is taken when an order is confirmed and returned when it is cancelled. Money is stored in paise.
- **Features:** `businesses.leads_enabled`, `appointments_enabled`, `visits_enabled` and `orders_enabled` switch parts of the app on and off (Settings → Features). Orders start off.
- **Customers without a phone:** online bookings may leave the phone blank, stored as `''`. `sendWhatsApp` skips those, so code that messages customers must keep going through it.

### Not yet in this repository

The live database also has the following, which were created directly in Supabase. A new project built from these files alone would lack them:

- tables `admins` (platform admins, server access only) and `business_gallery`
- `businesses` columns `address`, `maps_url`, `photo`, `price_per_slot` and `payment_qr`, and `customers.nudge_sent_at`
- storage buckets `business-photos` (public) and `payment-screenshots` (private), with their policies
- the `public_pickleball_read` policy on `businesses`

To capture them, export the schema with the Supabase CLI (`supabase db dump --schema public`) and add it here.
