# Copilot Instructions for Bostad

## Project Overview

A rental listing aggregator for Stockholm housing (bostad.stockholm.se). Monorepo with FastAPI backend and React frontend that share types via auto-generated OpenAPI clients.

## Architecture

### Type Synchronization (Critical Workflow)

Backend Pydantic models → OpenAPI schema → Generated TypeScript types + React Query hooks.

**When modifying `backend/app/models.py`:**

1. Restart backend: `uvicorn app.main:app --reload --port 8000` (from `backend/`)
2. Regenerate frontend types: `pnpm generate:api` (from `frontend/`)
3. Generated files in `frontend/src/api/` — **never edit manually**

### Backend (`backend/`)

- **FastAPI** with Pydantic v2 models in `backend/app/`
- Uses `uv` for dependency management (see `pyproject.toml`, `uv.lock`)
- All models extend `CamelModel` which auto-converts snake_case → camelCase for JSON
- Run: `uvicorn app.main:app --reload --port 8000`

### Frontend (`frontend/`)

- React 19 + TypeScript + Vite + Tailwind CSS v4
- Uses `pnpm` as package manager
- **Orval** generates API client from OpenAPI spec (see `orval.config.ts`)
- Vite proxies `/api/*` to backend at localhost:8000 during dev
- Run: `pnpm dev`

## Conventions

### Backend Models

```python
# Always extend CamelModel for API responses
class MyModel(CamelModel):
    some_field: str  # Serializes as "someField" in JSON
    optional_field: Opt[int] = None  # Use Opt alias for Optional
```

### Frontend Styling

- Use the `cn()` utility from `src/lib/utils.ts` for conditional Tailwind classes
- Theme variables defined in `src/index.css` under `@theme` (e.g., `--color-primary`)
- Design tokens: `bg-background`, `text-foreground`, `text-muted`, `border-border`, `bg-primary`

### API Consumption

```tsx
// Generated hooks follow pattern: use{OperationId}{Method}
import { useAllListingsApiAllListingsGet } from "./api/default/default";
// Types imported from ./api/models when needed
```

## Key Files

- `backend/app/models.py` — Source of truth for data types
- `backend/app/main.py` — FastAPI app entry point
- `frontend/orval.config.ts` — API generation config
- `frontend/src/api/` — Generated code (read-only)
- `frontend/vite.config.ts` — Proxy configuration for local dev


## Code style 
- Follow existing style and conventions 
- Dont introduce unecessary spacing or newlines