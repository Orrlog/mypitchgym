# Supabase Auth Setup

This branch adds the first MyPitchGym account foundation. It does not add billing, subscription enforcement, saved sessions, saved transcripts, or the final member dashboard.

## Vercel settings Jonnie must add

Add these two environment variables in Vercel:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Use the real values from the Supabase project dashboard, but do not paste those real values into Codex chat, GitHub, documentation, screenshots, or any file in this repository.

For this branch, add the variables to the Vercel Preview environment first. Do not add them to Production until preview testing succeeds and Jonnie approves the merge.

## Supabase Auth settings

In Supabase, enable email and password authentication.

Configure the Site URL and Redirect URLs for the Vercel Preview deployment used to test this branch. Use the actual preview address Vercel creates, for example:

- Site URL: `https://YOUR-VERCEL-PREVIEW-URL`
- Redirect URL: `https://YOUR-VERCEL-PREVIEW-URL/login.html`
- Redirect URL: `https://YOUR-VERCEL-PREVIEW-URL/dashboard.html`
- Redirect URL: `https://YOUR-VERCEL-PREVIEW-URL/reset-password.html`

Password reset must allow this page:

- `/reset-password.html`

Email confirmation should redirect to an appropriate preview page, usually:

- `/dashboard.html`

or:

- `/login.html`

Use the full preview URL in Supabase, not just the path.

## Important limits in this phase

This branch only adds a basic authentication foundation. The existing practice app remains available at `app.html`, and the existing localStorage paywall is not replaced.

The new `dashboard.html` page has a frontend login check only. It does not yet provide server-side subscription enforcement.

Do not add Production Supabase or Vercel auth settings until preview testing is complete and Jonnie approves merging this branch.
