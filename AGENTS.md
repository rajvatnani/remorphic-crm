<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project rules

- Production deploys from GitHub `main` only. Never run `vercel --prod` from a machine; test with `vercel deploy --prod --skip-domain` instead.
- Before merging, confirm production is running what `main` contains. It once ran code that was never pushed.
- Database changes are SQL files in `supabase/`, run by hand in Supabase before the code that needs them. Keep the run order and the rules in `README.md` up to date.
- The repository is public: never commit keys or `.env.local`.
