import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  OPEN_ASSISTANT_EVENT,
  type OpenAssistantEventDetail,
  deriveStructuredPageContext,
  usePublishedAssistantContext,
} from '../hooks/useAssistantContext';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  AssistantChatMessage,
  AssistantConversationSummary,
  AssistantMessageRecord,
  AssistantSelectedEntity,
  AssistantSourceReference,
  AssistantStatusResponse,
  AssistantToolExecutionTrace,
  AssistantVoiceStatusResponse,
} from '../types/api';
import {
  AssistantMarkdown,
  cleanMarkdownForSpeech,
} from './AssistantDrawer';
import {
  AssistantWorkspaceSidebar,
  type DateGroupLabel,
} from './AssistantWorkspaceSidebar';

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modeUsed?: string | null;
  modelUsed?: string | null;
  ollamaConnected?: boolean;
  resolvedEntity?: AssistantSelectedEntity | null;
  resolvedIntent?: string | null;
  toolTraces?: AssistantToolExecutionTrace[];
  sources?: AssistantSourceReference[];
}

export type VoiceWorkspaceState =
  | 'Ready'
  | 'Listening'
  | 'Processing speech'
  | 'Sending'
  | 'Reviewing transcription'
  | 'Thinking'
  | 'Speaking'
  | 'Error';

const STORAGE_WIDTH_KEY = 'gharplate_assistant_width_px';
const STORAGE_DOCK_KEY = 'gharplate_assistant_dock_side';
const STORAGE_SIDEBAR_OPEN_KEY = 'gharplate_assistant_sidebar_open';
const STORAGE_VOICE_AUTOSPEAK_KEY = 'gharplate_assistant_voice_autospeak';
const STORAGE_VOICE_AUTOSEND_KEY = 'gharplate_assistant_voice_autosend';
const STORAGE_VOICE_SILENCE_MS_KEY = 'gharplate_assistant_voice_silence_ms';
const STORAGE_VOICE_LANG_KEY = 'gharplate_assistant_voice_lang';
const STORAGE_VOICE_RATE_KEY = 'gharplate_assistant_voice_rate';
const MIN_ASSISTANT_WIDTH = 360;
const DEFAULT_ASSISTANT_WIDTH = 880;

function clampAssistantWidth(requestedWidth: number): number {
  const viewportWidth =
    typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280;
  const maxAllowed = Math.max(MIN_ASSISTANT_WIDTH, Math.floor(viewportWidth * 0.92));
  return Math.min(maxAllowed, Math.max(MIN_ASSISTANT_WIDTH, Math.round(requestedWidth)));
}

function isSafeHref(href?: string): boolean {
  if (!href) return false;
  const trimmed = href.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return false;
  }
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  );
}

function formatMessageTimestamp(isoOrTime: string): string {
  try {
    const d = new Date(isoOrTime);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch {
    // fallback
  }
  return isoOrTime;
}

function formatConversationUpdatedTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d >= startOfToday) return `Today · ${timeStr}`;
    if (d >= startOfYesterday) return `Yesterday · ${timeStr}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${timeStr}`;
  } catch {
    return iso;
  }
}

function getConversationDateGroup(iso: string): DateGroupLabel {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Older Conversations';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
    const startOfSevenDaysAgo = new Date(startOfToday.getTime() - 7 * 86400000);
    if (d >= startOfToday) return 'Today';
    if (d >= startOfYesterday) return 'Yesterday';
    if (d >= startOfSevenDaysAgo) return 'Previous 7 Days';
    return 'Older Conversations';
  } catch {
    return 'Older Conversations';
  }
}

function mapRecordToTurn(m: AssistantMessageRecord): ChatTurn {
  return {
    id: `db_${m.id}`,
    role: m.role,
    content: m.content,
    timestamp: formatMessageTimestamp(m.created_at),
    modeUsed: m.mode_used,
    modelUsed: m.model_used,
    ollamaConnected: m.ollama_connected,
    toolTraces: m.tool_traces || [],
    sources: m.sources || [],
  };
}

