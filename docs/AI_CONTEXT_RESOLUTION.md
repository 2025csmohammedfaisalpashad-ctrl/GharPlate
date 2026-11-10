# Context-Aware AI Intelligence & Pronoun Resolution (`AI_CONTEXT_RESOLUTION.md`)

## 1. Root Cause of the Previous Context Bug

Previously, when a user viewed a specific item page (such as `/foods/carrot-orange`, `/recipes/idli-steamed-rice-lentil`, or a selected organ on `/explore/body-nutrition`) and asked a natural pronoun-based question like `"uses of this?"`, `"How is this made?"`, or `"What nutrients are important for this?"`:
1. The frontend only parsed `food_slug` from the URL pathname and had no shared state for selected 3D body regions, recipes, or entity names/categories.
2. In `backend/app/services/ollama_assistant_service.py`, `"uses"` and `"this"` were stripped as generic stop words when no explicit food name appeared in the message text, causing the system prompt to fall back to generic GharPlate platform descriptions (`"GharPlate is an Indian household nutrition platform..."`) instead of answering about the selected food, recipe, or organ.

---

## 2. Structured Active Context Contract

### 2.1 Frontend Context Provider (`frontend/src/hooks/useAssistantContext.tsx`)
All major detail pages (`FoodDetailPage`, `RecipeDetailPage`, `ConditionDetailPage`, and `BodyNutritionExplorerPage`) now publish their active selection to `AssistantContextProvider`:

```json
{
  "page_type": "food_detail",
  "route": "/foods/carrot-orange",
  "food_slug": "carrot-orange",
  "selected_entity": {
    "type": "food",
    "id": "carrot-orange",
    "name": "Carrot (Orange)",
    "category": "Vegetables & Greens"
  },
  "selected_member": {
    "id": 1,
    "name": "Ajji",
    "dietary_preference": "vegetarian",
    "age_group": "older_adult"
  }
}
```

### 2.2 Live Active Context Badge in `AssistantDrawer.tsx`
The assistant header displays a live badge (`data-testid="assistant-active-context-badge"`) showing the active selection (e.g., `🥕 Food: Carrot (Orange)`, `🍲 Recipe: South Indian Steamed Idli`, `🫀 Body Region: Eyes & Vision`), updating immediately when the user navigates or clicks a different 3D body structure.

---

## 3. Deterministic Entity & Pronoun Resolution Pipeline (`resolve_active_entity_and_intent`)

Before invoking Ollama (`backend/app/services/ollama_assistant_service.py`), `resolve_active_entity_and_intent(db, req)` executes a strict 5-stage resolution order:

1. **Explicit Software Meta-Questions (`intent = "software_help"`)**: Only triggered when the user explicitly asks about the app (`"What does this GharPlate feature do?"`, `"What is GharPlate?"`).
2. **Active UI Selection + Pronoun Priority**: When `req.context.selected_entity` (or `food_slug`, `selected_body_region`, `selected_recipe`, `condition_code`) is present and the user uses a pronoun (`"this"`, `"it"`, `"that"`, `"this one"`, `"uses of this?"`, `"how is this made?"`), the resolver **always binds to the current UI selection**—immediately overriding any older entity from earlier turns in the conversation.
3. **Explicit Entity Mention in Message**: Matches explicit food names/slugs, recipe titles/slugs, or anatomical structure aliases (`eyes` -> `eyes_vision`, `lungs` -> `respiratory_lungs`, `kidneys` -> `urinary_kidneys`, etc.).
4. **Same-Conversation History Fallback**: If no UI entity is currently selected and the user asks a follow-up pronoun question, `_extract_entity_from_history` inspects only the last 4 messages of the **current** conversation (never leaking across `+ New Chat`).
5. **Missing Context Clarification (`intent = "needs_clarification"`)**: If the user asks `"Is this good?"` or `"uses of this?"` on the Home page with no selected entity and an empty conversation history, the assistant asks a concise clarification question instead of guessing.

---

## 4. Verification Against All 7 Mandatory Regression Tests

All 7 mandatory tests are automated in `backend/tests/test_anatomy_ai_context_and_voice.py` (`test_part_b_mandatory_ai_context_regression_tests_1_through_7`):
- **Test 1 (`carrot-orange` + `"uses of this?"`)**: Calls `get_food_details`, `get_nutritional_composition`, and `get_ingredients_and_allergens`, returning culinary uses, physiological benefits (Eyes & Vision, Skin & Immunity), and IFCT 2017 nutrients for **Carrot (Orange)**.
- **Test 2 (`idli-steamed-rice-lentil` + `"How is this made?"`)**: Calls `get_recipe_details` and returns linked ingredients, step-by-step steaming instructions, and per-serving macros for **South Indian Steamed Idli**.
- **Test 3 (`eyes_vision` + `"What nutrients are important for this?"`)**: Calls `get_body_region_details` and returns Vitamin A, Vitamin C, Zinc, and verified Indian food sources (`Spinach (Palak)`, `Carrot (Orange)`, `Amla`).
- **Test 4 (Switch from Carrot to `banana-ripe` + `"What about this one?"`)**: Resolves to **Banana (Ripe)** (`banana-ripe`).
- **Test 5 (`+ New Chat` isolation on `ragi-finger-millet`)**: Creates a clean conversation with zero prior message leakage and resolves `"uses of this?"` to **Ragi (Finger Millet)**.
- **Test 6 (`"What does this GharPlate feature do?"`)**: Resolves to `software_help` and explains the platform capabilities.
- **Test 7 (Home page with no selection + `"Is this good?"`)**: Resolves to `needs_clarification` and prompts the user to select or name a food, recipe, or body region.
