# Xamina Frontend MVP (Sprint 1-4 Stabilization)

## Quick start

1. Copy `.env.example` to `.env`.
2. Install dependencies:

```bash
npm ci
```

3. Run development server:

```bash
npm run dev -- --host 0.0.0.0 --port 3000
```

## Required environment variables

- `VITE_API_URL`: base URL backend API, default local value:
  - `http://localhost:8080/api/v1`

## Build gate

```bash
npm run build
```

The build command must pass before continuing to Sprint 5 work.
