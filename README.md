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

- Day-of code: **1017** (change `accessCode` in `config.js`). A device stays unlocked for 24 hours.
- Vendor solo links: `?vendor=dre|jp|jorge&solo=1` opens straight to one vendor's sheet with all
  navigation hidden. The "Copy … link" button on each vendor card builds these.

## Local preview

```sh
cd mr-and-mrs-smith-atx
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (GitHub Pages)

Pushed to `main`; served from GitHub Pages. To test a slipped clock without waiting for the day,
set `simulatedTime` (e.g. `"16:20"`) in `config.js`, or use the in-app **Preview a time** slider.