export const AssistantWorkspacePanel: React.FC = () => {
  const location = useLocation();
  const { user, household, activeMember } = useHousehold();
  const publishedCtx = usePublishedAssistantContext();

  const [isOpen, setIsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_SIDEBAR_OPEN_KEY);
      if (saved === 'false') return false;
      if (saved === 'true') return true;
    } catch {
      // ignore
    }
    return true;
  });
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showContextPopover, setShowContextPopover] = useState(false);

  const [status, setStatus] = useState<AssistantStatusResponse | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<AssistantVoiceStatusResponse | null>(
    null
  );
  const [selectedMode, setSelectedMode] = useState<
    'database_only' | 'automatic' | 'online_search'
  >('automatic');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice & Auto-Send State
  const [voiceState, setVoiceState] = useState<VoiceWorkspaceState>('Ready');
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(null);
  const [voiceLanguage, setVoiceLanguage] = useState<'en-IN' | 'hi-IN' | 'kn-IN'>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_VOICE_LANG_KEY);
      if (saved === 'en-IN' || saved === 'hi-IN' || saved === 'kn-IN') return saved;
    } catch {
      // ignore
    }
    return 'en-IN';
  });
  const [autoSpeakReplies, setAutoSpeakReplies] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STORAGE_VOICE_AUTOSPEAK_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [autoSendVoice, setAutoSendVoice] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_VOICE_AUTOSEND_KEY);
      if (saved === 'false') return false;
    } catch {
      // ignore
    }
    return true;
  });
  const [voiceSilenceDelayMs, setVoiceSilenceDelayMs] = useState<number>(() => {
    try {
      const parsed = Number(window.localStorage.getItem(STORAGE_VOICE_SILENCE_MS_KEY));
      if (Number.isFinite(parsed) && parsed >= 800 && parsed <= 3000) return parsed;
    } catch {
      // ignore
    }
    return 1200;
  });
  const [speechRate, setSpeechRate] = useState<number>(() => {
    try {
      const r = Number(window.localStorage.getItem(STORAGE_VOICE_RATE_KEY));
      if (Number.isFinite(r) && r >= 0.7 && r <= 1.5) return r;
    } catch {
      // ignore
    }
    return 1.0;
  });
  const [speechVolume, setSpeechVolume] = useState<number>(1.0);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [speakingTurnId, setSpeakingTurnId] = useState<string | null>(null);
  const [isSpeechPaused, setIsSpeechPaused] = useState<boolean>(false);
  const [lastSpokenText, setLastSpokenText] = useState<string>('');
  const [voiceTranscriptPreview, setVoiceTranscriptPreview] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const voiceSessionSubmittedRef = useRef<boolean>(false);
  const voiceCancelledRef = useRef<boolean>(false);
  const latestVoiceTranscriptRef = useRef<string>('');
  const lastInputWasVoiceRef = useRef<boolean>(false);

  // Conversations State
  const [conversations, setConversations] = useState<AssistantConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeConversationTitle, setActiveConversationTitle] =
    useState<string>('New Chat');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [turnsByConversationId, setTurnsByConversationId] = useState<
    Record<number, ChatTurn[]>
  >({});
  const [chatViewNonce, setChatViewNonce] = useState<number>(1);
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const [savedChatsSearch, setSavedChatsSearch] = useState('');
  const [renamingConvId, setRenamingConvId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteConvId, setConfirmDeleteConvId] = useState<number | null>(null);

  const loadedUserIdRef = useRef<number | null>(null);
  const initialAutoLoadDoneRef = useRef<boolean>(false);
  const viewEpochRef = useRef<number>(1);
  const activeConversationIdRef = useRef<number | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_WIDTH_KEY);
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) {
          return clampAssistantWidth(Math.max(parsed, 760));
        }
      }
    } catch {
      // ignore
    }
    return clampAssistantWidth(DEFAULT_ASSISTANT_WIDTH);
  });

  const [dockSide, setDockSide] = useState<'right' | 'left'>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_DOCK_KEY);
      if (saved === 'left' || saved === 'right') return saved;
    } catch {
      // ignore
    }
    return 'right';
  });

  const [isResizing, setIsResizing] = useState(false);
  const dragStateRef = useRef({
    active: false,
    startX: 0,
    startWidth: DEFAULT_ASSISTANT_WIDTH,
    dock: 'right' as 'right' | 'left',
  });

  const structuredContext = useMemo(
    () =>
      deriveStructuredPageContext(
        location.pathname,
        publishedCtx,
        household?.household_token || null,
        activeMember
          ? {
              id: activeMember.id,
              display_name: activeMember.display_name,
              dietary_preference: activeMember.dietary_preference,
              age_group: activeMember.age_group,
              selected_conditions: activeMember.selected_conditions,
              allergies: activeMember.allergies,
            }
          : null
      ),
    [location.pathname, publishedCtx, household?.household_token, activeMember]
  );

  const activeEntity = structuredContext.selected_entity || null;
  const activeFoodSlug = structuredContext.food_slug || null;
  const activeConditionCode = structuredContext.condition_code || null;

  const [suggestedFollowups, setSuggestedFollowups] = useState<string[]>([
    'What are the uses and benefits of this?',
    'What nutrients are most important here?',
    'How is this made step by step?',
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      try {
        setAvailableVoices(window.speechSynthesis.getVoices() || []);
      } catch {
        // ignore
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_SIDEBAR_OPEN_KEY, String(sidebarOpen));
      window.localStorage.setItem(STORAGE_VOICE_LANG_KEY, voiceLanguage);
      window.localStorage.setItem(STORAGE_VOICE_AUTOSPEAK_KEY, String(autoSpeakReplies));
      window.localStorage.setItem(STORAGE_VOICE_AUTOSEND_KEY, String(autoSendVoice));
      window.localStorage.setItem(
        STORAGE_VOICE_SILENCE_MS_KEY,
        String(voiceSilenceDelayMs)
      );
      window.localStorage.setItem(STORAGE_VOICE_RATE_KEY, String(speechRate));
      window.localStorage.setItem(STORAGE_WIDTH_KEY, String(panelWidth));
      window.localStorage.setItem(STORAGE_DOCK_KEY, dockSide);
    } catch {
      // ignore
    }
  }, [
    sidebarOpen,
    voiceLanguage,
    autoSpeakReplies,
    autoSendVoice,
    voiceSilenceDelayMs,
    speechRate,
    panelWidth,
    dockSide,
  ]);

  const stopAllSpeechAndListening = useCallback(() => {
    clearSilenceTimer();
    voiceCancelledRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    setSpeakingTurnId(null);
    setIsSpeechPaused(false);
    setVoiceState('Ready');
  }, [clearSilenceTimer]);

  useEffect(() => {
    if (!isOpen) stopAllSpeechAndListening();
  }, [isOpen, stopAllSpeechAndListening]);

  useEffect(() => {
    return () => stopAllSpeechAndListening();
  }, [stopAllSpeechAndListening]);

  const speakTextAloud = useCallback(
    (text: string, turnId?: string) => {
      const cleaned = cleanMarkdownForSpeech(text);
      if (!cleaned) return;
      setLastSpokenText(cleaned);

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setVoiceState('Error');
        setVoiceErrorMessage(
          'Speech output (SpeechSynthesis) is not supported in this browser.'
        );
        return;
      }

      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.lang = voiceLanguage;
        utterance.rate = speechRate;
        utterance.volume = speechVolume;

        if (availableVoices.length > 0) {
          const explicitVoice = availableVoices.find(
            (v) => v.voiceURI === selectedVoiceURI
          );
          const langMatch =
            explicitVoice ||
            availableVoices.find(
              (v) => v.lang.toLowerCase() === voiceLanguage.toLowerCase()
            ) ||
            availableVoices.find((v) =>
              v.lang.toLowerCase().startsWith(voiceLanguage.slice(0, 2).toLowerCase())
            );
          if (langMatch) utterance.voice = langMatch;
        }

        utterance.onstart = () => {
          setSpeakingTurnId(turnId || 'active');
          setIsSpeechPaused(false);
          setVoiceState('Speaking');
          setVoiceErrorMessage(null);
        };
        utterance.onend = () => {
          setSpeakingTurnId(null);
          setIsSpeechPaused(false);
          setVoiceState('Ready');
        };
        utterance.onerror = () => {
          setSpeakingTurnId(null);
          setIsSpeechPaused(false);
          setVoiceState('Ready');
        };

        setSpeakingTurnId(turnId || 'active');
        setIsSpeechPaused(false);
        setVoiceState('Speaking');
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        setVoiceState('Error');
        setVoiceErrorMessage(
          err instanceof Error ? err.message : 'Unable to play spoken response.'
        );
      }
    },
    [availableVoices, selectedVoiceURI, speechRate, speechVolume, voiceLanguage]
  );

  const handlePauseSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.pause();
        setIsSpeechPaused(true);
      } catch {
        // ignore
      }
    }
  };

  const handleResumeSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
        setIsSpeechPaused(false);
        setVoiceState('Speaking');
      } catch {
        // ignore
      }
    }
  };

  const handleStopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    setSpeakingTurnId(null);
    setIsSpeechPaused(false);
    setVoiceState('Ready');
  };

  const handleReplayLastSpeech = () => {
    if (lastSpokenText) {
      speakTextAloud(lastSpokenText, 'replay');
      return;
    }
    const latestAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
    if (latestAssistant) speakTextAloud(latestAssistant.content, latestAssistant.id);
  };

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (loadedUserIdRef.current !== currentUserId) {
      loadedUserIdRef.current = currentUserId;
      initialAutoLoadDoneRef.current = false;
      viewEpochRef.current += 1;
      activeConversationIdRef.current = null;
      setConversations([]);
      setActiveConversationId(null);
      setActiveConversationTitle('New Chat');
      setTurns([]);
      setTurnsByConversationId({});
      setInput('');
      setLoading(false);
      setError(null);
      setSavedChatsSearch('');
      setRenamingConvId(null);
      setConfirmDeleteConvId(null);
      setChatViewNonce((n) => n + 1);
    }
  }, [user?.id]);

  const loadConversationMessages = useCallback(async (conversationId: number) => {
    const requestEpoch = ++viewEpochRef.current;
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);
    setLoading(false);
    setError(null);
    setConfirmDeleteConvId(null);
    setRenamingConvId(null);
    setChatViewNonce((n) => n + 1);

    try {
      const detail = await api.getAssistantConversation(conversationId);
      const mappedTurns = (detail.messages || []).map(mapRecordToTurn);
      setTurnsByConversationId((prev) => ({ ...prev, [detail.id]: mappedTurns }));
      if (
        viewEpochRef.current === requestEpoch &&
        activeConversationIdRef.current === conversationId
      ) {
        setActiveConversationId(detail.id);
        setActiveConversationTitle(detail.title || 'Saved Conversation');
        setTurns(mappedTurns);
      }
    } catch {
      // keep existing
    }
  }, []);

  const refreshConversations = useCallback(
    async (allowInitialAutoLoad = false) => {
      try {
        const list = await api.listAssistantConversations();
        if (Array.isArray(list)) {
          setConversations(list);
          if (
            allowInitialAutoLoad &&
            !initialAutoLoadDoneRef.current &&
            list.length > 0 &&
            activeConversationIdRef.current === null
          ) {
            initialAutoLoadDoneRef.current = true;
            const latestWithMessages =
              list.find((c) => (c.message_count ?? 0) > 0) || list[0];
            if (latestWithMessages) {
              await loadConversationMessages(latestWithMessages.id);
            }
          } else if (allowInitialAutoLoad) {
            initialAutoLoadDoneRef.current = true;
          }
        }
      } catch {
        // ignore
      }
    },
    [loadConversationMessages]
  );

  useEffect(() => {
    if (isOpen) {
      if (!status) {
        void api
          .getAssistantStatus()
          .then((res) => {
            setStatus(res);
            if (res.active_model) setSelectedModel(res.active_model);
          })
          .catch(() => null);
      }
      if (!voiceConfig) {
        void api
          .getAssistantVoiceStatus()
          .then((vc) => setVoiceConfig(vc))
          .catch(() => null);
      }
      void refreshConversations(!initialAutoLoadDoneRef.current);
    }
  }, [isOpen, status, voiceConfig, refreshConversations]);

  useEffect(() => {
    const onOpenAssistant = (evt: Event) => {
      const customEvt = evt as CustomEvent<OpenAssistantEventDetail>;
      setIsOpen(true);
      if (customEvt.detail?.initialPrompt) {
        setInput(customEvt.detail.initialPrompt);
      }
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpenAssistant);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpenAssistant);
  }, []);

  useEffect(() => {
    if (structuredContext.page_type === 'food_image_analysis' && structuredContext.food_image_analysis) {
      const fName =
        structuredContext.food_image_analysis.confirmed_food_name ||
        activeEntity?.name ||
        'this food';
      setSuggestedFollowups([
        `How much protein and other nutrients does my portion of ${fName} contain?`,
        `Is ${fName} suitable for someone going to the gym or for breakfast?`,
        `Add this to today's breakfast`,
      ]);
    } else if (activeEntity?.type === 'body_region') {
      const rName = activeEntity.name || 'this body region';
      setSuggestedFollowups([
        `What nutrients are important for ${rName}?`,
        `Which vegetarian Indian foods support ${rName}?`,
        `How does hydration affect ${rName}?`,
      ]);
    } else if (activeEntity?.type === 'recipe') {
      const recName = activeEntity.name || 'this recipe';
      setSuggestedFollowups([
        `How is ${recName} made step by step?`,
        `What are the ingredients and macros per serving of ${recName}?`,
        `Is ${recName} suitable for my health profile?`,
      ]);
    } else if (
      activeEntity?.type === 'food' ||
      activeEntity?.type === 'packaged_product' ||
      activeFoodSlug
    ) {
      const fLabel = activeEntity?.name || activeFoodSlug || 'this food';
      setSuggestedFollowups([
        `What are the uses and benefits of ${fLabel}?`,
        `What nutrients and protein does ${fLabel} provide?`,
        `Does ${fLabel} contain milk, egg, wheat, or soy?`,
      ]);
    } else if (activeConditionCode || activeEntity?.type === 'condition') {
      const cLabel =
        activeEntity?.name || (activeConditionCode || '').replace(/_/g, ' ');
      setSuggestedFollowups([
        `Which foods are reviewed for ${cLabel}?`,
        'How does dietary preference affect these recommendations?',
        'What nutrients should be monitored?',
      ]);
    } else {
      setSuggestedFollowups([
        'Which foods are reviewed for Fever recovery?',
        'Compare Ragi Mudde and Plain Rice for Type 2 Diabetes',
        'What are iron-rich vegetarian foods in IFCT 2017?',
      ]);
    }
  }, [activeEntity, activeFoodSlug, activeConditionCode]);

  useEffect(() => {
    if (
      isOpen &&
      turns.length > 0 &&
      messagesEndRef.current &&
      typeof messagesEndRef.current.scrollIntoView === 'function'
    ) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, isOpen, loading]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const updateWidthFromClientX = useCallback((clientX: number) => {
    if (!dragStateRef.current.active) return;
    const { startX, startWidth, dock } = dragStateRef.current;
    const deltaX = clientX - startX;
    const rawNextWidth = dock === 'right' ? startWidth - deltaX : startWidth + deltaX;
    setPanelWidth(clampAssistantWidth(rawNextWidth));
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent | PointerEvent) => updateWidthFromClientX(e.clientX);
    const onStop = () => {
      dragStateRef.current.active = false;
      setIsResizing(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('pointerup', onStop);
    window.addEventListener('mouseup', onStop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('pointerup', onStop);
      window.removeEventListener('mouseup', onStop);
    };
  }, [isResizing, updateWidthFromClientX]);

  const startResizeDrag = (clientX: number) => {
    dragStateRef.current = {
      active: true,
      startX: clientX,
      startWidth: panelWidth,
      dock: dockSide,
    };
    setIsResizing(true);
  };

  const handleCopyAnswer = (turnId: string, text: string) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      void navigator.clipboard.writeText(text).catch(() => null);
    }
    setCopiedTurnId(turnId);
    window.setTimeout(() => {
      setCopiedTurnId((prev) => (prev === turnId ? null : prev));
    }, 1800);
  };

  const handleStartNewConversation = async () => {
    initialAutoLoadDoneRef.current = true;
    const newEpoch = ++viewEpochRef.current;
    handleStopSpeech();
    clearSilenceTimer();

    if (activeConversationIdRef.current !== null && turns.length > 0) {
      const prevId = activeConversationIdRef.current;
      setTurnsByConversationId((prev) => ({ ...prev, [prevId]: turns }));
    }

    activeConversationIdRef.current = null;
    setActiveConversationId(null);
    setActiveConversationTitle('New Chat');
    setTurns([]);
    setInput('');
    setVoiceTranscriptPreview('');
    latestVoiceTranscriptRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
    setLoading(false);
    setError(null);
    setCopiedTurnId(null);
    setConfirmDeleteConvId(null);
    setRenamingConvId(null);
    setChatViewNonce((n) => n + 1);

    try {
      const created = await api.createAssistantConversation('New Chat');
      if (
        created &&
        typeof created.id === 'number' &&
        viewEpochRef.current === newEpoch
      ) {
        activeConversationIdRef.current = created.id;
        setActiveConversationId(created.id);
        setActiveConversationTitle(created.title || 'New Chat');
        setTurnsByConversationId((prev) => ({ ...prev, [created.id]: [] }));
        setConversations((prev) => [
          {
            id: created.id,
            title: created.title || 'New Chat',
            created_at: created.created_at || new Date().toISOString(),
            updated_at: created.updated_at || new Date().toISOString(),
            message_count: 0,
            last_message_preview: null,
          },
          ...prev.filter((c) => c.id !== created.id),
        ]);
      }
    } catch {
      // create on first message
    }
  };

  const handleRenameConversation = async (conversationId: number) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setRenamingConvId(null);
      return;
    }
    try {
      const updated = await api.renameAssistantConversation(conversationId, trimmed);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                title: updated?.title || trimmed,
                updated_at: updated?.updated_at || new Date().toISOString(),
              }
            : c
        )
      );
      if (activeConversationIdRef.current === conversationId) {
        setActiveConversationTitle(updated?.title || trimmed);
      }
      setRenamingConvId(null);
      setRenameDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename conversation.');
    }
  };

  const handleDeleteConversationById = async (conversationId: number) => {
    try {
      await api.deleteAssistantConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      setTurnsByConversationId((prev) => {
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
      setConfirmDeleteConvId(null);

      if (activeConversationIdRef.current === conversationId) {
        viewEpochRef.current += 1;
        activeConversationIdRef.current = null;
        setActiveConversationId(null);
        setActiveConversationTitle('New Chat');
        setTurns([]);
        setInput('');
        setLoading(false);
        setError(null);
        setChatViewNonce((n) => n + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation.');
    }
  };

  const handleSendMessage = useCallback(
    async (textToSend?: string, fromVoice = false) => {
      const query = (textToSend ?? input).trim();
      if (!query || loading) return;

      const shouldSpeakReply =
        autoSpeakReplies || fromVoice || lastInputWasVoiceRef.current;
      lastInputWasVoiceRef.current = false;
      setVoiceTranscriptPreview('');
      latestVoiceTranscriptRef.current = '';

      initialAutoLoadDoneRef.current = true;
      const requestEpoch = viewEpochRef.current;
      const targetConversationId = activeConversationIdRef.current;

      const nowTime = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      const userTurn: ChatTurn = {
        id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        content: query,
        timestamp: nowTime,
      };

      const currentConvTurns = turns;
      const historyPayload: AssistantChatMessage[] = currentConvTurns.map((t) => ({
        role: t.role,
        content: t.content,
      }));

      const optimisticTurns = [...currentConvTurns, userTurn];
      setTurns(optimisticTurns);
      if (targetConversationId !== null) {
        setTurnsByConversationId((prev) => ({
          ...prev,
          [targetConversationId]: optimisticTurns,
        }));
      }

      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setLoading(true);
      setVoiceState('Thinking');
      setError(null);

      try {
        const resp = await api.chatWithAssistant({
          message: query,
          conversation_id: targetConversationId,
          mode: selectedMode,
          model: selectedModel || undefined,
          history: historyPayload,
          context: structuredContext,
        });

        const resolvedConvId = resp.conversation_id ?? targetConversationId;
        const resolvedTitle =
          resp.conversation_title ||
          (currentConvTurns.length === 0 ? query.slice(0, 80) : activeConversationTitle);

        const assistantTurnId = `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const assistantTurn: ChatTurn = {
          id: assistantTurnId,
          role: 'assistant',
          content: resp.reply,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          modeUsed: resp.mode_used,
          modelUsed: resp.model_used,
          ollamaConnected: resp.ollama_connected,
          resolvedEntity:
            resp.resolved_entity || structuredContext.selected_entity || null,
          resolvedIntent: resp.resolved_intent || null,
          toolTraces: resp.tool_traces,
          sources: resp.sources,
        };

        const completedTurns = [...optimisticTurns, assistantTurn];
        if (resolvedConvId !== null && resolvedConvId !== undefined) {
          setTurnsByConversationId((prev) => ({
            ...prev,
            [resolvedConvId]: completedTurns,
          }));
        }

        if (viewEpochRef.current === requestEpoch) {
          if (resolvedConvId !== null && resolvedConvId !== undefined) {
            activeConversationIdRef.current = resolvedConvId;
            setActiveConversationId(resolvedConvId);
          }
          setActiveConversationTitle(resolvedTitle);
          setTurns(completedTurns);
          if (resp.suggested_followups && resp.suggested_followups.length > 0) {
            setSuggestedFollowups(resp.suggested_followups);
          }
          if (shouldSpeakReply && resp.reply) {
            speakTextAloud(resp.reply, assistantTurnId);
          } else {
            setVoiceState('Ready');
          }
        }

        void refreshConversations(false);
      } catch (err) {
        if (viewEpochRef.current === requestEpoch) {
          // Restore failed message text into composer so user never loses typed input
          setInput(query);
          setError(err instanceof Error ? err.message : 'Assistant request failed.');
          setVoiceState('Error');
        }
      } finally {
        if (viewEpochRef.current === requestEpoch) {
          setLoading(false);
        }
      }
    },
    [
      input,
      loading,
      autoSpeakReplies,
      turns,
      selectedMode,
      selectedModel,
      structuredContext,
      activeConversationTitle,
      speakTextAloud,
      refreshConversations,
    ]
  );

  const finalizeAndSubmitVoiceTranscript = useCallback(
    async (rawTranscript: string, forceAutoSend: boolean) => {
      clearSilenceTimer();
      if (voiceCancelledRef.current || voiceSessionSubmittedRef.current) return;
      const trimmed = rawTranscript.trim();
      if (!trimmed) {
        setVoiceState((prev) => (prev === 'Error' ? 'Error' : 'Ready'));
        return;
      }

      if (forceAutoSend) {
        voiceSessionSubmittedRef.current = true;
      }

      if (recognitionRef.current) {
        const activeRec = recognitionRef.current;
        recognitionRef.current = null;
        try {
          activeRec.stop();
        } catch {
          // ignore
        }
      }

      setVoiceState('Processing speech');
      let normalizedText = trimmed;
      try {
        const norm = await api.transcribeAssistantVoice({
          transcript_hint: trimmed,
          language_code: voiceLanguage,
        });
        normalizedText = (norm.transcript || trimmed).trim();
      } catch {
        normalizedText = trimmed;
      }

      if (voiceCancelledRef.current) return;

      setVoiceTranscriptPreview(normalizedText);
      setInput(normalizedText);
      lastInputWasVoiceRef.current = true;

      if (forceAutoSend) {
        setVoiceState('Sending');
        await handleSendMessage(normalizedText, true);
      } else {
        setVoiceState('Reviewing transcription');
      }
    },
    [clearSilenceTimer, voiceLanguage, handleSendMessage]
  );

  const handleToggleMicrophone = async () => {
    setVoiceErrorMessage(null);

    if (voiceState === 'Listening') {
      clearSilenceTimer();
      const currentDraft = latestVoiceTranscriptRef.current.trim();
      if (recognitionRef.current) {
        const activeRec = recognitionRef.current;
        recognitionRef.current = null;
        try {
          activeRec.stop();
        } catch {
          // ignore
        }
      }
      if (currentDraft) {
        await finalizeAndSubmitVoiceTranscript(currentDraft, autoSendVoice);
      } else {
        setVoiceState('Ready');
      }
      return;
    }

    handleStopSpeech();
    clearSilenceTimer();
    voiceSessionSubmittedRef.current = false;
    voiceCancelledRef.current = false;
    latestVoiceTranscriptRef.current = '';

    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionCtor) {
      setVoiceState('Error');
      setVoiceErrorMessage(
        'Browser speech recognition is not supported in this browser. Try Chrome, Edge, or Safari, or type your question below.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognitionRef.current = recognition;
      recognition.lang = voiceLanguage;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setVoiceState('Listening');
        setVoiceTranscriptPreview('');
      };

      recognition.onresult = (event: any) => {
        if (voiceCancelledRef.current || voiceSessionSubmittedRef.current) return;
        let interim = '';
        let finalTranscript = '';
        for (let i = 0; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalTranscript += `${piece} `;
          } else {
            interim += piece;
          }
        }
        const combined = `${finalTranscript}${interim}`.trim();
        latestVoiceTranscriptRef.current = combined;
        setVoiceTranscriptPreview(combined);
        setInput(combined);

        clearSilenceTimer();
        if (combined && autoSendVoice) {
          silenceTimerRef.current = window.setTimeout(() => {
            void finalizeAndSubmitVoiceTranscript(
              latestVoiceTranscriptRef.current,
              true
            );
          }, voiceSilenceDelayMs);
        }
      };

      recognition.onerror = (event: any) => {
        clearSilenceTimer();
        if (voiceCancelledRef.current || voiceSessionSubmittedRef.current) return;
        const code = event?.error || 'unknown';
        setVoiceState('Error');
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setVoiceErrorMessage(
            'Microphone permission was denied. Please allow microphone access in your browser address bar or type your question.'
          );
        } else if (code === 'no-speech') {
          setVoiceErrorMessage(
            'No speech was detected. Tap the microphone to try again or edit your question below.'
          );
        } else {
          setVoiceErrorMessage(
            `Speech recognition error (${code}). You can still type below.`
          );
        }
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        clearSilenceTimer();
        if (voiceCancelledRef.current || voiceSessionSubmittedRef.current) return;
        const rawText = latestVoiceTranscriptRef.current.trim();
        if (!rawText) {
          setVoiceState((prev) => (prev === 'Error' ? 'Error' : 'Ready'));
          return;
        }
        void finalizeAndSubmitVoiceTranscript(rawText, autoSendVoice);
      };

      recognition.start();
    } catch (err) {
      setVoiceState('Error');
      setVoiceErrorMessage(
        err instanceof Error ? err.message : 'Could not start microphone recognition.'
      );
    }
  };

  const handleCancelVoiceRecording = () => {
    voiceCancelledRef.current = true;
    voiceSessionSubmittedRef.current = false;
    latestVoiceTranscriptRef.current = '';
    clearSilenceTimer();
    if (recognitionRef.current) {
      const activeRec = recognitionRef.current;
      recognitionRef.current = null;
      try {
        activeRec.abort();
      } catch {
        // ignore
      }
    }
    setVoiceTranscriptPreview('');
    setInput('');
    setVoiceErrorMessage(null);
    setVoiceState('Ready');
  };

  // Mandatory Keyboard Composer Enter-to-Send Behaviour
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.nativeEvent.isComposing ||
      (e as unknown as { isComposing?: boolean }).isComposing ||
      (e as unknown as { keyCode?: number }).keyCode === 229
    ) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && input.trim().length > 0) {
        void handleSendMessage();
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const filteredConversations = useMemo(() => {
    const q = savedChatsSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.last_message_preview || '').toLowerCase().includes(q)
    );
  }, [conversations, savedChatsSearch]);

  const groupedConversations = useMemo(() => {
    const groups: Record<DateGroupLabel, AssistantConversationSummary[]> = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      'Older Conversations': [],
    };
    for (const conv of filteredConversations) {
      const bucket = getConversationDateGroup(conv.updated_at);
      groups[bucket].push(conv);
    }
    return groups;
  }, [filteredConversations]);

  const activeContextLabel = useMemo(() => {
    if (activeEntity?.name || activeEntity?.id) {
      const displayName = activeEntity.name || activeEntity.id;
      if (activeEntity.type === 'body_region') return `🫀 ${displayName}`;
      if (activeEntity.type === 'recipe') return `🍲 ${displayName}`;
      if (activeEntity.type === 'condition') return `🩺 ${displayName}`;
      return `🥕 ${displayName}`;
    }
    if (activeFoodSlug) return `🥕 ${activeFoodSlug}`;
    if (activeConditionCode) return `🩺 ${activeConditionCode}`;
    return null;
  }, [activeEntity, activeFoodSlug, activeConditionCode]);

  const activeContextSummary = useMemo(() => {
    if (activeContextLabel) return activeContextLabel;
    if (activeMember) {
      return `${activeMember.display_name} (${activeMember.dietary_preference})`;
    }
    return `Page: ${structuredContext.page_type || 'general'}`;
  }, [activeContextLabel, activeMember, structuredContext.page_type]);

  return (
    <>
      {/* Floating Ask GharPlate Button */}
      <button
        type="button"
        data-testid="ask-gharplate-fab"
        aria-label="Ask GharPlate AI Assistant"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-5 lg:bottom-7 lg:right-7 z-40 flex items-center gap-2.5 rounded-full bg-emerald-900 px-5 py-3.5 text-xs sm:text-sm font-extrabold text-white shadow-xl ring-4 ring-emerald-900/15 hover:bg-emerald-800 hover:scale-[1.02] transition motion-reduce:transition-none"
      >
        <span className="text-base">🤖</span>
        <span>Ask GharPlate</span>
        {activeContextLabel && (
          <span
            data-testid="fab-context-badge"
            className="hidden sm:inline-block rounded-full bg-amber-300 px-2.5 py-0.5 text-[10px] font-black text-stone-950 max-w-[200px] truncate"
          >
            {activeContextLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ask GharPlate AI Assistant Drawer"
          data-testid="assistant-drawer"
          className={`fixed inset-0 z-50 flex ${
            dockSide === 'right' ? 'justify-end' : 'justify-start'
          } ${isResizing ? 'select-none cursor-ew-resize' : ''}`}
        >
          {/* Subtle Backdrop */}
          <div
            data-testid="assistant-backdrop"
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-stone-950/30 backdrop-blur-[1px]"
          />

          {/* Side-by-Side Workspace Window: [Left Assistant Sidebar | Right Main Conversation] */}
          <div
            data-testid="assistant-floating-window"
            data-sidebar-state={sidebarOpen ? 'expanded' : 'collapsed'}
            style={{
              width: `${panelWidth}px`,
              maxWidth: '96vw',
            }}
            className="relative z-10 flex h-full w-full sm:my-3 sm:mx-3 sm:h-[calc(100vh-1.5rem)] flex-row overflow-hidden bg-[#FAF8F5] sm:rounded-3xl shadow-[0_24px_64px_-12px_rgba(6,78,59,0.35)] border border-stone-200/90 ring-1 ring-emerald-950/10"
          >
            {/* Outer Edge Resize Handle (No native title attribute that overlaps header) */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Assistant Window"
              aria-valuemin={MIN_ASSISTANT_WIDTH}
              aria-valuenow={panelWidth}
              data-testid="assistant-resize-handle"
              onPointerDown={(e) => {
                e.preventDefault();
                startResizeDrag(e.clientX);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                startResizeDrag(e.clientX);
              }}
              className={`hidden sm:flex absolute top-14 bottom-14 z-20 w-2.5 items-center justify-center cursor-ew-resize group ${
                dockSide === 'right' ? 'left-0' : 'right-0'
              }`}
            >
              <div
                className={`h-14 w-1 rounded-full transition-colors ${
                  isResizing
                    ? 'bg-amber-400'
                    : 'bg-stone-300/70 group-hover:bg-emerald-600'
                }`}
              />
            </div>

            {/* LEFT: Collapsible Assistant Control Sidebar */}
            <AssistantWorkspaceSidebar
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
              onCloseSidebarMobile={() => setSidebarOpen(false)}
              dockSide={dockSide}
              onToggleDockSide={() =>
                setDockSide((prev) => (prev === 'right' ? 'left' : 'right'))
              }
              conversations={conversations}
              groupedConversations={groupedConversations}
              filteredCount={filteredConversations.length}
              activeConversationId={activeConversationId}
              turnsCount={turns.length}
              savedChatsSearch={savedChatsSearch}
              onSearchChange={setSavedChatsSearch}
              onStartNewConversation={() => void handleStartNewConversation()}
              onSelectConversation={(id) => void loadConversationMessages(id)}
              renamingConvId={renamingConvId}
              renameDraft={renameDraft}
              onStartRename={(id, title) => {
                setRenamingConvId(id);
                setRenameDraft(title);
                setConfirmDeleteConvId(null);
              }}
              onRenameDraftChange={setRenameDraft}
              onSaveRename={(id) => void handleRenameConversation(id)}
              onCancelRename={() => setRenamingConvId(null)}
              confirmDeleteConvId={confirmDeleteConvId}
              onRequestDelete={(id) => {
                setSidebarOpen(true);
                setConfirmDeleteConvId(id);
                setRenamingConvId(null);
              }}
              onConfirmDelete={(id) => void handleDeleteConversationById(id)}
              onCancelDelete={() => setConfirmDeleteConvId(null)}
              formatUpdatedTime={formatConversationUpdatedTime}
              getPreviewText={(c) => {
                const cached = turnsByConversationId[c.id];
                const raw = (
                  c.last_message_preview ||
                  (cached && cached.length > 0
                    ? cached[cached.length - 1].content
                    : '')
                ).replace(/^Verified Reply for Conv \d+:\s*/i, '');
                if (raw) return `Last: ${raw.slice(0, 28)}…`;
                return 'New conversation';
              }}
              selectedMode={selectedMode}
              onSelectMode={setSelectedMode}
              status={status}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              showModelSettings={showModelSettings}
              onToggleModelSettings={() => setShowModelSettings((v) => !v)}
              showVoiceSettings={showVoiceSettings}
              onToggleVoiceSettings={() => setShowVoiceSettings((v) => !v)}
              voiceLanguage={voiceLanguage}
              onChangeVoiceLanguage={setVoiceLanguage}
              speechRate={speechRate}
              onChangeSpeechRate={setSpeechRate}
              speechVolume={speechVolume}
              onChangeSpeechVolume={setSpeechVolume}
              availableVoices={availableVoices}
              selectedVoiceURI={selectedVoiceURI}
              onChangeVoiceURI={setSelectedVoiceURI}
              autoSpeakReplies={autoSpeakReplies}
              onToggleAutoSpeak={() => setAutoSpeakReplies((v) => !v)}
              autoSendVoice={autoSendVoice}
              onToggleAutoSendVoice={() => setAutoSendVoice((v) => !v)}
              voiceSilenceDelayMs={voiceSilenceDelayMs}
              onChangeSilenceDelayMs={setVoiceSilenceDelayMs}
              voiceState={voiceState}
              isSpeechPaused={isSpeechPaused}
              onPauseSpeech={handlePauseSpeech}
              onResumeSpeech={handleResumeSpeech}
              onStopSpeech={handleStopSpeech}
              onReplayLastSpeech={handleReplayLastSpeech}
              canReplaySpeech={turns.length > 0 || Boolean(lastSpokenText)}
              activeContextSummary={activeContextSummary}
              activeEntity={activeEntity}
              activeMemberName={activeMember?.display_name || null}
              activeMemberDiet={activeMember?.dietary_preference || null}
              pageType={structuredContext.page_type}
            />

            {/* Hidden fallback dock toggle when sidebar is collapsed so testid remains mounted */}
            {!sidebarOpen && (
              <button
                type="button"
                data-testid="assistant-dock-toggle"
                onClick={() =>
                  setDockSide((prev) => (prev === 'right' ? 'left' : 'right'))
                }
                className="sr-only"
              >
                Toggle Dock
              </button>
            )}

            {/* RIGHT: Main Conversation Workspace (expands to full width when sidebar is collapsed) */}
            <div
              data-testid="assistant-main-conversation"
              className="flex flex-1 flex-col min-w-0 w-full h-full overflow-hidden transition-all duration-200"
            >
              {/* Simple, Clean Conversation Header:
                  1. Obvious Sidebar Show/Hide Toggle
                  2. Ask GharPlate Title
                  3. Compact Connection/Model Status
                  4. Close Assistant Control */}
              <header className="bg-emerald-950 text-white px-4 py-3 shrink-0 border-b border-emerald-900">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* 1. Persistent, Obvious Sidebar Show/Hide Toggle */}
                    <button
                      type="button"
                      data-testid="assistant-sidebar-toggle"
                      aria-expanded={sidebarOpen}
                      aria-label={
                        sidebarOpen
                          ? 'Hide Assistant Sidebar'
                          : 'Show Assistant Sidebar'
                      }
                      onClick={() => setSidebarOpen((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-900 border border-emerald-700/80 px-3 py-1.5 text-xs font-extrabold text-emerald-100 hover:bg-emerald-800 hover:text-white transition shrink-0"
                    >
                      <svg
                        className="h-4 w-4 text-emerald-300 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                        {sidebarOpen ? (
                          <polyline points="15 9 12 12 15 15" />
                        ) : (
                          <polyline points="13 9 16 12 13 15" />
                        )}
                      </svg>
                      <span>{sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}</span>
                    </button>

                    {/* Permanent + New Chat button in header when sidebar is collapsed (no duplicate when sidebar is open on desktop) */}
                    {!sidebarOpen && (
                      <button
                        type="button"
                        data-testid="assistant-new-conversation-btn"
                        aria-label="Start New Chat"
                        onClick={() => void handleStartNewConversation()}
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-extrabold text-stone-950 shadow-2xs hover:bg-emerald-400 transition shrink-0"
                      >
                        <span>＋</span>
                        <span>New Chat</span>
                      </button>
                    )}

                    {/* Quick Saved Chats open trigger for keyboard/screen-reader & existing test compatibility */}
                    <button
                      type="button"
                      data-testid="assistant-saved-chats-toggle"
                      onClick={() => setSidebarOpen(true)}
                      className="sr-only"
                    >
                      💬 Saved Chats ({conversations.length})
                    </button>

                    {/* 2. Ask GharPlate Title, Active Conversation Title & 3. Compact Connection/Model Status */}
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-sm sm:text-base font-black tracking-tight text-white truncate">
                        Ask GharPlate
                      </h2>
                      <span
                        data-testid="assistant-header-conversation-title"
                        className="hidden md:inline-block truncate max-w-[180px] rounded-lg bg-emerald-900/80 border border-emerald-800 px-2 py-0.5 text-[11px] font-bold text-emerald-100"
                      >
                        Chat: {(activeConversationTitle || 'New Chat').slice(0, 24)}
                      </span>
                      <span
                        data-testid="assistant-connection-status-pill"
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold shrink-0 ${
                          status?.ollama_reachable
                            ? 'bg-emerald-400 text-stone-950'
                            : 'bg-amber-300 text-stone-950'
                        }`}
                      >
                        {status?.ollama_reachable
                          ? selectedModel || status.active_model || 'Ollama Ready'
                          : 'Local Engine'}
                      </span>
                      {voiceState !== 'Ready' && (
                        <span
                          data-testid="assistant-voice-state-badge"
                          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold shrink-0 ${
                            voiceState === 'Listening'
                              ? 'bg-rose-500 text-white animate-pulse'
                              : voiceState === 'Speaking' || voiceState === 'Sending'
                              ? 'bg-amber-300 text-stone-950'
                              : 'bg-rose-200 text-rose-950'
                          }`}
                        >
                          🎙️ {voiceState}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Compact Active Context Pill & 4. Close Assistant Control */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      data-testid="assistant-active-context-badge"
                      onClick={() => setShowContextPopover((v) => !v)}
                      className="rounded-xl bg-amber-300 text-stone-950 px-2.5 py-1 text-[10px] font-extrabold shadow-2xs max-w-[180px] truncate hover:bg-amber-200 transition"
                    >
                      {activeContextLabel ||
                        `Context: ${structuredContext.page_type || 'general'}`}
                    </button>

                    <button
                      type="button"
                      data-testid="assistant-close-btn"
                      aria-label="Close Assistant Drawer"
                      onClick={() => setIsOpen(false)}
                      className="rounded-xl bg-emerald-900 border border-emerald-700/60 px-2.5 py-1 text-xs font-extrabold text-white hover:bg-emerald-800 transition"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {showContextPopover && (
                  <div
                    data-testid="assistant-context-detail-popover"
                    className="mt-2 rounded-2xl bg-emerald-900/95 border border-emerald-700 p-3 text-[11px] text-emerald-100 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-amber-300">
                        Active Context Details
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowContextPopover(false)}
                        className="text-[10px] text-emerald-200 hover:underline"
                      >
                        Close
                      </button>
                    </div>
                    <div>
                      <strong>Page:</strong> {structuredContext.page_type || 'general'} (
                      {location.pathname})
                    </div>
                    {activeEntity && (
                      <div>
                        <strong>Selected Structure/Item:</strong> {activeEntity.name} (
                        {activeEntity.type})
                      </div>
                    )}
                    {activeMember && (
                      <div>
                        <strong>Profile:</strong> {activeMember.display_name} (
                        {activeMember.dietary_preference})
                      </div>
                    )}
                  </div>
                )}
              </header>

              {/* Scrollable Conversation Area */}
              <div
                key={`conv-${activeConversationId ?? 'new'}-${chatViewNonce}`}
                data-testid="assistant-messages-viewport"
                data-active-conversation-id={activeConversationId ?? 'new'}
                className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4"
              >
                {turns.length === 0 ? (
                  <div
                    data-testid="assistant-empty-welcome"
                    className="rounded-3xl border border-stone-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-3.5 text-xs text-stone-700"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-lg">
                        🌿
                      </span>
                      <div>
                        <h3 className="font-black text-emerald-950 text-base tracking-tight">
                          What would you like to explore today?
                        </h3>
                        <div className="text-[11px] text-stone-500">
                          {activeContextLabel
                            ? `Focused on ${activeContextLabel} — ask "what does this do?" or "which nutrients are relevant?"`
                            : 'Ask by text or voice in English, Hindi, or Kannada'}
                        </div>
                      </div>
                    </div>
                    <div
                      data-testid="assistant-suggested-questions"
                      className="space-y-1.5 pt-1"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Suggested Questions:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestedFollowups.slice(0, 3).map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => void handleSendMessage(q)}
                            className="text-left rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-bold text-emerald-950 hover:bg-emerald-100 transition"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  turns.map((turn) => (
                    <div
                      key={turn.id}
                      className={`flex flex-col ${
                        turn.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      {turn.role === 'user' ? (
                        <div
                          data-testid="assistant-user-message"
                          className="max-w-[85%] rounded-3xl rounded-br-lg bg-emerald-800 px-4 py-3 text-xs sm:text-[13px] font-semibold text-white shadow-sm space-y-1"
                        >
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {turn.content}
                          </div>
                          <div className="text-right text-[10px] font-medium text-emerald-200/80">
                            {turn.timestamp}
                          </div>
                        </div>
                      ) : (
                        <div
                          data-testid="assistant-ai-message"
                          className="w-full max-w-[96%] rounded-3xl rounded-tl-lg border border-stone-200/90 bg-white p-4 sm:p-5 shadow-xs space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs">
                                🤖
                              </span>
                              <span className="text-[11px] font-extrabold text-emerald-950">
                                GharPlate Intelligence
                              </span>
                              {turn.resolvedEntity?.name && (
                                <span
                                  data-testid="turn-resolved-entity-pill"
                                  className="rounded-full bg-amber-100 border border-amber-300/70 px-2 py-0.5 text-[10px] font-extrabold text-amber-950"
                                >
                                  {turn.resolvedEntity.name}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-stone-400">
                                {turn.timestamp}
                              </span>
                              {speakingTurnId === turn.id ? (
                                <button
                                  type="button"
                                  data-testid="stop-speak-answer-btn"
                                  onClick={handleStopSpeech}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold text-rose-800"
                                >
                                  ⏹ Stop
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  data-testid="speak-answer-btn"
                                  onClick={() => speakTextAloud(turn.content, turn.id)}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-900"
                                >
                                  🔊 Speak
                                </button>
                              )}
                              <button
                                type="button"
                                data-testid="copy-answer-btn"
                                onClick={() => handleCopyAnswer(turn.id, turn.content)}
                                className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold text-stone-700"
                              >
                                {copiedTurnId === turn.id ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>

                          <AssistantMarkdown content={turn.content} />

                          {turn.toolTraces && turn.toolTraces.length > 0 && (
                            <div className="border-t border-stone-100 pt-2 flex flex-wrap gap-1.5">
                              {turn.toolTraces.map((tr, idx) => (
                                <span
                                  key={`${tr.tool_name}-${idx}`}
                                  title={tr.summary}
                                  className="rounded-lg bg-stone-100 border border-stone-200 px-2 py-0.5 font-mono text-[10px] font-semibold text-stone-700"
                                >
                                  🔧 {tr.tool_name}
                                </span>
                              ))}
                            </div>
                          )}

                          {turn.sources && turn.sources.length > 0 && (
                            <div className="border-t border-stone-100 pt-2 flex flex-wrap gap-1.5">
                              {turn.sources.map((s, idx) =>
                                s.url && isSafeHref(s.url) ? (
                                  <a
                                    key={idx}
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-lg bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-900 hover:bg-emerald-100"
                                  >
                                    {s.title} ↗
                                  </a>
                                ) : (
                                  <span
                                    key={idx}
                                    className="rounded-lg bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700"
                                  >
                                    {s.title}
                                  </span>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}

                {loading && (
                  <div
                    data-testid="assistant-loading-indicator"
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs font-semibold text-emerald-900 animate-pulse"
                  >
                    Querying GharPlate database &amp; synthesising context-aware response…
                  </div>
                )}

                {error && (
                  <div
                    data-testid="assistant-error-banner"
                    className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-900"
                  >
                    {error}
                  </div>
                )}

                {voiceErrorMessage && (
                  <div
                    data-testid="assistant-voice-error-banner"
                    className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950 flex items-center justify-between gap-2"
                  >
                    <span>🎙️ {voiceErrorMessage}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceErrorMessage(null);
                        setVoiceState('Ready');
                      }}
                      className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-900"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Compact Follow-up Suggestions */}
              {turns.length > 0 && suggestedFollowups.length > 0 && (
                <div className="border-t border-stone-200/80 bg-white/95 px-4 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 shrink-0">
                    Follow-up:
                  </span>
                  {suggestedFollowups.slice(0, 3).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void handleSendMessage(q)}
                      disabled={loading}
                      className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 transition disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Voice Live Transcript Bar */}
              {(voiceState === 'Listening' ||
                voiceState === 'Processing speech' ||
                voiceState === 'Sending' ||
                voiceState === 'Reviewing transcription' ||
                voiceTranscriptPreview) && (
                <div
                  data-testid="assistant-voice-transcript-preview"
                  className="border-t border-emerald-200 bg-emerald-50/90 px-4 py-2 space-y-1 shrink-0"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-extrabold text-emerald-950">
                      {voiceState === 'Listening'
                        ? `🔴 Listening (${voiceLanguage})… ${
                            autoSendVoice
                              ? `Auto-sends after ${(voiceSilenceDelayMs / 1000).toFixed(
                                  1
                                )}s pause`
                              : 'Speak your question'
                          }`
                        : voiceState === 'Processing speech'
                        ? '⏳ Processing speech transcript…'
                        : voiceState === 'Sending'
                        ? '🚀 Auto-sending spoken question…'
                        : '✅ Voice transcript ready:'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {voiceTranscriptPreview && voiceState !== 'Sending' && (
                        <button
                          type="button"
                          data-testid="assistant-voice-send-btn"
                          onClick={() =>
                            void finalizeAndSubmitVoiceTranscript(
                              voiceTranscriptPreview || input,
                              true
                            )
                          }
                          className="rounded-lg bg-emerald-900 px-2.5 py-1 text-[10px] font-extrabold text-white"
                        >
                          Send &amp; Speak Reply ↑
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="assistant-mic-cancel"
                        onClick={handleCancelVoiceRecording}
                        className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-[10px] font-bold text-stone-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  {voiceTranscriptPreview && (
                    <div className="text-xs font-semibold text-emerald-900 italic">
                      “{voiceTranscriptPreview}”
                    </div>
                  )}
                </div>
              )}

              {/* Fixed Bottom Message Composer (Microphone always accessible even when sidebar is hidden) */}
              <div className="border-t border-stone-200 bg-white p-3.5 shrink-0 space-y-1.5">
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    data-testid="assistant-mic-toggle"
                    aria-label={
                      voiceState === 'Listening'
                        ? 'Stop voice recording'
                        : 'Start voice input'
                    }
                    onClick={() => void handleToggleMicrophone()}
                    disabled={loading}
                    className={`rounded-2xl px-3.5 py-2.5 text-xs font-extrabold shadow-xs transition shrink-0 ${
                      voiceState === 'Listening'
                        ? 'bg-rose-600 text-white animate-pulse ring-4 ring-rose-500/25'
                        : 'border border-stone-300 bg-stone-100 text-stone-900 hover:bg-emerald-50 hover:border-emerald-600'
                    }`}
                  >
                    {voiceState === 'Listening' ? '⏹ Stop Mic' : '🎙️ Voice'}
                  </button>

                  <textarea
                    ref={textareaRef}
                    rows={1}
                    data-testid="assistant-chat-input"
                    aria-label="Ask GharPlate Input"
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      activeContextLabel
                        ? `Ask about ${activeContextLabel.replace(
                            /^[^\s]+\s/,
                            ''
                          )} (Enter to send, Shift+Enter for newline)...`
                        : 'Type a question (Enter to send, Shift+Enter for new line) or tap 🎙️ Voice...'
                    }
                    className="flex-1 resize-none rounded-2xl border border-stone-300 bg-stone-50/70 px-3.5 py-2.5 text-xs sm:text-[13px] text-stone-900 placeholder:text-stone-400 focus:border-emerald-700 focus:bg-white focus:outline-none"
                  />

                  <button
                    type="button"
                    data-testid="assistant-send-btn"
                    onClick={() => void handleSendMessage()}
                    disabled={loading || !input.trim()}
                    className="rounded-2xl bg-emerald-900 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-800 transition disabled:opacity-50 shrink-0"
                  >
                    Send ↑
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                  <span>
                    Educational nutrition guidance · Spoken health logs always require confirmation
                  </span>
                  <span className="hidden sm:inline">
                    Enter to send · Shift+Enter for newline · 🎙️ Auto-send on silence
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
