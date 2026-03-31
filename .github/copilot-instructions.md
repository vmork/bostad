# Copilot Instructions for Bostad

## Project Overview

A rental listing aggregator for Stockholm housing (bostad.stockholm.se). Monorepo with FastAPI backend and React frontend that share types via auto-generated OpenAPI clients.

The codebase now has a source-oriented scraping architecture that keeps generic async orchestration separate from source-specific parsing logic, so adding new listing sources is straightforward.

## Architecture

### Type Synchronization (Critical Workflow)

Backend Pydantic models → OpenAPI schema → Generated TypeScript types + React Query hooks.

**When modifying `backend/app/models.py`:**

1. Restart backend: `uvicorn app.main:app --reload --port 8000` (from `backend/`)
2. Regenerate frontend types: `pnpm generate:api` (from `frontend/`)
3. Generated files in `frontend/src/api/` — **never edit manually**

When backend request/response models or stream event payloads change, always re-run this workflow before touching frontend typing work.

### Backend (`backend/`)

- **FastAPI** with Pydantic v2 models in `backend/app/`
- Uses `uv` for dependency management (see `pyproject.toml`, `uv.lock`)
- All models extend `CamelModel` which auto-converts snake_case → camelCase for JSON
- Scraping is split into:
  - Generic orchestration + progress/error aggregation in `backend/app/scraping/core.py`
  - Source contracts in `backend/app/scraping/types.py`
  - Source-specific implementations in `backend/app/scraping/sources/`
  - HTTP client setup in `backend/app/http/client.py`
- `backend/app/scrape_bostadsthlm.py` remains the source parser module and compatibility entrypoint
- Typed fetch options are modeled in `ListingsSearchOptions` (`backend/app/models.py`), currently with `sources` constrained to `bostadsthlm` and optional `max_listings` (debug-only parse limit, default `None`)
- Run: `uvicorn app.main:app --reload --port 8000`

### Frontend (`frontend/`)

- React 19 + TypeScript + Vite + Tailwind CSS v4
- Uses `pnpm` as package manager
- **Orval** generates API client from OpenAPI spec (see `orval.config.ts`)
- Stream/cache orchestration is in `frontend/src/lib/listingsStreamService.ts`
- View-facing data state is in `frontend/src/hooks/useListingsData.ts`
- `frontend/src/App.tsx` should stay mostly presentational and avoid owning EventSource/cache internals
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
- Design tokens: `bg-background`, `text-gs-0`, `text-muted`, `border-gs-2`, `bg-primary`

### API Consumption

```tsx
// Prefer the local hook for listings stream state in UI code.
import { useListingsData } from "./hooks/useListingsData";

// Generated API types still come from ./api/models.
import type { AllListingsResponse } from "./api/models";
```

### Scraping Conventions

- Keep source-specific selectors, localized labels, and mapping rules inside source modules under `backend/app/scraping/sources/`.
- Keep concurrency limits, progress emission, ordering, and error aggregation in `backend/app/scraping/core.py`.
- Use `ListingsSearchOptions.max_listings` to limit parsing during debugging; leave it as `None` in normal runs to parse all listings.
- Avoid passing `model_dump()` dicts for nested model updates into `Listing.model_copy(update=...)`; prefer typed field updates to prevent serialization warnings.

## Key Files

- `backend/app/models.py` — Source of truth for data types
- `backend/app/main.py` — FastAPI app entry point
- `backend/app/scraping/core.py` — Generic async scrape orchestration
- `backend/app/scraping/types.py` — Source interface contracts
- `backend/app/scraping/sources/bostadsthlm.py` — Bostad source adapter
- `backend/app/http/client.py` — Shared HTTP client construction
- `backend/app/scrape_bostadsthlm.py` — Bostad parsing helpers + compatibility entrypoints
- `frontend/orval.config.ts` — API generation config
- `frontend/src/api/` — Generated code (read-only)
- `frontend/src/lib/listingsStreamService.ts` — Stream + cache data-layer logic
- `frontend/src/hooks/useListingsData.ts` — React hook coordinating listing fetch state
- `frontend/src/App.tsx` — Main presentational composition
- `frontend/vite.config.ts` — Proxy configuration for local dev

## Code style

- Follow existing style and conventions
- Dont introduce unecessary spacing or newlines
