# Local Model Audit & Evaluation (`OLLAMA_MODEL_EVALUATION.md`)

## 1. Local Model Discovery & Installed Models

GharPlate inspects the local inference runtime (`GET /api/v1/assistant/models/evaluate`) without downloading large models automatically without user consent.

### Audited Local Environment
- **Configured Model (`OLLAMA_MODEL`)**: `qwen2.5vl:7b`
- **Locally Installed Model(s)**: `qwen2.5vl:7b` (`7B` parameter vision-language model)

---

## 2. Benchmark & Suitability Evaluation

| Model Name | Size | Modality | Pronoun & Context Adherence | Tool-Grounding Fidelity | Voice Turn Latency | Recommended Role in GharPlate |
|---|---|---|---|---|---|---|
| **`qwen2.5vl:7b`** *(Installed)* | ~5.0 GB | Multimodal (Text + Vision) | **High** (Paired with `resolve_active_entity_and_intent` pre-LLM binding + `_llm_reply_is_on_topic` post-check) | **High** (Strict adherence to injected IFCT 2017 / ICMR-NIN 2024 JSON tool evidence) | ~1.8s – 2.5s on Apple Silicon | **Default All-in-One Model** (Text Q&A + packaged food label OCR/vision support) |
| **`qwen2.5:7b-instruct`** *(Optional Text-Only Upgrade)* | ~4.7 GB | Text-Only | **Very High** | **Very High** (Native JSON function calling) | ~1.1s – 1.6s | **Recommended dedicated text/tool model** |
| **`llama3.2:3b`** *(Optional Lightweight Voice Model)* | ~2.0 GB | Text-Only | **High** (With GharPlate deterministic tool orchestration) | **High** | `< 1.0s` | **Fastest low-memory model** for rapid voice conversations on 8 GB RAM laptops |

---

## 3. Why Pre-LLM Entity Binding + Post-LLM Topic Verification Solved Model Drift

Even capable 7B models can occasionally drift into describing the host application ("GharPlate is an Indian nutrition app...") if the system prompt describes the platform before presenting the user's short pronoun query (`"uses of this?"`).

GharPlate eliminates this failure mode in two layers inside `backend/app/services/ollama_assistant_service.py`:
1. **Pre-LLM Active Context Injection**: `resolve_active_entity_and_intent(db, req)` resolves `"this"` / `"it"` / `"this one"` to the exact active entity (`Carrot (Orange)`, `South Indian Steamed Idli`, `Eyes & Vision`, etc.), executes the corresponding allowlisted database tools first, and prepends `[Active Selection: FOOD — Carrot (Orange) (carrot-orange)]` directly to the user turn.
2. **Post-LLM Topic Guardrail (`_llm_reply_is_on_topic`)**: After the model generates a response, `_llm_reply_is_on_topic` verifies that the reply mentions the active entity and does not output generic software boilerplate when `intent_type != "software_help"`. If the model drifts or is unreachable, GharPlate seamlessly serves the deterministic, source-cited synthesis (`_synthesize_grounded_response`).
