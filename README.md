## TODO

- Scraping
  - fields that should be added
    - is_furnished: enum
        - full, partial, none
        - missing=none
    - application_deadline: date
    - move_in_date: date or ASAP (missing=null)
    - move_out_date: date or UNLIMITED (missing=unlimited)
    - allocation_method: 
        - queue_points (bf and homeq)
        - random (homeq only)
        - application_date (homeq only)
        - request (all qasa listings i think)
        - unknown
    - top_10_queue_points: number
      - note logical relation with max_queue_points, this is always leq; could we enforce that in filtering and sorting?
    - tenure_type: enum
      - first_hand
      - second_hand_private
      - second_hand_shared (for corridor or coliving)

- add some filters to refetch options to save time
  - need to be per-source as they have different allowed request filters, look into exact structure
    for homeq and qasa

- filters
  - move map trigger inside filter dropdown, also show num regions/districts
  - move filters to sidebar on large screens, (modal on small screens?)

- Other
  - ai summaries of desriptions
    - should focus on important potential dealbreakers/makers not covered by other fields
    - todo: 
      - collect handful of examples
      - research local ai possibility
      - if not, research cost of cheapest possible nonlocal

  - listing actions
    - "add tag" btn
    - "show on map", on hover shows map popup (no sidebar) with highlight
    - "save listing"

  - save/favorite listings to personal collection
    - implement for now with localstorage, later accounts
  - "bevakning", feed of filtered new listings sorted by recent
  - accounts
