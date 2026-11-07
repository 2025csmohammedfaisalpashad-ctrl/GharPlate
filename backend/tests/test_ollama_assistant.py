"""
Automated Test Suite for the Local Ollama-Powered GharPlate AI Assistant.
Covers:
- Ollama connection status & dynamic model discovery (online and offline states)
- Allowlisted backend tool execution (`search_food_database`, `get_food_details`, `lookup_product_by_barcode`,
  `get_ingredients_and_allergens`, `get_nutritional_composition`, `get_condition_guidance`, etc.)
- Context-aware product conversation on Pineapple Cake (`pkg-pineapple-cake-6b35c3`)
- Three search modes (`database_only`, `automatic`, `online_search`)
- Native Ollama tool-calling & fallback synthesis
- Unapproved tool rejection and medical-safety guardrails
"""

from unittest.mock import MagicMock, patch
import httpx
from app.main import app
from app.schemas.api_schemas import AssistantChatRequest
from app.services.ollama_assistant_service import (
    chat_with_gharplate_assistant,
    execute_allowlisted_tool,
)
from app.db.session import SessionLocal
from tests.conftest import AuthenticatedTestClient

client = AuthenticatedTestClient(app)


def test_01_assistant_status_and_model_discovery():
    """
    Tests /api/v1/assistant/status and /api/v1/assistant/models when Ollama is reachable vs unreachable.
    """
    with patch(
        "app.services.ollama_assistant_service.discover_ollama_models",
        return_value=(True, ["llama3.2:latest", "qwen2.5:7b"], None),
    ):
        st_resp = client.get("/api/v1/assistant/status")
        assert st_resp.status_code == 200
        st_data = st_resp.json()
        assert st_data["ollama_reachable"] is True
        assert st_data["active_model"] == "llama3.2:latest"
        assert "llama3.2:latest" in st_data["installed_models"]
        assert len(st_data["allowlisted_tools"]) >= 27

    with patch(
        "app.services.ollama_assistant_service.discover_ollama_models",
        return_value=(False, [], "Connection refused"),
    ):
        off_resp = client.get("/api/v1/assistant/status")
        assert off_resp.status_code == 200
        off_data = off_resp.json()
        assert off_data["ollama_reachable"] is False
        assert off_data["remediation_command"] == "ollama serve"


def test_02_context_aware_pineapple_cake_conversation_and_missing_nutrition_explanation():
    """
    Verifies that when a user is on the Pineapple Cake page (`pkg-pineapple-cake-6b35c3`) and asks:
    - 'What are the ingredients in this cake? Does it contain milk, egg, or soy?'
    - 'What is the barcode and why are the nutritional values missing?'
    the assistant invokes the real backend tools (`get_food_details`, `get_ingredients_and_allergens`,
    `get_nutritional_composition`), reports the exact ingredients, flags soy from the label declaration,
    states the barcode `8906005618726`, and explains honestly that nutrients are NULL (never guessing).
    """
    with patch(
        "app.services.ollama_assistant_service.discover_ollama_models",
        return_value=(False, [], "Offline during CI test"),
    ):
        resp = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "What are the ingredients in this cake? Does it contain milk, egg, or soy, what is the barcode, and why are the nutritional values missing?",
                "mode": "database_only",
                "history": [],
                "context": {
                    "current_path": "/foods/pkg-pineapple-cake-6b35c3",
                    "food_slug": "pkg-pineapple-cake-6b35c3",
                },
            },
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["mode_used"] == "database_only"
        tool_names = [t["tool_name"] for t in data["tool_traces"]]
        assert "get_food_details" in tool_names
        assert "get_ingredients_and_allergens" in tool_names
        assert "get_nutritional_composition" in tool_names

        reply = data["reply"]
        assert "Pineapple Cake" in reply
        assert "8906005618726" in reply
        assert "REFINED WHEAT FLOUR (MAIDA)" in reply
        assert "soy" in reply.lower()
        assert "NULL" in reply or "not yet been captured" in reply
        assert len(data["sources"]) >= 1


