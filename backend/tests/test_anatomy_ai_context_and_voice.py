"""
Comprehensive Backend Regression Suite for GharPlate 3.0 Upgrade:
- Part A: Realistic 10-Layer 3D Human Anatomy & Nutrition Explorer (12 FMA-indexed structures,
  ICMR-NIN DGI 2024 & IFCT 2017 provenance, open-licensed BodyParts3D CC BY 4.0 attribution)
- Part B: Context-Aware AI Intelligence & Pronoun Resolution (Mandatory Regression Tests 1–7)
- Part B.4: Local Ollama Model Audit & Evaluation (`/api/v1/assistant/models/evaluate`)
- Part C & D: Voice Conversation Status, Transcription Normalization & Confirmation Guardrails
"""

from __future__ import annotations

from unittest.mock import patch
from app.main import app
from tests.conftest import AuthenticatedTestClient

client = AuthenticatedTestClient(app)


def test_part_a_10_layer_3d_human_anatomy_and_nutrition_explorer():
    """
    Verifies that `/api/v1/explore/body-nutrition` returns all 12 anatomical structures
    spanning all 10 required anatomical layers (`external_skin`, `skeletal`, `muscular`,
    `brain_nervous`, `cardiovascular`, `digestive`, `respiratory`, `urinary_renal`,
    `endocrine`, `sensory_immune`), with FMA ontology IDs, mesh IDs, and CC BY 4.0 attribution.
    """
    res = client.get("/api/v1/explore/body-nutrition")
    assert res.status_code == 200
    payload = res.json()

    assert payload["total_regions"] == 12
    assert len(payload.get("anatomical_layers") or []) == 10
    attr = payload.get("asset_attribution") or {}
    assert "BodyParts3D" in (attr.get("upstream_anatomy_data") or attr.get("primary_reference") or "")
    assert "CC BY 4.0" in (attr.get("upstream_anatomy_data") or attr.get("license") or "")

    expected_codes = {
        "brain_nerves",
        "eyes_vision",
        "heart_cardiovascular",
        "respiratory_lungs",
        "bones_joints",
        "muscles_strength",
        "digestive_gut",
        "urinary_kidneys",
        "endocrine_metabolic",
        "blood_circulation",
        "skin_epithelial",
        "immune_defence",
    }
    regions = payload["regions"]
    returned_codes = {r["code"] for r in regions}
    assert expected_codes == returned_codes

    for r in regions:
        assert r.get("layer_id")
        assert r.get("fma_id")
        assert r.get("mesh_id")
        assert r.get("review_status") in ("scientifically_reviewed", "clinically_reviewed_educational")

    # Inspect newly added Respiratory (Lungs), Urinary (Kidneys), and Endocrine (Thyroid/Pancreas) regions
    for reg_code in ("respiratory_lungs", "urinary_kidneys", "endocrine_metabolic", "eyes_vision"):
        d_res = client.get(f"/api/v1/explore/body-nutrition/{reg_code}")
        assert d_res.status_code == 200
        d = d_res.json()
        assert d["code"] == reg_code
        assert d["fma_id"].startswith("FMA:")
        assert len(d["nutrients"]) >= 2
        assert len(d["foods"]) >= 3
        for f in d["foods"]:
            assert f["slug"]
            assert f["relevance_explanation"]
            assert f["source_name"]
            assert "cures" not in f["relevance_explanation"].lower()


