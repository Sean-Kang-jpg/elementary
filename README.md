# Elementary School Assignment Map

The active application is [`elementary-v2/`](elementary-v2/), a React, TypeScript, Vite, and Supabase map for exploring elementary schools and assigned apartment complexes.

## Versions

- **v2.0 baseline:** operational school-zone, school, and apartment ETL; Supabase migrations 06-12; two-table public frontend contract; recurring ETL monitoring; and the verified map-first frontend.
- **v2.1 planned:** shared design system, unified school/apartment search, scoped filters, address discovery, and later subway-station discovery.

See [`elementary-v2/docs/RELEASES.md`](elementary-v2/docs/RELEASES.md) for the release boundary and [`elementary-v2/docs/ETL_OPERATION_PLAN.md`](elementary-v2/docs/ETL_OPERATION_PLAN.md) for the active checklist.

## Development

```bash
cd elementary-v2
npm install
npm run dev
```

Keep secrets in `elementary-v2/.env`; use `.env.example` as the template.
