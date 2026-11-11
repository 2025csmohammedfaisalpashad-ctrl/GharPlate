# GharPlate — Smart Nearby Food Discovery & Real OpenStreetMap Integration

## 1. Real OpenStreetMap, Leaflet & React-Leaflet Architecture (`/food-nearby`)
Implemented in `frontend/src/components/OpenStreetMapView.tsx` and `frontend/src/pages/FoodNearbyPage.tsx`:
- **Replaced Simulated Schematic Map**: Removed the SVG dashed-circle radar graphic and replaced it with a genuine interactive geographical map powered by **OpenStreetMap**, **Leaflet (`1.9.4`)**, and **React-Leaflet (`4.2.1`)**.
- **Standard OpenStreetMap Tile Service**:
  - Uses the official HTTPS tile template `https://tile.openstreetmap.org/{z}/{x}/{y}.png` via `<TileLayer />` (configurable via `tileUrl` prop) in compliance with the [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).
  - Displays visible, clickable attribution (`© OpenStreetMap contributors`) inside both the Leaflet attribution control and the persistent map footer bar.
- **Responsive Container & Resize Invalidation**:
  - Uses a `ResizeObserver` on the map wrapper plus `map.invalidateSize()` via `useMap()` so collapsing or expanding the dark-emerald left sidebar redraws tiles without grey gaps.
- **Essential Map Controls**:
  - Zoom In (`+`), Zoom Out (`-`), Fit All Visible Markers (`Fit All`), Reset to Search Area (`Reset Area`), Current Location (`Use My Location`), and **Open in OpenStreetMap** (`https://www.openstreetmap.org/...`).

## 2. Real Coordinates, Nominatim Geocoding & Overpass POI Discovery
Implemented in `backend/app/services/food_discovery_service.py`:
- **Zero Fabricated Coordinates**:
  - Every marker plotted on the map uses verified WGS84 coordinates (`latitude`, `longitude`) from GharPlate's regional restaurant directory or OpenStreetMap Overpass POIs.
  - Any restaurant lacking valid coordinates is marked `coordinates_available: false` and is never placed at a random or synthetic coordinate offset.
- **OpenStreetMap Nominatim Location Search (`GET /api/v1/food-discovery/geocode`)**:
  - Supports searching Indian cities and neighbourhoods such as `Mysuru`, `Vijayanagar, Mysuru`, `Kuvempunagar, Mysuru`, `Saraswathipuram, Mysuru`, `Gokulam, Mysuru`, `Bengaluru`, `Indiranagar, Bengaluru`, and `Jayanagar, Bengaluru`.
  - Enforces a strict `<= 1 request/second` rate limit, in-memory caching, and an identifying `User-Agent: GharPlate/1.0 (food discovery application)` per the [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/).
- **OpenStreetMap Overpass API POI Discovery (`fetch_osm_overpass_restaurants`)**:
  - Queries bounded `around` areas (`amenity=restaurant|fast_food|cafe`), caches results, handles HTTP 429/504/timeouts gracefully, preserves `osm_type` and `osm_id`, and labels unverified OSM POIs honestly (`"Dietary Classification Unverified (OpenStreetMap POI)"` and `"OpenStreetMap POI (Menu Availability Unverified)"`).
