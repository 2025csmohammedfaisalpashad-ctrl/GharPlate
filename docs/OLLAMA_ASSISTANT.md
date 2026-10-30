# Local Ollama-Powered GharPlate AI Assistant (`docs/OLLAMA_ASSISTANT.md`)

## 1. Overview & Architecture

GharPlate includes an integrated, context-aware AI assistant (**Ask GharPlate**) powered by your locally running Ollama server (`http://127.0.0.1:11434/api/chat` and `/api/tags`) and backed by 11 allowlisted, schema-validated backend tools (`backend/app/services/ollama_assistant_service.py`).

### Key Capabilities
1. **Floating Button & Right-Side Drawer (`frontend/src/components/AssistantDrawer.tsx`)**:
   - Accessible from the floating **Ask GharPlate** button on the bottom-right of every page while preserving your current page state.
   - Automatically passes the current page context (`food_slug`, `condition_code`, `household_token`, and active `member_id`) to the backend.
2. **Three Explicit Search Modes**:
   - **My GharPlate DB (`database_only`)**: Queries only GharPlate's local SQLite database and reviewed clinical rules; blocks outbound external product/web searches.
   - **Automatic (`automatic`)**: Checks GharPlate's local database first and queries configured external product databases when fields are missing.
   - **Search Online (`online_search`)**: Queries Open Food Facts, USDA FoodData Central, and configured external web search providers, returning full source URLs and retrieval timestamps.
3. **11 Allowlisted Backend Tools**:
   - `search_food_database`
   - `get_food_details`
   - `lookup_product_by_barcode`
   - `search_external_products`
   - `get_ingredients_and_allergens`
   - `get_nutritional_composition`
   - `get_condition_guidance`
   - `get_household_member_context`
   - `compare_packaged_products`
   - `calculate_recipe_nutrition`
   - `search_external_web_sources`
   - Arbitrary SQL, shell commands, or unapproved function names are strictly rejected.

---

## 2. Setting Up & Connecting Ollama on macOS

### Running Backend Directly on macOS
1. Start the Ollama server on your MacBook:
   ```bash
   ollama serve
   ```
2. Verify installed models (or pull a compact tool-capable model if none are installed):
   ```bash
   ollama list
   # Optional if you have no models installed yet:
   ollama pull llama3.2
   ```
3. Configure `.env` (optional — GharPlate auto-detects installed models via `GET http://127.0.0.1:11434/api/tags`):
   ```env
   ENABLE_LOCAL_AI_ASSISTANT=true
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=
   OLLAMA_TIMEOUT_SECONDS=120
   ```

### Running Inside Docker on macOS
Inside a Docker container, `127.0.0.1` refers to the container itself rather than your Mac host. `docker-compose.yml` is pre-configured with:
```yaml
environment:
  - OLLAMA_BASE_URL=http://host.docker.internal:11434
extra_hosts:
  - "host.docker.internal:host-gateway"
```

### Graceful Fallback & Diagnostics
- You can check assistant connectivity at any time via `GET /api/v1/assistant/status` or `GET /api/v1/assistant/models`.
- If Ollama is not running or a model does not support native tool calling, GharPlate's deterministic backend tool orchestrator still executes the allowlisted database/provider tools and returns a grounded, source-cited response (`used_fallback_synthesis: true`) while displaying the exact terminal command (`ollama serve`) in the drawer header.
