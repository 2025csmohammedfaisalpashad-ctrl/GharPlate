# GharPlate — AI Assistant Workspace & Collapsible Sidebar Architecture

## 1. Overview

The **Ask GharPlate** AI Assistant ([AssistantWorkspacePanel.tsx](../frontend/src/components/AssistantWorkspacePanel.tsx) and [AssistantWorkspaceSidebar.tsx](../frontend/src/components/AssistantWorkspaceSidebar.tsx)) provides a clean, side-by-side (`Assistant sidebar | Main conversation`) workspace with a persistent **Show/Hide Sidebar** toggle and a **`+ New Chat`** action that remains accessible even when the sidebar is collapsed.

## 2. Collapsible Sidebar, Persistent Header Toggle & Header `+ New Chat` When Collapsed

- **Main Conversation Header**:
  1. **Sidebar Toggle (`data-testid="assistant-sidebar-toggle"`)**: Displays a sidebar layout icon (`◧`) and text (`Hide Sidebar` when expanded, `Show Sidebar` when collapsed). Clicking it collapses or reopens the assistant sidebar. The button is **never removed** when the sidebar is collapsed.
  2. **`+ New Chat` in Header When Collapsed (`data-testid="assistant-new-conversation-btn"`)**:
     - When `sidebarOpen === true` (expanded), `+ New Chat` is rendered prominently at the top of the left sidebar (`AssistantWorkspaceSidebar.tsx`).
     - When `sidebarOpen === false` (collapsed), `+ New Chat` (`data-testid="assistant-new-conversation-btn"`) is rendered directly in the main conversation header right next to `Show Sidebar` so there is **never a state where `+ New Chat` is hidden** and **never two duplicate visible `+ New Chat` buttons at once**.
     - Clicking `+ New Chat` while collapsed starts a brand-new conversation (`POST /api/v1/assistant/conversations`), clears the active message viewport (`data-testid="assistant-messages-viewport"`), preserves all previous saved conversations in `Saved Chats`, updates `activeConversationId` and `assistant-header-conversation-title`, and focuses the message input (`textareaRef.current.focus()`).
  3. **`Ask GharPlate` Title (`h2`) & Active Conversation Title Badge (`data-testid="assistant-header-conversation-title"`)**.
  4. **Compact Connection / Model Status Pill (`data-testid="assistant-connection-status-pill"`)**, active context badge (`data-testid="assistant-active-context-badge"`), and **Close Assistant Control (`data-testid="assistant-close-btn"`)**.
- **Expanded State (`data-sidebar-state="expanded"`)**:
  - **Left Assistant Sidebar (`data-testid="assistant-sidebar"`)**:
    - `+ New Chat` (`data-testid="assistant-new-conversation-btn"`) and `Hide Sidebar` button (`data-testid="assistant-sidebar-collapse-btn"`).
    - `Saved Chats` (`data-testid="assistant-saved-chats-panel"`) with search (`data-testid="saved-chats-search-input"`), date groups (`Today`, `Yesterday`, `Previous 7 Days`, `Older Conversations`), inline rename, and two-step delete confirmation.
    - `Assistant Mode` (`My GharPlate DB`, `Automatic`, `Search Online`).
    - `Active Context` summary with selected 3D anatomy structure, food, condition, or profile details.
    - Collapsible `AI Model` settings (`data-testid="assistant-model-settings-section"`) including window dock preference (`data-testid="assistant-dock-toggle"`).
    - Collapsible `Voice Settings` (`data-testid="assistant-voice-controls-bar"`).
  - **Right Main Conversation (`data-testid="assistant-main-conversation"`)**:
    - Scrollable conversation history (`data-testid="assistant-messages-viewport"`), follow-up suggestions, and fixed bottom composer.
- **Collapsed State (`data-sidebar-state="collapsed"`)**:
  - When `sidebarOpen === false`, `AssistantWorkspaceSidebar` returns `null`, genuinely removing `data-testid="assistant-sidebar"` from the layout so `data-testid="assistant-main-conversation"` expands to `100%` of the assistant window width (`flex-1 w-full`).
  - Active conversation history, unsent composer draft text, and voice/model settings are preserved across collapse/reopen, and the user's sidebar preference is persisted in `localStorage` (`gharplate_assistant_sidebar_open`).

## 3. Keyboard & Voice Composer Behaviour

- **Keyboard**: `Enter` sends non-empty messages, `Shift+Enter` inserts a newline, IME composition (`isComposing` / `keyCode === 229`) and empty strings are ignored, duplicate submissions while loading are blocked, and failed requests restore the user's draft text into the composer.
- **Voice**: The microphone button (`data-testid="assistant-mic-toggle"`) stays in the bottom composer even when the sidebar is collapsed, supporting **Auto-Send on Silence** (`1.2s` default pause), **Auto-Speak**, and `en-IN` / `hi-IN` / `kn-IN` recognition.
