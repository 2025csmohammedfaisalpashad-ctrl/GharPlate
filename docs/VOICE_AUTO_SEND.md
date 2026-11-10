# GharPlate Voice Auto-Send Architecture (`docs/VOICE_AUTO_SEND.md`)

## Overview

The **Ask GharPlate Assistant** supports hands-free **Automatic Voice Send on Silence** (`autoSendVoice`, enabled by default) so users can click the microphone once, speak naturally, pause for `1.2s` (configurable between `1.0s` and `2.0s`), and have their question automatically transcribed, sent to the AI assistant, and optionally spoken back.

---

## 1. End-to-End Voice State Machine

The voice state badge (`data-testid="assistant-voice-state-badge"`) transitions deterministically through:

1. **`Ready` (`idle`)**: Microphone is inactive and ready to start recording.
2. **`Listening` (`listening`)**: User clicked `assistant-mic-toggle`; browser `SpeechRecognition` / `webkitSpeechRecognition` (or `MediaRecorder` fallback to `/api/v1/assistant/voice/transcribe`) is actively capturing speech and streaming interim + final text into the composer (`assistant-chat-input`) and live transcript preview bar (`assistant-voice-live-bar`).
3. **`Processing speech` (`processing`)**: Speech pause detected or recognition segment finalized; transcript is normalized and verified non-empty.
4. **`Sending` (`sending`)**: Auto-send timer elapsed (`1.2s` default); the assistant locks the session (`voiceSessionSubmittedRef.current = true`), stops the recognizer cleanly, and invokes `handleSend(spokenText, { fromVoice: true })`.
5. **`Thinking` (`thinking`)**: `/api/v1/assistant/chat` is resolving active page/entity context and generating the grounded response.
6. **`Speaking` (`speaking`)**: If `Auto-Speak Responses` (`autoSpeak`) is enabled, browser `speechSynthesis` reads the cleaned response aloud with `Stop` (`assistant-voice-stop-speaking`) and `Replay` (`assistant-voice-replay`) controls.
7. **`Error` (`error`)**: Displays clear recovery guidance if microphone permission is denied or no speech was detected.

---

## 2. Silence Detection & Safeguards

| Safeguard | Implementation in `AssistantDrawer.tsx` |
| --- | --- |
| **Configurable Silence Window** | Default `1200ms` (`1.2s`), adjustable in the sidebar Voice Settings (`1.0s`, `1.2s`, `1.5s`, `2.0s`, `data-testid="assistant-voice-silence-ms-select"`). |
| **Single-Send Lock (`voiceSessionSubmittedRef`)** | Every recording session resets `voiceSessionSubmittedRef.current = false` on start and sets `true` immediately when `triggerVoiceAutoSend` fires, preventing duplicate sends if `onend` fires right after the silence timer. |
| **Empty/Noise Guard** | If `latestVoiceTranscriptRef.current.trim()` is empty when silence or `onend` occurs, no message is sent and the state resets cleanly. |
| **Explicit Cancel (`assistant-mic-cancel`)** | Clicking `Cancel` sets `voiceCancelledRef.current = true`, clears `silenceTimerRef`, aborts `SpeechRecognition` / `MediaRecorder`, clears the draft transcript, and never submits. |
| **Manual Mode Toggle** | Users who prefer reviewing transcripts before sending can toggle **Auto-Send on Silence** (`data-testid="assistant-voice-autosend-toggle"`) off in Voice Settings; transcripts then remain in the input box until `Enter` or `Send` is pressed. |

---

## 3. Clinical & Database Safety Guardrails

Spoken requests that imply a database write—such as:
- *"My morning blood pressure was 128 over 82"*
- *"My fasting sugar is 108 mg/dL"*
- *"Log 2 idlis and sambar for breakfast"*
- *"Add 500 ml water"*

automatically submit the **voice prompt** to `/api/v1/assistant/chat`, which returns a structured **Confirmation Required** preview card (`requires_user_confirmation: true`, `data-testid="assistant-confirmation-card-{idx}"`). No health measurement or food log is ever written to SQLite until the user explicitly clicks **Confirm & Save** (`data-testid="confirm-assistant-action-btn"`).
