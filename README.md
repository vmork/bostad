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

- map:
  - improve map popup ui
    - dropdowns should be centered, not left/right aligned
  - better styling of dots
  - clicking dots link to url
  - popup for dots stays when hovering over it

- filters
  - allow null for more (most) filters, ie queue data
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
  - hosting
  - accounts (after hosting)
  - autofetch once a day in background (after hosting)