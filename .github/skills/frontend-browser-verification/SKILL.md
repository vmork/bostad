---
name: frontend-browser-verification
description: "Verify *non-trivial* frontend style and behavior changes in the integrated browser. Use when changing UI layout, styling, interaction flows, filtering, sorting, map behavior, or other visible app behavior in bostad. Reuse an existing Vite app on :5173 or :5174 when available, and use the `Options` dropdown `Max listings` control when a smaller dataset is enough for validation."
argument-hint: "What UI or behavior change should be verified?"
---

# Frontend Browser Verification

This skill captures the verification workflow for frontend changes that affect how the app looks or behaves.

## When to Use

- A change is non-trivial and affects visible UI, layout, styling, interactions, or browser behavior.
- A change touches filtering, sorting, map behavior, listing presentation, or other user-facing flows.
- A code change is likely correct but should be confirmed in the running app before reporting completion.

## When Not to Use

- The change is minor, isolated, and low-risk enough that browser verification is unnecessary.
- The work is backend-only or otherwise has no visible frontend effect.

## Procedure

1. Decide whether the change is minor or non-trivial.
2. If the change is non-trivial, verify it in the integrated browser before finishing the task.
3. Reuse an existing frontend dev server on `:5173` or `:5174` if one is already running.
4. Reuse an existing open browser page on that server if available; otherwise open a new integrated browser page.
5. Navigate to the part of the app affected by the change and exercise the exact behavior that was modified.
6. If verification requires fetching listings but full data is unnecessary, open the `Options` dropdown next to the fetch button and set `Max listings` to speed up the check.
7. If the task explicitly mentions mobile or responsiveness, also verify the affected state at the relevant viewport sizes.
8. Confirm both behavior and presentation:
   - the feature works as intended
   - the visual result matches expectations
   - there are no obvious nearby regressions when a quick sweep is warranted
9. If the browser result does not match expectations, return to the code, fix the issue, and verify again.

## Decision Points

- Prefer browser verification whenever the change could reasonably regress user-visible behavior.
- Prefer the already running local app over starting another dev server.
- Prefer a reduced listing count for validation when the full dataset is not needed to prove correctness.
- Use best judgment on how much surrounding UI to re-check; do not turn every validation into a full regression pass.
- Only add responsive verification when the task or affected behavior makes it relevant.

## Completion Checks

- The changed flow was exercised in the browser.
- The resulting UI state looked correct.
- Any required listing refetch used the smallest practical dataset for the check.
- The final response mentions that browser verification was performed, or explicitly states that it was skipped because the change was minor.
