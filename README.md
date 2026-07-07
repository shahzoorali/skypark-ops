# Skypark Ops

Daily closing, expense tracking, and attendance/payroll web app for the
Skypark outlet. Vite + vanilla JS frontend on an AWS Amplify Gen 2 backend:

- **Cognito** — email sign-in; `admin` and `manager` groups (managers don't
  see the Admin tab and can't modify staff/rates/categories — enforced
  server-side, not just hidden).
- **DynamoDB (via AppSync)** — `DayRecord` (one item per outlet-day),
  `MonthAdjustments` (loans/penalties/incentives per month), `AppConfig`
  (staff, rates, expense categories).
- **S3** — invoice photos under `invoices/YYYY-MM/D/`.

On first admin sign-in the app seeds `AppConfig` and the July 2026 data
(from [`src/seed.js`](src/seed.js), extracted from the source spreadsheet)
into the backend if empty.

## Local development

```bash
npm install
npx ampx sandbox --profile skypark   # deploys a personal backend, writes amplify_outputs.json
npm run dev                          # http://localhost:8734
```

## Deploy on AWS Amplify

1. Amplify console → connect this repo (`main` branch). `amplify.yml` runs the
   backend deploy (`ampx pipeline-deploy`) then the Vite build.
2. First deploy prompts for a **service role** — create one when asked.
3. Create users in the Cognito console (or CLI) and add them to the `admin`
   or `manager` group.

## Files

- `amplify/` — backend definition (auth, data, storage)
- `src/main.js` — Amplify config + login gate
- `src/store.js` — cloud data layer (auth, DynamoDB documents, S3 photos)
- `src/app.js` — UI logic
- `src/seed.js` — July 2026 seed data
