# MyPitchGym — Deployment Guide

## What's Built (all files at C:\Users\Jonni\Desktop\mypitchgym\)

```
mypitchgym/
├── index.html              ← Landing page
├── app.html                ← App UI (form, call screen, coaching, paywall)
├── app.js                  ← Frontend logic (voice, calls, coaching, paywall)
├── styles.css              ← All styling
├── package.json            ← Dependencies (openai, stripe)
├── vercel.json             ← Vercel config (routing, serverless functions)
└── api/
    ├── generate-script.js       ← Brain 1: Custom script generator
    ├── improve-script.js        ← Brain 1b: Script improver
    ├── roleplay.js              ← Brain 2: Prospect roleplay + role reversal
    ├── coach.js                 ← Brain 3: Post-call coaching
    ├── create-checkout-session.js ← Stripe checkout
    └── stripe-webhook.js        ← Stripe webhook handler
```

---

## STEP 1: Upload to GitHub (5 min)

1. Go to github.com and sign in (create account if needed)
2. Click the "+" icon → "New repository"
3. Name it: `mypitchgym`
4. Set to "Public"
5. Click "Create repository"
6. On your computer, open File Explorer to `C:\Users\Jonni\Desktop\mypitchgym`
7. Drag ALL files and the `api` folder into the GitHub upload area
8. Click "Commit changes"

## STEP 2: Deploy to Vercel (5 min)

1. Go to vercel.com and sign in
2. Click "Add New" → "Project"
3. Find `mypitchgym` in your GitHub repos → click "Import"
4. DO NOT change any settings — leave everything default
5. Click "Deploy"
6. Wait 1-2 minutes — Vercel will build and deploy
7. You now have a live URL like `mypitchgym-xxx.vercel.app`

## STEP 3: Add Environment Variables (3 min)

1. In your Vercel project, go to "Settings" → "Environment Variables"
2. Add these THREE variables:

   **Name:** `OPENAI_API_KEY`
   **Value:** (paste your OpenAI API key)
   **Environments:** check all (Production, Preview, Development)

   **Name:** `STRIPE_SECRET_KEY`
   **Value:** (you'll get this in Step 4)
   **Environments:** check all

   **Name:** `STRIPE_PRICE_ID`
   **Value:** (you'll get this in Step 4)
   **Environments:** check all

3. Add the OpenAI key now. Stripe keys come in Step 4.
4. Click "Save"
5. Go to "Deployments" → click the 3 dots on latest → "Redeploy"

## STEP 4: Set Up Stripe (10 min)

1. Go to dashboard.stripe.com → sign in or create account
2. Make sure you're in "Test mode" (toggle in top right)

### Create the subscription product:
3. Go to "Products" → "Add product"
4. Name: `MyPitchGym Subscription`
5. Description: `Unlimited AI sales roleplay practice`
6. Pricing: **Recurring** → $29.00 USD → Monthly
7. Click "Save product"
8. Click on the product you just created
9. Find the "Price ID" (starts with `price_`) → copy it

### Get your API keys:
10. Go to "Developers" → "API keys"
11. Copy the "Secret key" (starts with `sk_test_`)
12. Go back to Vercel → Settings → Environment Variables
13. Add:
    - `STRIPE_SECRET_KEY` = your secret key
    - `STRIPE_PRICE_ID` = your price ID (price_xxx)
14. Redeploy on Vercel

### Set up webhook (optional for v1, recommended):
15. Go to "Developers" → "Webhooks" → "Add endpoint"
16. URL: `https://your-vercel-url.vercel.app/api/stripe-webhook`
17. Events: `checkout.session.completed`, `customer.subscription.deleted`
18. Copy the "Signing secret" → add as `STRIPE_WEBHOOK_SECRET` in Vercel
19. Redeploy

## STEP 5: Connect Your Domain (5 min)

1. In Vercel project → "Settings" → "Domains"
2. Type: `mypitchgym.com` → click "Add"
3. Vercel shows you DNS instructions — it'll say something like:
   - Go to Namecheap → Domain List → Manage DNS
   - Add an A record pointing to: `76.76.21.21`
   - Or change nameservers to Vercel's
4. Go to Namecheap → sign in → Domain List → Manage → DNS
5. Follow Vercel's instructions exactly
6. Wait 10-30 minutes for DNS to propagate
7. Vercel will show a green checkmark when the domain is live

## STEP 6: Test Everything (5 min)

Open `mypitchgym.com` on your phone (Chrome browser):

1. ✅ Landing page loads
2. ✅ Click "Try It Free" → app opens
3. ✅ Fill out the form (product: "I sell car insurance", benefits: "saves money", objections: "too expensive")
4. ✅ Pick a sales style + customer type
5. ✅ Click "Generate My Script" → a real script appears
6. ✅ Click "Start Practice Call" → call screen opens
7. ✅ Tap "Start Speaking" → speak your opener → AI responds out loud
8. ✅ Have a 2-3 exchange conversation
9. ✅ Click "End Call" → coaching report appears with score
10. ✅ Click "Watch AI Do It" → role reversal mode works

If all 10 pass, you're LIVE and ready for customers.

---

## TROUBLESHOOTING

**"Failed to generate script" error:**
- Check OPENAI_API_KEY is set in Vercel env vars
- Check you have credits in your OpenAI account
- Redeploy after adding env vars

**Voice doesn't work:**
- Must use Chrome browser (not Safari)
- Allow microphone access when prompted
- Check phone isn't on silent

**Stripe checkout doesn't open:**
- Check STRIPE_SECRET_KEY and STRIPE_PRICE_ID are set
- Make sure the price ID starts with `price_`
- Make sure you're using the secret key (sk_), not publishable key

**Domain not loading:**
- DNS can take up to 48 hours (usually 10-30 min)
- Check Namecheap DNS matches Vercel's instructions
- Try the .vercel.app URL in the meantime

---

## WHAT TO DO IF YOU GET STUCK

Message me. Paste the error message and I'll tell you exactly what to fix.
