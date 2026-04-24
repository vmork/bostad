# Copilot Instructions for Bostad

## Project Overview

A rental listing aggregator for Stockholm housing (bostad.stockholm.se). Monorepo with FastAPI backend and React frontend that share types via auto-generated OpenAPI clients.

The codebase now has a source-oriented scraping architecture that keeps generic async orchestration separate from source-specific parsing logic, so adding new listing sources is straightforward.

## Notes

- Do not try to read the entire geojson files in the data folder, they are very large and will fill up your context window.
- ALWAYS make sure you are in the right directory (eg backend/ or frontend/) when running commands. By default you will be in the workspace root, so you need to `cd` into the correct subfolder before running commands.
- When in backend: make sure the venv is activated, and if the server is already running, use that open connection, otherwise start a new one with the command mentioned in the architecture section.
- Backend tests live under `backend/tests/`. After changes to backend code, verify them from the correct folder by running `uv run pytest` from `backend/`.
- For python linting, run `uv run ruff --fix` from `backend/`.
- For quick frontend testing where localStorage is empty, use the `Options` dropdown next to the fetch button and set `Max listings` to fetch data faster.
- When using terminal tooling that may simplify commands, prefer `pushd ... && <command>` or an equivalent single-shell command so the intended working directory is preserved.

## Architecture

### Type Synchronization (Critical Workflow)

Backend Pydantic models → OpenAPI schema → generated TypeScript models + React Query hooks.

**After modifying `backend/app/models.py`:**

1. Restart backend: `uvicorn app.main:app --port 8000` (from `backend/`)
2. Regenerate frontend types: `pnpm generate:api` (from `frontend/`)
3. Generated files in `frontend/src/api/models/` and `frontend/src/api/endpoints.ts` — **never edit manually**

When backend request/response models or stream event payloads change, always re-run this workflow before touching frontend typing work.

### Backend (`backend/`)

- **FastAPI** with Pydantic v2 models in `backend/app/`
- Uses `uv` for dependency management (see `pyproject.toml`, `uv.lock`)
- All models extend `CamelModel` which auto-converts snake_case → camelCase for JSON
- Scraping is split into:
  - Generic orchestration + progress/error aggregation in `backend/app/scraping/core.py`
  - Source contracts in `backend/app/scraping/types.py`
  - Source registry in `backend/app/scraping/registry.py`
  - Shared scraping helpers and validation in `backend/app/scraping/scrape_utils.py`
  - Source-specific implementations in `backend/app/scraping/sources/`
  - Each source module owns source metadata (`source_id`, `name`, `global_url`), index fetching, parse logic, login inference, and source-specific option handling
- `backend/app/scrape_bostadsthlm.py` is now only a compatibility shim for older imports; active source logic lives in `backend/app/scraping/sources/bostadsthlm.py`
- Typed fetch options are modeled in `ListingsSearchOptions` (`backend/app/models.py`) with a top-level `sources` selection and nested source-specific option objects such as `bostadsthlm.max_listings`
- `Listing.id` is a source-scoped shared identifier in the format `{source}:{source_local_id}`; keep `source_local_id` separate for source-native references
- Aggregate stream and response metadata uses `source_stats` rather than a single shared `logged_in` flag
- Run: `uvicorn app.main:app --port 8000`

### Scraping

- For adding/modifying scraping code:
  - check example json response from https://bostad.stockholm.se/AllaAnnonser under scratch folder
  - if needed, find listings that has relevant properties for the task
  - go the specific listing pages and look at the html structure, note there can be a lot of irregularity, also look at existing scraping code

### Frontend (`frontend/`)

- React 19 + TypeScript + Vite + Tailwind CSS v4
- Uses `pnpm` as package manager
- **Orval** generates API client from OpenAPI spec (see `orval.config.ts`)
- Stream/cache orchestration is in `frontend/src/lib/listingsStreamService.ts`
- Source label fallback metadata for pre-fetch UI is in `frontend/src/lib/sourceMetadata.ts`
- View-facing data state is in `frontend/src/hooks/useListingsData.ts`
- `frontend/src/App.tsx` should stay mostly presentational and avoid owning EventSource/cache internals
- The options UI in `frontend/src/components/RefetchButton.tsx` groups controls by source and persists one merged fetch configuration in localStorage
- The frontend should treat source as shared listing metadata, not as a separate per-source rendering path; selected sources are fetched together and stored in one merged cache entry
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

### API Consumption

```tsx
// Prefer the local hook for listings stream state in UI code.
import { useListingsData } from "./hooks/useListingsData";

// Generated API types still come from ./api/models.
import type { AllListingsResponse } from "./api/models";
```

### Scraping Conventions

- Keep source-specific selectors, localized labels, and mapping rules inside source modules under `backend/app/scraping/sources/`.
- Keep shared parsing helpers, validation, ID building, and reusable scrape utilities in `backend/app/scraping/scrape_utils.py`.
- Register new sources in `backend/app/scraping/registry.py`; orchestration code should discover sources from the registry, not hard-coded conditionals.
- Keep concurrency limits, progress emission, ordering, and error aggregation in `backend/app/scraping/core.py`.
- Use source-specific options such as `ListingsSearchOptions.bostadsthlm.max_listings` to limit parsing during debugging; leave them as `None` in normal runs to parse all listings.
- When adding a source, put everything source-specific in a single file under `backend/app/scraping/sources/`.
- Aggregate SSE forwarding in `backend/app/scraping/core.py` must only emit `complete` once, on the final merged event with `data` attached.
- Avoid passing `model_dump()` dicts for nested model updates into `Listing.model_copy(update=...)`; prefer typed field updates to prevent serialization warnings.

## Key Files

- `backend/app/models.py` — Source of truth for data types
- `backend/app/main.py` — FastAPI app entry point
- `backend/app/scraping/core.py` — Generic async scrape orchestration
- `backend/app/scraping/registry.py` — Source registration and lookup
- `backend/app/scraping/scrape_utils.py` — Shared scraping helpers, validation, and exceptions
- `backend/app/scraping/types.py` — Source interface contracts
- `backend/app/scraping/sources/bostadsthlm.py` — Bostad source adapter
- `backend/app/scrape_bostadsthlm.py` — Bostad parsing helpers + compatibility entrypoints
- `frontend/orval.config.ts` — API generation config
- `frontend/src/api/models/` — Generated API models (read-only)
- `frontend/src/api/endpoints.ts` — Generated API hooks/client entrypoint (read-only)
- `frontend/src/lib/listingsStreamService.ts` — Stream + cache data-layer logic
- `frontend/src/lib/sourceMetadata.ts` — Source metadata used before backend stats are available
- `frontend/src/hooks/useListingsData.ts` — React hook coordinating listing fetch state
- `frontend/src/App.tsx` — Main presentational composition
- `frontend/src/components/RefetchButton.tsx` — Source-grouped fetch options UI
- `frontend/vite.config.ts` — Proxy configuration for local dev

## Code style

- Follow existing style and conventions
- Dont introduce unecessary spacing or newlines
