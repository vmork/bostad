---
name: backend-scraping
description: "Understand, extend, or debug the bostad backend scraping pipeline. Use when adding a source, changing shared scrape orchestration, adding scraped listing fields, or tracing parsing and progress behavior."
---

# Backend Scraping

This skill captures how listing scraping is structured in the bostad backend and how to extend it safely.

## When to Use

- Add a new listing source.
- Change shared scrape orchestration or progress behavior.
- Add or modify fields on `Listing` or related scrape models.
- Debug source parsing, source registration, or scrape result aggregation.
- Trace where source-specific logic should live versus shared logic.

## First Files To Inspect

- `backend/app/models.py` is the source of truth for scrape input/output models and source-specific options.
- `backend/app/scraping/types.py` defines the `ListingSource` contract every source adapter implements.
- `backend/app/scraping/core.py` owns generic orchestration, bounded concurrency, progress events, parse error wrapping, and post-parse normalization.
- `backend/app/scraping/registry.py` is where sources are registered and discovered.
- `backend/app/scraping/scrape_utils.py` contains shared helpers, ID building, and reusable scrape exceptions.
- `backend/app/scraping/sources/` contains one file per source with all source-specific fetch and parse logic.
- `backend/tests/` contains focused tests for shared orchestration and per-source behavior.

## Architecture

1. A source adapter fetches an index of listing stubs in `fetch_listing_index`.
2. `backend/app/scraping/core.py` applies generic concurrency control and calls `parse_listing` per item.
3. Each source adapter fetches and parses its own detail payloads inside `parse_listing`.
4. Shared post-parse normalization happens in `core.py`, for example point-in-polygon district and municipality normalization from `backend/app/geo.py`.
5. `core.py` emits per-source progress snapshots and returns one merged `AllListingsResponse`.

## Add a New Source

1. Create one source module under `backend/app/scraping/sources/` and keep all source-specific HTTP, selectors, labels, and mapping logic there.
2. Implement the `ListingSource` contract from `backend/app/scraping/types.py`.
3. Add any new source-specific fetch options to `backend/app/models.py` and nest them under `ListingsSearchOptions`.
4. Register the source in `backend/app/scraping/registry.py` so orchestration discovers it without hard-coded conditionals elsewhere.
5. Keep shared helpers in `backend/app/scraping/scrape_utils.py` or `backend/app/geo.py` instead of copying them into multiple sources.
6. Add focused tests under `backend/tests/` for index handling, parsing, skips, and error behavior.
7. Run `cd backend && uv run pytest` after backend changes.

## Add a New Scraped Field

1. Add the field to the appropriate backend model in `backend/app/models.py`, usually `Listing`, `ListingFeatures`, `TenantRequirements`, or a source-specific option model.
2. Update every source adapter that can populate the field. Prefer setting missing data to `None` instead of inventing source-specific placeholders.
3. If the field is cross-source derived data, add that logic to a shared layer like `backend/app/scraping/core.py`, `backend/app/scraping/scrape_utils.py`, or `backend/app/geo.py` rather than duplicating it in each source.
4. Update or add backend tests that prove both populated and missing-data behavior.
5. If the model change affects the API, restart the backend and regenerate frontend API types with `cd frontend && pnpm generate:api`.

## Validation

- Run focused tests first, such as `cd backend && uv run pytest tests/test_scraping_core.py -q` or a source-specific test file.
- Run `cd backend && uv run pytest` for broader backend verification after the focused slice passes.
- Run `cd backend && uv run ruff --fix` if linting or formatting needs cleanup.
- After changing API-facing models, restart the backend and regenerate frontend types before touching frontend typing work.

## Guardrails

- Keep source-specific quirks inside source modules under `backend/app/scraping/sources/`.
- Keep concurrency, progress emission, error aggregation, and merged response behavior in `backend/app/scraping/core.py`.
- Keep the final merged stream event as the only aggregate `complete` event with `data` attached.
- Keep source-scoped ids in the `{source}:{source_local_id}` format via shared helpers.
- Prefer typed field updates over passing nested `model_dump()` output into `Listing.model_copy(update=...)`.
- Treat source strings as fallbacks when shared canonicalization from geometry or shared helpers is available.