# Information Architecture

Status: **Current**  
Last updated: 2026-09-17

```text
Public application
├─ Map
│  ├─ Regional/district/neighborhood summaries
│  ├─ School markers and school detail
│  └─ Assigned-apartment markers and apartment detail
├─ Search
│  ├─ Schools
│  └─ Apartment complexes
├─ Filters
│  ├─ School scope
│  └─ Selected-school apartment scope
├─ News / reports
└─ Favorites
   ├─ Schools
   └─ Apartments

Restricted operations
└─ ETL monitoring
   ├─ Schedules and regional scope
   ├─ Runs and quality checks
   └─ Source snapshots
```

The public navigation is `지도 / 소식 / 즐겨찾기`. ETL monitoring is a separate authenticated route and is not part of the public navigation or primary bundle.
