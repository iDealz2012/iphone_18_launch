# hello18 Check-in

Invitation cards with a personal QR for each guest, and a door scanner that checks guests in, for the iDealz iPhone 18 launch, 23 October, 2:30 PM.

Separate from the attendance app: its own Vercel project, login and database.

## Pages

| Page | Who | What it does |
|---|---|---|
| `/admin` | Admin password | Set the venue once (shown on every card), add guests one at a time or paste many, open or download each card, download all cards as a ZIP, export attendance |
| `/scan` | Staff or admin password | Camera scanner with a live count, search by name for guests without a card, walk-ins |
| `/c/<code>` | Whoever scans a card | Staff who are logged in: checks the guest in. Anyone else: a welcome message, and nothing changes |

Each card's QR holds a random 11-character code, so cards can't be guessed or faked. Only the first scan counts. A second scan shows "Already checked in at …".

## Deploy (about 10 minutes)

1. **Put the folder on GitHub.** Create a new repository and upload this folder's contents. Leave out `node_modules` and `.next`.
2. **Import it into Vercel.** Go to vercel.com → Add New → Project → choose the repository → Deploy. Vercel detects Next.js automatically.
3. **Add the database.** In the project's **Storage** tab → Create / Connect → **Upstash for Redis** (free plan) → connect it to the project. This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` settings for you.
4. **Add the passwords.** Go to Settings → Environment Variables and add:
   - `ADMIN_PASSWORD`: for you
   - `STAFF_PASSWORD`: for door staff
   - `SESSION_SECRET`: any long random string, at least 16 characters
5. **Redeploy.** Go to Deployments → ⋯ → Redeploy, so the new settings take effect.
6. **Choose the final address before making any cards.** For example, rename the project to `idealz-hello18` to get `idealz-hello18.vercel.app`, or add a custom domain. The QR on each card points to the address the card was downloaded from. If the address changes later, cards already sent will stop working.

## Using it

1. Log in at `/login` with the admin password. Save the venue.
2. Type a guest's name → **Create card** → **Download card**. For many guests, use **Paste many names** (one per line, `Name, phone`), then **Download all cards (ZIP)**.
3. On the day, each door phone opens `/scan` and logs in with the staff password. Allow the camera when the browser asks.
4. Afterwards, use **Export attendance** to get a CSV with arrival times.

**Test before the event:** create a card for yourself, scan it on a door phone, and check the count goes up. Then use **Undo** or **Remove** on that test guest.

## Local testing

```
npm install
ADMIN_PASSWORD=a STAFF_PASSWORD=b SESSION_SECRET=0123456789abcdef npm run dev
```

With no Redis settings, it runs in test mode and keeps guests in memory.

## Changing the card design

`public/card-template.png` is the card background, 1200 × 1500, with the name and venue areas left blank. Positions are set in `lib/card.js`: name at x 100, baseline 1252; venue at baseline 1364; QR tile at x 870, y 1140, 230 px.
