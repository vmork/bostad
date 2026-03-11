## TODO
### Backend
- Improved logging with file:line and timestamps and severity levels
- Is this an issue (for every listing):
    ````
  PydanticSerializationUnexpectedValue(Expected `QueuePosition` - serialized value may not be as expected [field_name='queue_position', input_value={'queue_times_sorted': [d...time(2019, 8, 1, 0, 0)]}, input_type=dict])
  PydanticSerializationUnexpectedValue(Expected `TenantRequirements` - serialized value may not be as expected [field_name='requirements', input_value={'student': False, 'age_r...in': 24.0, 'max': 24.0}}, input_type=dict])
  PydanticSerializationUnexpectedValue(Expected `TenantRequirements` - serialized value may not be as expected [field_name='requirements', input_value={'student': True, 'num_te...ts_range': {'max': 2.0}}, input_type```


### Frontend
- UI list view
- UI expanded (modal?) view for each listing
- Filters
- Sorting