import React from 'react';
import type {
  AssistantConversationSummary,
  AssistantSelectedEntity,
  AssistantStatusResponse,
} from '../types/api';

export type DateGroupLabel =
  | 'Today'
  | 'Yesterday'
  | 'Previous 7 Days'
  | 'Older Conversations';

export const DATE_GROUP_ORDER: DateGroupLabel[] = [
  'Today',
  'Yesterday',
  'Previous 7 Days',
  'Older Conversations',
];

const MODE_DESCRIPTIONS: Record<
  'database_only' | 'automatic' | 'online_search',
  string
> = {
  database_only:
    'Queries only verified GharPlate IFCT 2017 foods, recipes, 3D anatomy & personal logs.',
  automatic:
    'Prioritizes GharPlate database records first, with clinical nutrition synthesis.',
  online_search:
    'Combines GharPlate database records with broader web nutrition references.',
};

export interface AssistantWorkspaceSidebarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onCloseSidebarMobile: () => void;
  dockSide: 'right' | 'left';
  onToggleDockSide: () => void;
  conversations: AssistantConversationSummary[];
  groupedConversations: Record<DateGroupLabel, AssistantConversationSummary[]>;
  filteredCount: number;
  activeConversationId: number | null;
  turnsCount: number;
  savedChatsSearch: string;
  onSearchChange: (val: string) => void;
  onStartNewConversation: () => void;
  onSelectConversation: (id: number) => void;
  renamingConvId: number | null;
  renameDraft: string;
  onStartRename: (id: number, currentTitle: string) => void;
  onRenameDraftChange: (val: string) => void;
  onSaveRename: (id: number) => void;
  onCancelRename: () => void;
  confirmDeleteConvId: number | null;
  onRequestDelete: (id: number) => void;
  onConfirmDelete: (id: number) => void;
  onCancelDelete: () => void;
  formatUpdatedTime: (iso: string) => string;
  getPreviewText: (c: AssistantConversationSummary) => string;
  selectedMode: 'database_only' | 'automatic' | 'online_search';
  onSelectMode: (mode: 'database_only' | 'automatic' | 'online_search') => void;
  status: AssistantStatusResponse | null;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  showModelSettings: boolean;
  onToggleModelSettings: () => void;
  showVoiceSettings: boolean;
  onToggleVoiceSettings: () => void;
  voiceLanguage: 'en-IN' | 'hi-IN' | 'kn-IN';
  onChangeVoiceLanguage: (lang: 'en-IN' | 'hi-IN' | 'kn-IN') => void;
  speechRate: number;
  onChangeSpeechRate: (rate: number) => void;
  speechVolume: number;
  onChangeSpeechVolume: (vol: number) => void;
  availableVoices: SpeechSynthesisVoice[];
  selectedVoiceURI: string;
  onChangeVoiceURI: (uri: string) => void;
  autoSpeakReplies: boolean;
  onToggleAutoSpeak: () => void;
  autoSendVoice: boolean;
  onToggleAutoSendVoice: () => void;
  voiceSilenceDelayMs: number;
  onChangeSilenceDelayMs: (ms: number) => void;
  voiceState: string;
  isSpeechPaused: boolean;
  onPauseSpeech: () => void;
  onResumeSpeech: () => void;
  onStopSpeech: () => void;
  onReplayLastSpeech: () => void;
  canReplaySpeech: boolean;
  activeContextSummary: string;
  activeEntity: AssistantSelectedEntity | null;
  activeMemberName?: string | null;
  activeMemberDiet?: string | null;
  pageType?: string | null;
}

export const AssistantWorkspaceSidebar: React.FC<
  AssistantWorkspaceSidebarProps
