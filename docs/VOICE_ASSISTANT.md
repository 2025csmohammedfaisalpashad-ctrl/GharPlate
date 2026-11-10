# Voice Conversation Architecture & Safety Guardrails (`VOICE_ASSISTANT.md`)

## 1. Overview

GharPlate's AI Assistant (`frontend/src/components/AssistantDrawer.tsx` and `backend/app/services/ollama_assistant_service.py`) supports **full two-way voice conversation** using 100% free, zero-paid-key speech technologies while sharing the exact same conversation history, active page context (`selected_entity`), and allowlisted database tools as typed chat.

---

## 2. Speech-to-Text (Voice Input) Architecture

1. **Primary Free Browser Recognition (`SpeechRecognition` / `webkitSpeechRecognition`)**:
   - Activated **only** when the user explicitly clicks the microphone button (`data-testid="assistant-mic-toggle"`). Never listens in the background.
   - Supports **English (India) (`en-IN`)**, **Hindi (`hi-IN`)**, and **Kannada (`kn-IN`)** via the voice language selector (`data-testid="assistant-voice-lang-select"`).
   - Displays live interim transcription (`data-testid="assistant-voice-live-transcript"`) and populates the editable input box so the user can review or edit recognized text before sending, or opt into auto-send.
2. **Backend Phonetic Normalization (`POST /api/v1/assistant/voice/transcribe`)**:
   - Normalizes common Indian food phonetic variations from speech recognition (e.g., `"raggi"` -> `"ragi"`, `"idly"` -> `"idli"`, `"kichdi"` -> `"khichdi"`, `"moong dhal"` -> `"moong dal"`, `"channa"` -> `"chana"`).
   - Also detects if optional offline `faster-whisper` / `openai-whisper` packages are installed in the Python environment (`GET /api/v1/assistant/voice/status`).

---

## 3. Text-to-Speech (Voice Output) Architecture

1. **Free System Voice Synthesis (`window.speechSynthesis`)**:
   - Strips raw Markdown symbols (`#`, `**`, backticks, table pipes) so spoken replies sound natural and conversational.
   - Automatically selects matching installed system voices for `en-IN`, `hi-IN`, or `kn-IN` (with graceful fallback to `en-US` / default system voice).
2. **Full Playback Controls**:
   - **Per-Message Controls**: Every assistant message includes a `🔊 Speak` / `⏹ Stop` button (`data-testid="speak-answer-btn"`).
   - **Active Playback Bar**: While speaking, the header displays `⏸ Pause` / `▶ Resume`, `⏹ Stop`, and `↺ Replay` buttons.
   - **Voice Settings Panel (`data-testid="assistant-voice-settings-panel"`)**: Configurable speech rate (`0.75×` to `1.5×`), volume (`0%` to `100%`), and `Auto-speak ON/OFF` toggle (`data-testid="assistant-voice-autospeak-toggle"`).
   - **Barge-In Interrupt**: Starting the microphone while the assistant is speaking immediately stops `window.speechSynthesis` so the user can interrupt naturally.

---

## 4. Explicit Voice States & Confirmation Safety Policy

- **Visible Voice Status Indicator (`data-testid="assistant-voice-state-badge"`)**: Clearly shows `Ready`, `Listening`, `Processing speech`, `Reviewing transcription`, `Thinking`, `Speaking`, or `Error`.
- **Mandatory Confirmation Before Saving Records**: Spoken commands that log food (`"Log two idlis for breakfast"`), water (`"Add 250 ml water"`), blood pressure (`"My morning BP was 128 over 82"`), blood glucose (`"My fasting sugar was 108 mg/dL"`), habits, or goals **always** generate a confirmation preview (`requires_user_confirmation: true`) and never write to the database without explicit user confirmation.
