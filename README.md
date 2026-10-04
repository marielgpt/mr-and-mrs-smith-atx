# Smith Vargas Wedding — run of show

A single-page, mobile-first coordination tool for the wedding on **Saturday, October 17, 2026**.
Three audiences share one URL: the coordinator (John Winn) working the run-of-show, the couple
checking what's next, and vendors reading only their own cue sheet.

The timeline is live: when an event runs late the coordinator pushes it and **every downstream
time recomputes**. State is shared across all devices through Supabase, with a localStorage cache
so a dead signal never blanks the screen.

## How it's built

Static site, no build step:

- `index.html` — loads React + [htm](https://github.com/developit/htm) + supabase-js from CDNs
- `app.js` — the whole app (data, slip model, all views, Supabase sync)
- `config.js` — Supabase URL/key + editable props (title, venue, access code, wedding date)
- `styles.css` — the *Organic* design system (tokens + component classes)
- `ref/*.png` — reference imagery for the setup "What it should look like" cards
- `schema.sql` — the Supabase table + RLS + realtime setup

## Supabase setup (one time)

1. In your project (`gdawfbmveoxmbkbqfwgr`) open **SQL Editor** and run [`schema.sql`](schema.sql).
2. That creates `wedding_state`, seeds the single `main` row, enables Row Level Security
   (anyone with the anon key can read/update only that one row), and adds the table to realtime.
3. The publishable/anon key in `config.js` is **meant to be public** in a static site — RLS is
   what protects the data.

## Access

- Day-of code: set via `accessCode` in `config.js`. A device stays unlocked for 24 hours.
- Vendor solo links: `?vendor=dre|jp|jorge&solo=1` opens straight to one vendor's sheet with all
  navigation hidden. The "Copy … link" button on each vendor card builds these.

## Guest photos

`/photos/` is a public page for the whole weekend: guests upload photos + videos and browse the
live gallery, grouped by the day each was taken (EXIF / video metadata, falling back to upload
time): Oct 15 BBQ, Oct 16 Lakeside Fiesta, Oct 17 wedding. Photos are resized in the browser; videos upload
as-is at any size (resumable uploads for anything over 6 MB); admin view shows storage used. Files go to the public `guest-photos` Supabase bucket, listed via the
`guest_photos` table — both set up by the second block of `schema.sql`.

- **Code:** `photosCode` in `config.js` (1017); a device stays unlocked for 72 hours.
- **Sign:** `/photos/sign.html` is a printable letter-size QR sign; `photos/qr.png` (1200px) and
  `photos/qr.svg` are the bare code for Canva or a print shop.
- **Deleting:** a guest can delete their own uploads from the same phone. `/photos/?admin` unlocks
  deleting anything with the admin code, which is set in the Supabase SQL editor (never in this
  public repo): `update public.guest_photo_admin set code = '…';`

## Local preview

```sh
cd mr-and-mrs-smith-atx
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (GitHub Pages)

Pushed to `main`; served from GitHub Pages. To test a slipped clock without waiting for the day,
set `simulatedTime` (e.g. `"16:20"`) in `config.js`, or use the in-app **Preview a time** slider.