> = ({
  sidebarOpen,
  onToggleSidebar,
  onCloseSidebarMobile,
  dockSide,
  onToggleDockSide,
  conversations,
  groupedConversations,
  filteredCount,
  activeConversationId,
  turnsCount,
  savedChatsSearch,
  onSearchChange,
  onStartNewConversation,
  onSelectConversation,
  renamingConvId,
  renameDraft,
  onStartRename,
  onRenameDraftChange,
  onSaveRename,
  onCancelRename,
  confirmDeleteConvId,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  formatUpdatedTime,
  getPreviewText,
  selectedMode,
  onSelectMode,
  status,
  selectedModel,
  onSelectModel,
  showModelSettings,
  onToggleModelSettings,
  showVoiceSettings,
  onToggleVoiceSettings,
  voiceLanguage,
  onChangeVoiceLanguage,
  speechRate,
  onChangeSpeechRate,
  speechVolume,
  onChangeSpeechVolume,
  availableVoices,
  selectedVoiceURI,
  onChangeVoiceURI,
  autoSpeakReplies,
  onToggleAutoSpeak,
  autoSendVoice,
  onToggleAutoSendVoice,
  voiceSilenceDelayMs,
  onChangeSilenceDelayMs,
  voiceState,
  isSpeechPaused,
  onPauseSpeech,
  onResumeSpeech,
  onStopSpeech,
  onReplayLastSpeech,
  canReplaySpeech,
  activeContextSummary,
  activeEntity,
  activeMemberName,
  activeMemberDiet,
  pageType,
}) => {
  const [showContextDetails, setShowContextDetails] = React.useState(false);

  if (!sidebarOpen) {
    return null;
  }

  return (
    <>
      {/* Mobile-only overlay backdrop when sidebar is open on small viewports */}
      <div
        data-testid="assistant-sidebar-mobile-backdrop"
        aria-hidden="true"
        onClick={onCloseSidebarMobile}
        className="fixed inset-0 z-20 bg-stone-950/35 backdrop-blur-[1px] sm:hidden"
      />

      <aside
        data-testid="assistant-sidebar"
        aria-label="Ask GharPlate Control Sidebar"
        className="fixed inset-y-0 left-0 z-30 sm:relative sm:z-10 flex w-72 max-w-[85vw] sm:w-72 shrink-0 flex-col border-r border-stone-200/90 bg-[#F3EFEA] text-stone-800 h-full overflow-hidden select-none shadow-2xl sm:shadow-none transition-all duration-200"
      >
        {/* 1. Sidebar Header & Primary Action: + New Chat */}
        <div className="p-3.5 border-b border-stone-200/90 bg-white/90 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-950">
              Chats &amp; Settings
            </span>
            <button
              type="button"
              data-testid="assistant-sidebar-collapse-btn"
              aria-label="Hide Assistant Sidebar"
              onClick={onToggleSidebar}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[10px] font-extrabold text-stone-700 hover:bg-stone-100 hover:text-stone-950 transition"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <polyline points="15 9 12 12 15 15" />
              </svg>
              <span>Hide Sidebar</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="assistant-new-conversation-btn"
              onClick={onStartNewConversation}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-900 px-3 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-800 transition"
            >
              <span>＋</span>
              <span>New Chat</span>
            </button>

            {activeConversationId !== null && turnsCount > 0 && (
              <button
                type="button"
                data-testid="assistant-delete-conversation-btn"
                title="Delete active conversation"
                onClick={() => onRequestDelete(activeConversationId)}
                className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* 2. Scrollable Saved Chats List */}
        <div
          data-testid="assistant-saved-chats-panel"
          className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[160px]"
        >
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500">
              Saved Chats ({conversations.length})
            </span>
          </div>

          <input
            type="search"
            data-testid="saved-chats-search-input"
            value={savedChatsSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search saved chats..."
            className="w-full rounded-xl border border-stone-300/90 bg-white px-2.5 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:border-emerald-700 focus:outline-none"
          />

          {filteredCount === 0 ? (
            <div className="rounded-xl border border-stone-200/80 bg-white/75 p-3 text-center text-[11px] text-stone-500">
              {conversations.length === 0
                ? 'No saved conversations yet.'
                : 'No conversations match your search.'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {DATE_GROUP_ORDER.map((groupLabel) => {
                const items = groupedConversations[groupLabel];
                if (!items || items.length === 0) return null;
                return (
                  <div
                    key={groupLabel}
                    data-testid={`saved-chats-group-${groupLabel
                      .toLowerCase()
                      .replace(/\s+/g, '-')}`}
                    className="space-y-1"
                  >
                    <div className="px-1 text-[9px] font-extrabold uppercase tracking-wider text-stone-400">
                      {groupLabel}
                    </div>
                    <div className="space-y-1">
                      {items.map((c) => {
                        const isSelected = c.id === activeConversationId;
                        const isRenaming = renamingConvId === c.id;
                        const isConfirmingDelete = confirmDeleteConvId === c.id;
                        const previewText = getPreviewText(c);

                        return (
                          <div
                            key={c.id}
                            data-testid={`saved-chat-item-${c.id}`}
                            data-selected={isSelected ? 'true' : 'false'}
                            className={`rounded-xl border p-2.5 transition ${
                              isSelected
                                ? 'border-emerald-700 bg-emerald-50/95 shadow-2xs'
                                : 'border-stone-200/90 bg-white hover:border-emerald-300'
                            }`}
                          >
                            {isRenaming ? (
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  data-testid={`rename-chat-input-${c.id}`}
                                  value={renameDraft}
                                  onChange={(e) =>
                                    onRenameDraftChange(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      onSaveRename(c.id);
                                    } else if (e.key === 'Escape') {
                                      onCancelRename();
                                    }
                                  }}
                                  className="w-full rounded-lg border border-emerald-600 bg-white px-2 py-1 text-xs font-bold text-stone-900 focus:outline-none"
                                />
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    data-testid={`save-rename-chat-btn-${c.id}`}
                                    onClick={() => onSaveRename(c.id)}
                                    className="rounded-lg bg-emerald-800 px-2 py-0.5 text-[10px] font-bold text-white"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={onCancelRename}
                                    className="rounded-lg border border-stone-300 bg-stone-50 px-2 py-0.5 text-[10px] font-bold text-stone-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : isConfirmingDelete ? (
                              <div
                                data-testid={`delete-confirm-box-${c.id}`}
                                className="space-y-1.5 rounded-lg bg-rose-50 border border-rose-200 p-2 text-[11px] text-rose-950"
                              >
                                <div className="font-bold">
                                  Delete “{c.title}”?
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    data-testid={`confirm-delete-chat-btn-${c.id}`}
                                    onClick={() => onConfirmDelete(c.id)}
                                    className="rounded-lg bg-rose-700 px-2 py-0.5 text-[10px] font-extrabold text-white"
                                  >
                                    Confirm Delete
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`cancel-delete-chat-btn-${c.id}`}
                                    onClick={onCancelDelete}
                                    className="rounded-lg border border-stone-300 bg-white px-2 py-0.5 text-[10px] font-bold text-stone-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <button
                                  type="button"
                                  data-testid={`saved-chat-open-${c.id}`}
                                  onClick={() => onSelectConversation(c.id)}
                                  className="w-full text-left space-y-0.5"
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      data-testid={`saved-chat-title-${c.id}`}
                                      className="truncate text-xs font-extrabold text-stone-900"
                                    >
                                      💬 {c.title}
                                    </span>
                                    {isSelected && (
                                      <span
                                        data-testid={`saved-chat-active-badge-${c.id}`}
                                        className="shrink-0 rounded-full bg-emerald-800 px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-white"
                                      >
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <p
                                    data-testid={`saved-chat-preview-${c.id}`}
                                    className="line-clamp-1 text-[10px] text-stone-500"
                                  >
                                    {previewText}
                                  </p>
                                  <div
                                    data-testid={`saved-chat-time-${c.id}`}
                                    className="text-[9px] text-stone-400"
                                  >
                                    {formatUpdatedTime(c.updated_at)} ·{' '}
                                    {c.message_count} msgs
                                  </div>
                                </button>

                                <div className="flex items-center justify-end gap-1 pt-0.5">
                                  <button
                                    type="button"
                                    data-testid={`rename-chat-btn-${c.id}`}
                                    onClick={() => onStartRename(c.id, c.title)}
                                    className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[9px] font-bold text-stone-600 hover:bg-stone-100"
                                  >
                                    Rename
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`delete-chat-btn-${c.id}`}
                                    onClick={() => onRequestDelete(c.id)}
                                    className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 hover:bg-rose-100"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Bottom Pinned Controls: Assistant Mode, Active Context, AI Model & Voice Settings */}
        <div className="border-t border-stone-200/90 bg-white/90 divide-y divide-stone-200/80 shrink-0 text-xs">
          {/* Assistant Mode */}
          <div className="p-3 space-y-1.5">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500">
              Assistant Mode
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-stone-200/75 p-1 text-[10px] font-bold">
              {[
                { id: 'database_only', label: 'My GharPlate DB' },
                { id: 'automatic', label: 'Automatic' },
                { id: 'online_search', label: 'Search Online' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`assistant-mode-${m.id}`}
                  onClick={() =>
                    onSelectMode(
                      m.id as 'database_only' | 'automatic' | 'online_search'
                    )
                  }
                  className={`rounded-lg py-1.5 px-1 transition truncate ${
                    selectedMode === m.id
                      ? 'bg-emerald-900 text-white shadow-2xs font-extrabold'
                      : 'text-stone-700 hover:bg-white/70'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-snug text-stone-500">
              {MODE_DESCRIPTIONS[selectedMode]}
            </p>
          </div>

          {/* Concise Active Context Indicator */}
          <div className="p-3 space-y-1">
            <button
              type="button"
              onClick={() => setShowContextDetails((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500">
                  Active Context
                </div>
                <div className="truncate text-[11px] font-bold text-emerald-950">
                  {activeContextSummary}
                </div>
              </div>
              <span className="text-[10px] font-bold text-stone-400">
                {showContextDetails ? '▾' : '▸'}
              </span>
            </button>
            {showContextDetails && (
              <div className="mt-1.5 rounded-xl bg-stone-100 p-2 text-[10px] text-stone-600 space-y-0.5">
                <div>
                  <strong>Page:</strong> {pageType || 'general'}
                </div>
                {activeEntity && (
                  <div>
                    <strong>Selected:</strong> {activeEntity.name} (
                    {activeEntity.type})
                  </div>
                )}
                {activeMemberName && (
                  <div>
                    <strong>Member:</strong> {activeMemberName} (
                    {activeMemberDiet || 'all diets'})
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Collapsible AI Model & Window Settings */}
          <div data-testid="assistant-model-settings-section" className="p-3">
            <button
              type="button"
              data-testid="assistant-model-settings-toggle"
              onClick={onToggleModelSettings}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500">
                  AI Model
                </div>
                <div className="truncate text-[11px] font-bold text-stone-800">
                  {status?.ollama_reachable
                    ? selectedModel || status.active_model || 'qwen2.5:7b'
                    : 'Local Tool Engine'}
                </div>
              </div>
              <span className="text-[10px] font-bold text-stone-400">
                {showModelSettings ? '▾' : '▸'}
              </span>
            </button>

            <div
              className={
                showModelSettings ? 'mt-2 space-y-2 text-[11px]' : 'hidden'
              }
            >
              {status && status.installed_models.length > 0 ? (
                <select
                  aria-label="Select Ollama Model"
                  data-testid="assistant-model-select"
                  value={selectedModel || status.active_model || ''}
                  onChange={(e) => onSelectModel(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800"
                >
                  {status.installed_models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[10px] text-amber-950">
                  Local deterministic nutrition &amp; anatomy tool engine active.
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] font-bold text-stone-600">
                  Window Dock Side:
                </span>
                <button
                  type="button"
                  data-testid="assistant-dock-toggle"
                  onClick={onToggleDockSide}
                  className="rounded-lg border border-stone-300 bg-white px-2 py-0.5 text-[10px] font-bold text-stone-700 hover:bg-stone-100"
                >
                  {dockSide === 'right'
                    ? 'Docked Right (Switch Left)'
                    : 'Docked Left (Switch Right)'}
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Voice Settings */}
          <div className="p-3">
            <button
              type="button"
              data-testid="assistant-voice-bar-toggle"
              onClick={onToggleVoiceSettings}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500">
                  Voice Settings
                </div>
                <div className="truncate text-[11px] font-bold text-stone-800">
                  {voiceLanguage} ·{' '}
                  {autoSendVoice
                    ? `Auto-Send (${(voiceSilenceDelayMs / 1000).toFixed(1)}s)`
                    : 'Manual Send'}
                </div>
              </div>
              <span className="text-[10px] font-bold text-stone-400">
                {showVoiceSettings ? '▾' : '▸'}
              </span>
            </button>

            <div
              data-testid="assistant-voice-controls-bar"
              className={
                showVoiceSettings
                  ? 'mt-2 pt-2 border-t border-stone-200/80 space-y-2 text-[11px]'
                  : 'hidden'
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-stone-700">
                  Auto-Send on Silence:
                </span>
                <button
                  type="button"
                  data-testid="assistant-voice-autosend-toggle"
                  onClick={onToggleAutoSendVoice}
                  className={`rounded-lg px-2.5 py-0.5 text-[10px] font-extrabold transition ${
                    autoSendVoice
                      ? 'bg-emerald-900 text-white'
                      : 'border border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  {autoSendVoice ? 'ON' : 'OFF'}
                </button>
              </div>

              <label className="flex items-center justify-between gap-2 font-bold text-stone-700">
                <span>Silence Pause:</span>
                <select
                  aria-label="Voice Silence Delay"
                  data-testid="assistant-voice-silence-ms-select"
                  value={String(voiceSilenceDelayMs)}
                  onChange={(e) =>
                    onChangeSilenceDelayMs(Number(e.target.value))
                  }
                  className="rounded-lg border border-stone-300 bg-white px-2 py-0.5 text-[11px] font-bold text-stone-800"
                >
                  <option value="1000">1.0s</option>
                  <option value="1200">1.2s</option>
                  <option value="1500">1.5s</option>
                  <option value="2000">2.0s</option>
                </select>
              </label>

              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-stone-700">Auto-Speak:</span>
                <button
                  type="button"
                  data-testid="assistant-voice-autospeak-toggle"
                  onClick={onToggleAutoSpeak}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold transition ${
                    autoSpeakReplies
                      ? 'bg-amber-300 text-stone-950'
                      : 'border border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  {autoSpeakReplies ? '🔊 Auto-Speak ON' : '🔈 Auto-Speak OFF'}
                </button>
              </div>

              <label className="flex items-center justify-between gap-2 font-bold text-stone-700">
                <span>Language:</span>
                <select
                  aria-label="Voice Language"
                  data-testid="assistant-voice-lang-select"
                  value={voiceLanguage}
                  onChange={(e) =>
                    onChangeVoiceLanguage(
                      e.target.value as 'en-IN' | 'hi-IN' | 'kn-IN'
                    )
                  }
                  className="rounded-lg border border-stone-300 bg-white px-2 py-0.5 text-[11px] font-bold text-stone-800"
                >
                  <option value="en-IN">English (India)</option>
                  <option value="hi-IN">हिन्दी (Hindi)</option>
                  <option value="kn-IN">ಕನ್ನಡ (Kannada)</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex items-center justify-between gap-1 font-bold text-stone-700">
                  <span>Speed:</span>
                  <select
                    aria-label="Voice Speaking Rate"
                    data-testid="assistant-voice-rate-select"
                    value={String(speechRate)}
                    onChange={(e) => onChangeSpeechRate(Number(e.target.value))}
                    className="rounded-lg border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-stone-800"
                  >
                    <option value="0.9">0.9×</option>
                    <option value="1">1.0×</option>
                    <option value="1.15">1.15×</option>
                  </select>
                </label>

                <label className="flex items-center justify-between gap-1 font-bold text-stone-700">
                  <span>Vol:</span>
                  <select
                    aria-label="Voice Volume"
                    data-testid="assistant-voice-volume-select"
                    value={String(speechVolume)}
                    onChange={(e) =>
                      onChangeSpeechVolume(Number(e.target.value))
                    }
                    className="rounded-lg border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-stone-800"
                  >
                    <option value="1">100%</option>
                    <option value="0.75">75%</option>
                    <option value="0.5">50%</option>
                  </select>
                </label>
              </div>

              {availableVoices.length > 0 && (
                <select
                  aria-label="Select System Voice"
                  data-testid="assistant-system-voice-select"
                  value={selectedVoiceURI}
                  onChange={(e) => onChangeVoiceURI(e.target.value)}
                  className="w-full truncate rounded-lg border border-stone-300 bg-white px-2 py-1 text-[10px] font-bold text-stone-800"
                >
                  <option value="">Auto System Voice</option>
                  {availableVoices.map((v, idx) => (
                    <option
                      key={`${v.voiceURI || v.name}-${idx}`}
                      value={v.voiceURI || v.name}
                    >
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              )}

              <div className="flex flex-wrap items-center gap-1 pt-1">
                {voiceState === 'Speaking' && !isSpeechPaused && (
                  <button
                    type="button"
                    data-testid="assistant-tts-pause-btn"
                    onClick={onPauseSpeech}
                    className="rounded-lg bg-emerald-800 px-2 py-0.5 text-[10px] font-bold text-white"
                  >
                    ⏸ Pause
                  </button>
                )}
                {isSpeechPaused && (
                  <button
                    type="button"
                    data-testid="assistant-tts-resume-btn"
                    onClick={onResumeSpeech}
                    className="rounded-lg bg-amber-300 px-2 py-0.5 text-[10px] font-extrabold text-stone-950"
                  >
                    ▶ Resume
                  </button>
                )}
                {(voiceState === 'Speaking' || isSpeechPaused) && (
                  <button
                    type="button"
                    data-testid="assistant-tts-stop-btn"
                    onClick={onStopSpeech}
                    className="rounded-lg bg-rose-600 px-2 py-0.5 text-[10px] font-extrabold text-white"
                  >
                    ⏹ Stop
                  </button>
                )}
                <button
                  type="button"
                  data-testid="assistant-tts-replay-btn"
                  onClick={onReplayLastSpeech}
                  disabled={!canReplaySpeech}
                  className="rounded-lg border border-stone-300 bg-white px-2 py-0.5 text-[10px] font-bold text-stone-700 disabled:opacity-40"
                >
                  ↺ Replay
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