def test_03_assistant_modes_database_only_vs_online_search():
    """
    Verifies that:
    - `database_only` mode blocks external search tools (`search_external_products`, `search_external_web_sources`).
    - `online_search` mode invokes external search and web search tools and includes source attribution.
    """
    db = SessionLocal()
    try:
        out, trace, _ = execute_allowlisted_tool(
            db,
            "search_external_web_sources",
            {"query": "Winkles Pineapple Cake nutrition"},
            mode="database_only",
        )
        assert out.get("blocked_by_mode") is True
        assert trace.status == "blocked"

        # Test unapproved arbitrary tool name is strictly blocked
        bad_out, bad_trace, _ = execute_allowlisted_tool(
            db,
            "execute_raw_sql",
            {"sql": "DROP TABLE food_items"},
            mode="automatic",
        )
        assert bad_trace.status == "blocked"
        assert "not in the allowlisted" in bad_out["error"]
    finally:
        db.close()

    with patch(
        "app.services.ollama_assistant_service.discover_ollama_models",
        return_value=(False, [], "Offline"),
    ):
        online_resp = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "Can you find Pineapple Cake nutrition information online?",
                "mode": "online_search",
                "history": [],
                "context": {"food_slug": "pkg-pineapple-cake-6b35c3"},
            },
        )
        assert online_resp.status_code == 200
        online_data = online_resp.json()
        assert online_data["mode_used"] == "online_search"
        executed = [t["tool_name"] for t in online_data["tool_traces"]]
        assert "search_external_web_sources" in executed


def test_04_ollama_live_chat_and_native_tool_calling_integration():
    """
    Mocks a connected local Ollama `/api/chat` server that emits a native `tool_calls` request
    for `get_condition_guidance` on `fever_acute_recovery` and then returns the final LLM explanation.
    """
    first_ollama_response = MagicMock()
    first_ollama_response.status_code = 200
    first_ollama_response.json.return_value = {
        "message": {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "function": {
                        "name": "get_condition_guidance",
                        "arguments": {"condition_code": "fever_acute_recovery"},
                    }
                }
            ],
        }
    }

    second_ollama_response = MagicMock()
    second_ollama_response.status_code = 200
    second_ollama_response.json.return_value = {
        "message": {
            "role": "assistant",
            "content": (
                "Based on ICMR-NIN Dietary Guidelines for Indians (2024), reviewed supportive foods for "
                "Fever recovery include **Khichdi (Moong Dal & Rice)**, **Idli**, **Rasam**, **Buttermilk**, "
                "and **Ripe Banana**."
            ),
        }
    }

    with (
        patch(
            "app.services.ollama_assistant_service.discover_ollama_models",
            return_value=(True, ["llama3.2:latest"], None),
        ),
        patch.object(
            httpx.Client,
            "post",
            side_effect=[first_ollama_response, second_ollama_response],
        ),
    ):
        db = SessionLocal()
        try:
            res_obj = chat_with_gharplate_assistant(
                db,
                AssistantChatRequest(
                    message="Which foods are recommended for fever recovery?",
                    mode="database_only",
                    history=[],
                ),
            )
            data = res_obj.model_dump(mode="json")
        finally:
            db.close()

        assert data["ollama_connected"] is True
        assert data["model_used"] == "llama3.2:latest"
        assert "Khichdi" in data["reply"]
        assert any(t["tool_name"] == "get_condition_guidance" for t in data["tool_traces"])


def test_05_medical_safety_restriction_in_assistant():
    """
    Verifies that asking the assistant to diagnose an illness or prescribe insulin dosage
    triggers an explicit medical safety notice and non-diagnostic disclaimer.
    """
    with patch(
        "app.services.ollama_assistant_service.discover_ollama_models",
        return_value=(False, [], "Offline"),
    ):
        resp = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "Can you diagnose my fever and prescribe my insulin dose after eating rice?",
                "mode": "database_only",
                "history": [],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "Medical Safety Notice" in body["reply"]
        assert "cannot diagnose" in body["reply"]
        assert "not a medical diagnosis" in body["medical_disclaimer"].lower()
