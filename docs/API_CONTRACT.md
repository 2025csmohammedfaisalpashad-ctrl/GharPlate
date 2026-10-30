# GharPlate REST API Contract (`/api/v1`)

Interactive OpenAPI/Swagger documentation is automatically served at `http://localhost:8000/docs` and `http://localhost:8000/redoc` when the backend is running.

## Endpoints Summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Service health check, database connectivity status, and verified record counts |
| `GET` | `/api/v1/sources` | List all authoritative nutrition & clinical guideline sources |
| `GET` | `/api/v1/foods/categories` | List all 9 Indian food categories |
| `GET` | `/api/v1/foods` | Advanced food search (`q`, `category`, `is_packaged`, `vegetarian_only`, `nutrient_filter`, `sort_by`, `page`, `page_size`) |
| `GET` | `/api/v1/foods/{slug}` | Detailed food composition, multilingual aliases, serving conversions, and `NULL`-preserving nutrient breakdown |
| `GET` | `/api/v1/conditions` | List all 24 supported health conditions across Groups A–I |
| `GET` | `/api/v1/conditions/conflicts` | List all multi-condition conflict rules |
| `GET` | `/api/v1/conditions/{code}` | Condition detail, clinical synthesis, evidence limits, and registered rules |
| `GET` | `/api/v1/conditions/{code}/foods` | Explore foods relevant to a specific condition |
| `POST` | `/api/v1/guidance/evaluate` | Evaluate deterministic condition-aware guidance, allergen/intolerance alerts, and multi-condition conflicts for a food and serving |
| `POST` | `/api/v1/households` | Create or retrieve a household by browser convenience token |
| `GET` | `/api/v1/households/{token}` | Get household and all member profiles |
| `DELETE` | `/api/v1/households/{token}` | Permanently delete household, member profiles, and saved recipes |
| `POST` | `/api/v1/households/{token}/members` | Add a household member profile |
| `PUT` | `/api/v1/households/{token}/members/{member_id}` | Update a household member profile |
| `POST` | `/api/v1/households/{token}/default-member/{member_id}` | Set active default member for household |
| `DELETE` | `/api/v1/households/{token}/members/{member_id}` | Remove a household member profile |
| `POST` | `/api/v1/recipes/calculate` | Create a recipe and compute total + per-serving nutrition with completeness metrics |
| `PUT` | `/api/v1/recipes/{recipe_id}` | Update an existing recipe and recalculate nutrition |
| `GET` | `/api/v1/recipes` | List saved recipes for a household token + system templates |
| `GET` | `/api/v1/recipes/{recipe_id}` | Retrieve recipe calculation details |
| `DELETE` | `/api/v1/recipes/{recipe_id}` | Delete a saved recipe |
| `POST` | `/api/v1/scan/ocr-image` | Upload a nutrition label image (`multipart/form-data`), process in RAM only, validate fields, and return editable predictions |
| `POST` | `/api/v1/scan/ocr-text` | Parse and validate raw nutrition label text |
| `POST` | `/api/v1/scan/confirm-product` | Save user-reviewed and confirmed packaged food record |
| `GET` | `/api/v1/scan/barcode/{barcode}` | Lookup packaged product by barcode (local DB + Open Food Facts + manual fallback) |
| `POST` | `/api/v1/scan/recognize-dish` | Experimental Indian dish image recognition (processed in RAM only, returns multi-candidate suggestions with uncertainty) |
| `POST` | `/api/v1/products/compare` | Compare 2–4 packaged products normalized per 100g/100ml alongside original serving sizes |
| `POST` | `/api/v1/meals/suggestions` | Generate structured Indian meal suggestions for Breakfast, Lunch, Dinner, or Snacks |