def test_part_b_mandatory_ai_context_regression_tests_1_through_7():
    """
    Executes all 7 mandatory AI context regression tests specified in Section 6 of the brief:
    - Test 1 — Selected Food Context: Carrot (Orange) (`carrot-orange`) + "uses of this?"
    - Test 2 — Selected Dish / Recipe Context: Idli (`idli-steamed-rice-lentil`) + "How is this made?"
    - Test 3 — Selected 3D Body Region Context: Eyes & Vision (`eyes_vision`) + "What nutrients are important for this?"
    - Test 4 — Context Change: Switch from Carrot to Ripe Banana (`banana-ripe`) + "What about this one?"
    - Test 5 — New Chat Isolation: Starting a new conversation does not leak old messages, while keeping current UI selection
    - Test 6 — Explicit Software Question: "What does this GharPlate feature do?" explains the app feature
    - Test 7 — Missing Context: No selected item + "Is this good?" asks a short clarification question
    """
    with patch(
        "app.services.ollama_assistant_service.discover_ollama_models",
        return_value=(False, [], "Offline deterministic verification"),
    ):
        # ---------------------------------------------------------------------
        # TEST 1 — Selected Food Context: Carrot (Orange) -> "uses of this?"
        # ---------------------------------------------------------------------
        r1 = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "uses of this?",
                "mode": "automatic",
                "history": [],
                "context": {
                    "page_type": "food_detail",
                    "route": "/foods/carrot-orange",
                    "food_slug": "carrot-orange",
                    "selected_entity": {
                        "type": "food",
                        "id": "carrot-orange",
                        "name": "Carrot (Orange)",
                        "category": "Vegetables & Greens",
                    },
                },
            },
        )
        assert r1.status_code == 200
        d1 = r1.json()
        reply1 = d1["reply"]
        assert "Carrot (Orange)" in reply1
        assert d1["resolved_entity"]["id"] == "carrot-orange"
        # Must NOT return a generic software description of GharPlate
        assert "About This GharPlate Feature" not in reply1
        assert any(t["tool_name"] == "get_food_details" for t in d1["tool_traces"])

        # ---------------------------------------------------------------------
        # TEST 2 — Selected Dish / Recipe Context: Idli -> "How is this made?"
        # ---------------------------------------------------------------------
        r2 = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "How is this made?",
                "mode": "automatic",
                "history": [],
                "context": {
                    "page_type": "recipe_detail",
                    "route": "/recipes/idli-steamed-rice-lentil",
                    "selected_recipe": "idli-steamed-rice-lentil",
                    "selected_entity": {
                        "type": "recipe",
                        "id": "idli-steamed-rice-lentil",
                        "name": "South Indian Steamed Idli",
                    },
                },
            },
        )
        assert r2.status_code == 200
        d2 = r2.json()
        reply2 = d2["reply"]
        assert "Idli" in reply2
        assert "Step 1" in reply2
        assert any(t["tool_name"] == "get_recipe_details" for t in d2["tool_traces"])

        # ---------------------------------------------------------------------
        # TEST 3 — Selected 3D Body Region Context: Eye / Vision -> "What nutrients are important for this?"
        # ---------------------------------------------------------------------
        r3 = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "What nutrients are important for this?",
                "mode": "automatic",
                "history": [],
                "context": {
                    "page_type": "body_region",
                    "route": "/explore/body-nutrition",
                    "selected_body_region": "eyes_vision",
                    "selected_entity": {
                        "type": "body_region",
                        "id": "eyes_vision",
                        "name": "Eyes & Vision",
                        "anatomical_system": "Ocular & Retinal System",
                    },
                },
            },
        )
        assert r3.status_code == 200
        d3 = r3.json()
        reply3 = d3["reply"]
        assert "Eyes & Vision" in reply3
        assert "Vitamin A" in reply3
        assert "Spinach" in reply3 or "Carrot" in reply3
        assert any(t["tool_name"] == "get_body_region_details" for t in d3["tool_traces"])

        # ---------------------------------------------------------------------
        # TEST 4 — Context Change: Switch from Carrot (Orange) to Banana -> "What about this one?"
        # ---------------------------------------------------------------------
        conv_id = d1["conversation_id"]
        r4 = client.post(
            "/api/v1/assistant/chat",
            json={
                "conversation_id": conv_id,
                "message": "What about this one?",
                "mode": "automatic",
                "history": [],
                "context": {
                    "page_type": "food_detail",
                    "route": "/foods/banana-ripe",
                    "food_slug": "banana-ripe",
                    "selected_entity": {
                        "type": "food",
                        "id": "banana-ripe",
                        "name": "Banana (Ripe)",
                    },
                },
            },
        )
        assert r4.status_code == 200
        d4 = r4.json()
        reply4 = d4["reply"]
        assert "Banana" in reply4
        assert d4["resolved_entity"]["id"] == "banana-ripe"

        # ---------------------------------------------------------------------
        # TEST 5 — New Chat Isolation: Create a fresh conversation while viewing Ragi
        # ---------------------------------------------------------------------
        new_conv_res = client.post(
            "/api/v1/assistant/conversations",
            json={"title": "Fresh Isolated Chat"},
        )
        assert new_conv_res.status_code == 201
        new_conv = new_conv_res.json()
        assert new_conv["messages"] == []

        r5 = client.post(
            "/api/v1/assistant/chat",
            json={
                "conversation_id": new_conv["id"],
                "message": "uses of this?",
                "mode": "automatic",
                "history": [],
                "context": {
                    "page_type": "food_detail",
                    "route": "/foods/ragi-finger-millet",
                    "food_slug": "ragi-finger-millet",
                    "selected_entity": {
                        "type": "food",
                        "id": "ragi-finger-millet",
                        "name": "Ragi (Finger Millet)",
                    },
                },
            },
        )
        assert r5.status_code == 200
        d5 = r5.json()
        assert "Ragi (Finger Millet)" in d5["reply"]
        assert "Banana" not in d5["reply"]
        assert "Carrot (Orange)" not in d5["reply"]

        # ---------------------------------------------------------------------
        # TEST 6 — Explicit Software Question: "What does this GharPlate feature do?"
        # ---------------------------------------------------------------------
        r6 = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "What does this GharPlate feature do?",
                "mode": "automatic",
                "history": [],
                "context": {
                    "page_type": "food_detail",
                    "route": "/foods/carrot-orange",
                    "food_slug": "carrot-orange",
                },
            },
        )
        assert r6.status_code == 200
        d6 = r6.json()
        assert d6["resolved_intent"] == "software_help"
        assert "About This GharPlate Feature" in d6["reply"]

        # ---------------------------------------------------------------------
        # TEST 7 — Missing Context: No selected item + "Is this good?" -> asks clarification
        # ---------------------------------------------------------------------
        r7 = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "Is this good?",
                "mode": "automatic",
                "history": [],
                "context": {
                    "page_type": "home",
                    "route": "/",
                },
            },
        )
        assert r7.status_code == 200
        d7 = r7.json()
        assert d7["resolved_intent"] == "needs_clarification"
        assert "Which food, recipe, packaged product, or body region" in d7["reply"]


