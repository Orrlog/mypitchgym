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

- Site URL: `https://YOUR-PREVIEW-DOMAIN.vercel.app`
- Redirect URL: `https://YOUR-PREVIEW-DOMAIN.vercel.app/login.html`
- Redirect URL: `https://YOUR-PREVIEW-DOMAIN.vercel.app/dashboard.html`
- Redirect URL: `https://YOUR-PREVIEW-DOMAIN.vercel.app/reset-password.html`

Each Redirect URL must be the full URL. Include `https://`, the complete Vercel preview domain, and the page path.

Password reset must allow this full page URL:

- `https://YOUR-PREVIEW-DOMAIN.vercel.app/reset-password.html`

Email confirmation should redirect to an appropriate full preview URL, usually:

- `https://YOUR-PREVIEW-DOMAIN.vercel.app/dashboard.html`

or:

- `https://YOUR-PREVIEW-DOMAIN.vercel.app/login.html`

Use the full preview URL in Supabase, not just the path.

A carefully limited Vercel preview wildcard can sometimes be used, but exact preview URLs are preferred for this first test. Do not use a wildcard unless you know the correct Vercel account or team slug.

If confirmation emails confirm the account but land on the preview sales page instead of `dashboard.html`, inspect the Supabase confirmation email template next. The confirmation button or link should use Supabase's confirmation-link variable, `{{ .ConfirmationURL }}`, not a plain Site URL. In the Supabase dashboard, check Authentication > Email Templates > Confirm signup and make sure the link in that template uses `{{ .ConfirmationURL }}`.

## Important limits in this phase

This branch only adds a basic authentication foundation. The existing practice app remains available at `app.html`, and the existing localStorage paywall is not replaced.

The new `dashboard.html` page has a frontend login check only. It does not yet provide server-side subscription enforcement.

Do not add Production Supabase or Vercel auth settings until preview testing is complete and Jonnie approves merging this branch.

## Production rollout later

Before merging this account foundation to production, Jonnie will need to:

1. Add the production website URL to Supabase URL Configuration.
2. Add full production redirect URLs for:
   - `/login.html`
   - `/dashboard.html`
   - `/reset-password.html`
3. Add these Vercel environment variables to the Production environment:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
4. Create a new production deployment after the variables are added.
5. Test signup, confirmation, login, logout, and password reset on production.
6. Keep Supabase secret and service-role keys out of browser code.
7. Configure branded custom SMTP before a public launch or meaningful customer traffic.
