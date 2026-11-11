# GharPlate — Restaurant Provider Integrations (Google Maps, Swiggy MCP & Zomato)

## 1. Multi-Provider Adapter Architecture
Implemented in `backend/app/services/food_discovery_service.py` with transparent status reporting via `GET /api/v1/food-discovery/providers`:

1. **`GoogleMapsUrlFallbackAdapter` (`active_free`)**:
   - Generates official, zero-key Google Maps Search (`https://www.google.com/maps/search/?api=1&query=...`) and Directions (`https://www.google.com/maps/dir/?api=1&destination=...`) links for every restaurant and dish.
2. **`GharPlateRegionalDirectoryAdapter` (`active_free`)**:
   - Provides verified regional Indian dish-to-restaurant mappings linked to GharPlate's `FoodItem` slugs, with honest labels distinguishing `Verified Dish Match` from `Cuisine Match (Confirm Dish Availability with Restaurant)`.
3. **`GooglePlacesOptionalAdapter` (`google_places_new`)**:
   - Optional live Google Places API (New) integration controlled via `ENABLE_GOOGLE_PLACES_LIVE` and `GOOGLE_PLACES_API_KEY` with minimal FieldMask billing controls.
4. **`SwiggyBuildersClubMcpAdapter` (`swiggy_mcp`)**:
   - Supports Swiggy Builders Club MCP workflows (`search_restaurants`, `get_menus`, `prepare_cart`, `book_table`, `open_external_link`) via `POST /api/v1/food-discovery/swiggy-mcp/preview`.
   - Enforces a strict **User Confirmation Gate** (`requires_user_confirmation: true` until `user_confirmed: true`) and never places orders or books tables silently.
   - When live Swiggy OAuth/MCP credentials (`SWIGGY_MCP_TOKEN`) are not configured locally, provides a verified Swiggy Food / Swiggy Dineout handoff link after confirmation.
5. **`ZomatoPartnerIntegrationAdapter` (`zomato_partner`)**:
   - Transparently discloses that Zomato's official API is restricted to registered POS partners (`external_link_only_pos_restricted`) and provides verified external Zomato restaurant & dish search links without scraping or bypassing platform controls.