def test_part_b4_and_c_ollama_model_evaluation_and_voice_endpoints():
    """
    Verifies:
    - `/api/v1/assistant/models/evaluate` returns audited Ollama model capabilities & recommendations
    - `/api/v1/assistant/voice/status` returns free STT/TTS capabilities, languages (`en-IN`, `hi-IN`, `kn-IN`),
      and confirmation safety policy
    - `/api/v1/assistant/voice/transcribe` normalizes phonetic Indian food names (`raggi` -> `ragi`, `idly` -> `idli`)
    """
    with patch(
        "app.services.ollama_assistant_service.discover_ollama_models",
        return_value=(True, ["qwen2.5vl:7b"], None),
    ):
        eval_res = client.get("/api/v1/assistant/models/evaluate")
        assert eval_res.status_code == 200
        eval_data = eval_res.json()
        assert eval_data["ollama_reachable"] is True
        assert eval_data["recommended_active_model"] == "qwen2.5vl:7b"
        assert len(eval_data["evaluated_models"]) == 1
        assert eval_data["evaluated_models"][0]["multimodal_vision"] is True

    v_status = client.get("/api/v1/assistant/voice/status")
    assert v_status.status_code == 200
    vs_data = v_status.json()
    assert vs_data["voice_enabled"] is True
    lang_codes = {l["code"] for l in vs_data["supported_languages"]}
    assert {"en-IN", "hi-IN", "kn-IN"}.issubset(lang_codes)
    assert "confirmation" in vs_data["confirmation_policy"].lower()

    v_trans = client.post(
        "/api/v1/assistant/voice/transcribe",
        json={
            "transcript_hint": "What are the benefits of raggi and idly for breakfast?",
            "language_code": "en-IN",
        },
    )
    assert v_trans.status_code == 200
    vt_data = v_trans.json()
    assert "ragi" in vt_data["transcript"].lower()
    assert "idli" in vt_data["transcript"].lower()
    assert vt_data["language_code"] == "en-IN"
