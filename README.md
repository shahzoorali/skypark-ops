# Skypark Ops

Daily closing, expense tracking, and attendance/payroll web app for the
Skypark outlet. Static single-page app (plain HTML/CSS/JS, no build tooling).
Data persists per-browser in `localStorage`; seeded with July 2026 data.

## Local preview

Any static file server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy on AWS Amplify

1. In the Amplify console, connect this GitHub repo (`skypark-ops`, `main` branch).
2. Amplify auto-detects [`amplify.yml`](amplify.yml). There is no build step —
   it copies the app files into `dist/` and publishes that folder.
3. Deploy. No environment variables or backend are required.

## Files

- `index.html` — app shell and layout
- `styles.css` — styling
- `app.js` — all app logic (state, rendering, month navigation)
- `seed.js` — July 2026 seed data extracted from the source spreadsheet
