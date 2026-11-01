import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocation } from 'react-router-dom';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  AssistantChatMessage,
  AssistantConversationSummary,
  AssistantMessageRecord,
  AssistantSourceReference,
  AssistantStatusResponse,
  AssistantToolExecutionTrace,
} from '../types/api';

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modeUsed?: string | null;
  modelUsed?: string | null;
  ollamaConnected?: boolean;
  toolTraces?: AssistantToolExecutionTrace[];
  sources?: AssistantSourceReference[];
}

type DateGroupLabel =
  | 'Today'
  | 'Yesterday'
  | 'Previous 7 Days'
  | 'Older Conversations';

const DATE_GROUP_ORDER: DateGroupLabel[] = [
  'Today',
  'Yesterday',
  'Previous 7 Days',
  'Older Conversations',
];

const STORAGE_WIDTH_KEY = 'gharplate_assistant_width_px';
const STORAGE_DOCK_KEY = 'gharplate_assistant_dock_side';
const MIN_ASSISTANT_WIDTH = 360;
const DEFAULT_ASSISTANT_WIDTH = 530;

function clampAssistantWidth(requestedWidth: number): number {
  const viewportWidth =
    typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280;
  const maxAllowed = Math.max(MIN_ASSISTANT_WIDTH, Math.floor(viewportWidth * 0.8));
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
    // fallback to raw string
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
    if (d >= startOfToday) {
      return `Today · ${timeStr}`;
    }
    if (d >= startOfYesterday) {
      return `Yesterday · ${timeStr}`;
    }
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

/**
 * Safe, rich Markdown renderer for Ask GharPlate Assistant messages.
 * Converts headings, bold/italic text, bulleted & numbered lists, GFM tables,
 * blockquotes, horizontal rules, links, and code blocks with Copy Code support.
 */
export const AssistantMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const [copiedCodeBlock, setCopiedCodeBlock] = useState<string | null>(null);

  const handleCopyCode = (codeText: string) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      void navigator.clipboard.writeText(codeText).catch(() => null);
    }
    setCopiedCodeBlock(codeText);
    window.setTimeout(() => {
      setCopiedCodeBlock((prev) => (prev === codeText ? null : prev));
    }, 1800);
  };

  return (
    <div
      data-testid="assistant-markdown-body"
      className="space-y-2.5 text-xs sm:text-[13px] leading-relaxed text-stone-800 break-words"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-3 mb-1.5 text-base font-black tracking-tight text-emerald-950 border-b border-stone-200/80 pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 mb-1 text-sm font-extrabold text-emerald-950">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2.5 mb-1 text-xs sm:text-[13px] font-extrabold text-stone-900">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-1.5 leading-relaxed text-stone-800">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-extrabold text-stone-950">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-stone-700">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc pl-5 space-y-1 text-stone-800 marker:text-emerald-700">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal pl-5 space-y-1 text-stone-800 marker:font-bold marker:text-emerald-800">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 rounded-r-2xl border-l-4 border-emerald-600 bg-emerald-50/70 px-3.5 py-2 text-xs text-emerald-950">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-stone-200" />,
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-2xs">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-emerald-950/5 border-b border-stone-200 text-stone-900 font-extrabold">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-stone-100">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-stone-50/80 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-extrabold text-stone-900">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-stone-700 align-top">{children}</td>
          ),
          a: ({ href, children }) => {
            if (!isSafeHref(href)) {
              return <span className="text-stone-700">{children}</span>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emerald-800 underline decoration-emerald-600/60 underline-offset-2 hover:text-emerald-600"
              >
                {children}
              </a>
            );
          },
          code: ({ className, children }) => {
            const rawCode = String(children).replace(/\n$/, '');
            const isBlock = Boolean(
              className?.includes('language-') || rawCode.includes('\n')
            );
            const langMatch = className?.match(/language-([a-zA-Z0-9_-]+)/);
            const langLabel = langMatch ? langMatch[1] : 'code';

            if (!isBlock) {
              return (
                <code className="rounded-md border border-stone-200/90 bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-900">
                  {rawCode}
                </code>
              );
            }

            return (
              <div className="my-2.5 overflow-hidden rounded-2xl border border-stone-800 bg-stone-950 text-stone-100 shadow-sm">
                <div className="flex items-center justify-between border-b border-stone-800 bg-stone-900/90 px-3.5 py-1.5 text-[10px] font-bold text-stone-400">
                  <span className="font-mono uppercase">{langLabel}</span>
                  <button
                    type="button"
                    data-testid="copy-code-btn"
                    onClick={() => handleCopyCode(rawCode)}
                    className="rounded-lg bg-stone-800 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 hover:bg-stone-700 transition"
                  >
                    {copiedCodeBlock === rawCode ? '✓ Copied' : 'Copy Code'}
                  </button>
                </div>
                <pre className="overflow-x-auto p-3.5 font-mono text-[11px] leading-relaxed text-emerald-100">
                  <code>{rawCode}</code>
                </pre>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export const AssistantDrawer: React.FC = () => {
  const location = useLocation();
  const { user, household, activeMember } = useHousehold();

  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<AssistantStatusResponse | null>(null);
  const [selectedMode, setSelectedMode] = useState<
    'database_only' | 'automatic' | 'online_search'
  >('automatic');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Isolated Per-Conversation State
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

  // Saved Chats Organizer Panel State (Search, Rename, Delete Confirmation)
  const [showSavedChatsPanel, setShowSavedChatsPanel] = useState(false);
  const [savedChatsSearch, setSavedChatsSearch] = useState('');
  const [renamingConvId, setRenamingConvId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteConvId, setConfirmDeleteConvId] = useState<number | null>(null);

  // Lifecycle & Concurrency Guards (prevents stale async responses from mutating a newly opened/blank chat)
  const loadedUserIdRef = useRef<number | null>(null);
  const initialAutoLoadDoneRef = useRef<boolean>(false);
  const viewEpochRef = useRef<number>(1);
  const activeConversationIdRef = useRef<number | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Interactive Resizing & Docking State
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_WIDTH_KEY);
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) {
          return clampAssistantWidth(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
    return clampAssistantWidth(DEFAULT_ASSISTANT_WIDTH);
  });

  const [dockSide, setDockSide] = useState<'right' | 'left'>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_DOCK_KEY);
      if (saved === 'left' || saved === 'right') {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'right';
  });

  const [isResizing, setIsResizing] = useState(false);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startWidth: number;
    dock: 'right' | 'left';
  }>({
    active: false,
    startX: 0,
    startWidth: DEFAULT_ASSISTANT_WIDTH,
    dock: 'right',
  });

  const [suggestedFollowups, setSuggestedFollowups] = useState<string[]>([
    'What are the ingredients in this product?',
    'Does it contain milk, egg, wheat, or soy?',
    'Why are the nutritional values missing (NULL)?',
    'Which foods are reviewed for Fever recovery?',
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Derive current page context automatically from route URL
  const foodMatch = location.pathname.match(/^\/foods\/([^/]+)/);
  const condMatch = location.pathname.match(/^\/conditions\/([^/]+)/);
  const activeFoodSlug = foodMatch ? decodeURIComponent(foodMatch[1]) : null;
  const activeConditionCode =
    condMatch && condMatch[1] !== 'conflicts' ? decodeURIComponent(condMatch[1]) : null;

  // Clear all in-memory conversation state whenever the authenticated user changes or logs out
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
      setShowSavedChatsPanel(false);
      setSavedChatsSearch('');
      setRenamingConvId(null);
      setConfirmDeleteConvId(null);
      setChatViewNonce((n) => n + 1);
    }
  }, [user?.id]);

  /**
   * Loads a single saved conversation by ID, replacing (never appending) the active message list
   * in strict chronological order.
   */
  const loadConversationMessages = useCallback(async (conversationId: number) => {
    const requestEpoch = ++viewEpochRef.current;
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);
    setLoading(false);
    setError(null);
    setConfirmDeleteConvId(null);
    setRenamingConvId(null);
    setShowSavedChatsPanel(false);
    setChatViewNonce((n) => n + 1);

    try {
      const detail = await api.getAssistantConversation(conversationId);
      const mappedTurns = (detail.messages || []).map(mapRecordToTurn);
      setTurnsByConversationId((prev) => ({
        ...prev,
        [detail.id]: mappedTurns,
      }));
      // Only update the visible screen if the user has not switched or clicked + New Chat since requesting
      if (
        viewEpochRef.current === requestEpoch &&
        activeConversationIdRef.current === conversationId
      ) {
        setActiveConversationId(detail.id);
        setActiveConversationTitle(detail.title || 'Saved Conversation');
        setTurns(mappedTurns);
      }
    } catch {
      // If backend fetch fails, fall back to cached turns for this conversation if present
      if (
        viewEpochRef.current === requestEpoch &&
        activeConversationIdRef.current === conversationId
      ) {
        setTurns((prev) => prev);
      }
    }
  }, []);

  /**
   * Fetches the user's saved conversations list from the backend.
   * Auto-loads the latest conversation ONLY once on initial drawer open for the logged-in user,
   * and NEVER overwrites an explicit + New Chat blank session.
   */
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
            // Open the most recent conversation with messages on initial drawer open
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
        // ignore if offline or unauthenticated
      }
    },
    [loadConversationMessages]
  );

  // Trigger initial load when drawer opens — does NOT depend on turns.length or activeConversationId
  // so clicking + New Chat never triggers an auto-reload of the previous conversation.
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
      void refreshConversations(!initialAutoLoadDoneRef.current);
    }
  }, [isOpen, status, refreshConversations]);

  useEffect(() => {
    if (activeFoodSlug) {
      setSuggestedFollowups([
        'What are the ingredients in this product?',
        'Does it contain milk, egg, or soy?',
        'What is the barcode and net weight?',
        'Why are the nutritional values missing?',
      ]);
    } else if (activeConditionCode) {
      setSuggestedFollowups([
        `Which foods are reviewed for ${activeConditionCode.replace(/_/g, ' ')}?`,
        'How does dietary preference affect these recommendations?',
        'What nutrients should be monitored?',
      ]);
    } else {
      setSuggestedFollowups([
        'Which foods are reviewed for Fever recovery?',
        'Compare Ragi Mudde and Plain Rice for Type 2 Diabetes',
        'What are iron-rich vegetarian foods in IFCT 2017?',
        'How does GharPlate check packaged food allergens?',
      ]);
    }
  }, [activeFoodSlug, activeConditionCode]);

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

  // Close floating assistant window on Escape key without losing conversation state
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  // Clamp width when browser window resizes
  useEffect(() => {
    const onWindowResize = () => {
      setPanelWidth((prev) => clampAssistantWidth(prev));
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  // Persist width and dock side in localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_WIDTH_KEY, String(panelWidth));
    } catch {
      // ignore storage errors
    }
  }, [panelWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_DOCK_KEY, dockSide);
    } catch {
      // ignore storage errors
    }
  }, [dockSide]);

  // Pointer & mouse resizing lifecycle
  const updateWidthFromClientX = useCallback((clientX: number) => {
    if (!dragStateRef.current.active) return;
    const { startX, startWidth, dock } = dragStateRef.current;
    const deltaX = clientX - startX;
    const rawNextWidth = dock === 'right' ? startWidth - deltaX : startWidth + deltaX;
    const clamped = clampAssistantWidth(rawNextWidth);
    setPanelWidth(clamped);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (e: PointerEvent) => {
      updateWidthFromClientX(e.clientX);
    };
    const handleMouseMove = (e: MouseEvent) => {
      updateWidthFromClientX(e.clientX);
    };
    const stopResizing = () => {
      dragStateRef.current.active = false;
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('mouseup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
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

  /**
   * Starts a completely blank new conversation:
   * - Preserves the previous conversation in `conversations` & `turnsByConversationId`
   * - Immediately clears active screen messages (`turns = []`), input box, errors, and loading indicators
   * - Increments `viewEpochRef` so any in-flight response from the previous conversation is isolated
   * - Creates a new conversation record with a unique ID on the backend and makes it active
   */
  const handleStartNewConversation = async () => {
    initialAutoLoadDoneRef.current = true;
    const newEpoch = ++viewEpochRef.current;

    // Preserve current turns in the per-conversation cache before clearing the active screen
    if (activeConversationIdRef.current !== null && turns.length > 0) {
      const prevId = activeConversationIdRef.current;
      setTurnsByConversationId((prev) => ({
        ...prev,
        [prevId]: turns,
      }));
    }

    // Immediately clear visible conversation state
    activeConversationIdRef.current = null;
    setActiveConversationId(null);
    setActiveConversationTitle('New Chat');
    setTurns([]);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setLoading(false);
    setError(null);
    setCopiedTurnId(null);
    setConfirmDeleteConvId(null);
    setRenamingConvId(null);
    setShowSavedChatsPanel(false);
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
        setTurnsByConversationId((prev) => ({
          ...prev,
          [created.id]: [],
        }));
        setConversations((prev) => {
          const filtered = prev.filter((c) => c.id !== created.id);
          return [
            {
              id: created.id,
              title: created.title || 'New Chat',
              created_at: created.created_at || new Date().toISOString(),
              updated_at: created.updated_at || new Date().toISOString(),
              message_count: 0,
              last_message_preview: null,
            },
            ...filtered,
          ];
        });
      }
    } catch {
      // If backend create call is unavailable in a minimal mock, keep blank state and create on first message
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

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || loading) return;

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

    // Build history strictly from the active conversation's current turns (never another conversation)
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

    if (!textToSend) {
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
    setLoading(true);
    setError(null);

    try {
      const resp = await api.chatWithAssistant({
        message: query,
        conversation_id: targetConversationId,
        mode: selectedMode,
        model: selectedModel || undefined,
        history: historyPayload,
        context: {
          current_path: location.pathname,
          food_slug: activeFoodSlug,
          condition_code: activeConditionCode,
          household_token: household?.household_token || null,
          member_id: activeMember?.id || null,
        },
      });

      const resolvedConvId = resp.conversation_id ?? targetConversationId;
      const resolvedTitle =
        resp.conversation_title ||
        (currentConvTurns.length === 0 ? query.slice(0, 80) : activeConversationTitle);

      const assistantTurn: ChatTurn = {
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        content: resp.reply,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        modeUsed: resp.mode_used,
        modelUsed: resp.model_used,
        ollamaConnected: resp.ollama_connected,
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

      // Only update the visible chat screen if the user is STILL in this conversation epoch
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
      }

      void refreshConversations(false);
    } catch (err) {
      if (viewEpochRef.current === requestEpoch) {
        setError(err instanceof Error ? err.message : 'Assistant request failed.');
      }
    } finally {
      if (viewEpochRef.current === requestEpoch) {
        setLoading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  // Filter and group saved conversations into Today, Yesterday, Previous 7 Days, Older Conversations
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

  return (
    <>
      {/* Floating Ask GharPlate Button on Every Page */}
      <button
        type="button"
        data-testid="ask-gharplate-fab"
        aria-label="Ask GharPlate AI Assistant"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-5 lg:bottom-7 lg:right-7 z-40 flex items-center gap-2.5 rounded-full bg-emerald-900 px-5 py-3.5 text-xs sm:text-sm font-extrabold text-white shadow-xl ring-4 ring-emerald-900/15 hover:bg-emerald-800 hover:scale-[1.02] transition motion-reduce:transition-none"
      >
        <span className="text-base">🤖</span>
        <span>Ask GharPlate</span>
        {activeFoodSlug && (
          <span className="hidden sm:inline-block rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-stone-950">
            Page Context Active
          </span>
        )}
      </button>

      {/* Premium Floating AI Window & Subtle Dimmed Backdrop */}
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
          {/* Dimmed Backdrop (keeps underlying page visible & closes on click) */}
          <div
            data-testid="assistant-backdrop"
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-stone-950/35 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none"
          />

          {/* Elevated Floating Assistant Window */}
          <div
            data-testid="assistant-floating-window"
            style={{
              width: `${panelWidth}px`,
              maxWidth: '100vw',
            }}
            className="relative z-10 flex h-full w-full sm:my-3 sm:mx-3 sm:h-[calc(100vh-1.5rem)] flex-col overflow-hidden bg-[#FAF8F5] sm:rounded-3xl shadow-[0_24px_64px_-12px_rgba(6,78,59,0.35)] border border-stone-200/90 ring-1 ring-emerald-950/10 transition-transform duration-200 motion-reduce:transition-none"
          >
            {/* Interactive Resize Handle Along Inner Edge (Desktop / Tablet) */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Assistant Window"
              aria-valuemin={MIN_ASSISTANT_WIDTH}
              aria-valuenow={panelWidth}
              data-testid="assistant-resize-handle"
              title="Drag horizontally to resize assistant window"
              onPointerDown={(e) => {
                e.preventDefault();
                startResizeDrag(e.clientX);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                startResizeDrag(e.clientX);
              }}
              className={`hidden sm:flex absolute top-0 bottom-0 z-30 w-3 items-center justify-center cursor-ew-resize group ${
                dockSide === 'right' ? 'left-0 -ml-1' : 'right-0 -mr-1'
              }`}
            >
              <div
                className={`h-16 w-1 rounded-full transition-colors ${
                  isResizing
                    ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                    : 'bg-stone-300/80 group-hover:bg-emerald-500'
                }`}
              />
            </div>

            {/* Polished Floating Window Header */}
            <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 text-white p-4 sm:p-5 space-y-3 shrink-0">
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-800/90 text-sm shadow-inner">
                      🤖
                    </span>
                    <h2 className="text-base sm:text-lg font-black tracking-tight truncate">
                      Ask GharPlate Assistant
                    </h2>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                        status?.ollama_reachable
                          ? 'bg-emerald-400 text-stone-950'
                          : 'bg-amber-300 text-stone-950'
                      }`}
                    >
                      {status?.ollama_reachable
                        ? `Ollama: ${selectedModel || status.active_model || 'Ready'}`
                        : 'Local Tool Engine Ready'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-200/90 truncate">
                    {turns.length > 0
                      ? `Active Chat: ${activeConversationTitle}`
                      : 'Database-first Indian food, barcode, ingredient & condition intelligence'}
                  </p>
                </div>

                {/* Window Action Controls (Dock Side, Saved Chats, New Chat, Close) */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    data-testid="assistant-dock-toggle"
                    title={
                      dockSide === 'right'
                        ? 'Dock assistant to left side'
                        : 'Dock assistant to right side'
                    }
                    onClick={() =>
                      setDockSide((prev) => (prev === 'right' ? 'left' : 'right'))
                    }
                    className="hidden sm:inline-flex items-center gap-1 rounded-xl bg-emerald-900/90 border border-emerald-700/60 px-2.5 py-1.5 text-[11px] font-bold text-emerald-100 hover:bg-emerald-800 transition"
                  >
                    {dockSide === 'right' ? '⇤ Left' : 'Right ⇥'}
                  </button>

                  <button
                    type="button"
                    data-testid="assistant-saved-chats-toggle"
                    onClick={() => setShowSavedChatsPanel((prev) => !prev)}
                    className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition ${
                      showSavedChatsPanel
                        ? 'bg-amber-300 text-stone-950 border-amber-300 font-extrabold'
                        : 'bg-emerald-900/90 border-emerald-700/60 text-emerald-100 hover:bg-emerald-800'
                    }`}
                  >
                    💬 Saved Chats ({conversations.length})
                  </button>

                  <button
                    type="button"
                    data-testid="assistant-new-conversation-btn"
                    onClick={() => void handleStartNewConversation()}
                    className="rounded-xl bg-emerald-400 px-2.5 py-1.5 text-[11px] font-extrabold text-stone-950 hover:bg-emerald-300 transition shadow-xs"
                  >
                    + New Chat
                  </button>

                  {activeConversationId !== null && turns.length > 0 && (
                    <button
                      type="button"
                      data-testid="assistant-delete-conversation-btn"
                      onClick={() => {
                        setShowSavedChatsPanel(true);
                        setConfirmDeleteConvId(activeConversationId);
                      }}
                      className="rounded-xl bg-emerald-900/90 border border-emerald-700/60 px-2.5 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-900/60 transition"
                    >
                      Delete
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label="Close Assistant Drawer"
                    onClick={() => setIsOpen(false)}
                    className="rounded-xl bg-emerald-900 border border-emerald-700/60 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-800 transition"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Quick Conversation Bar + Organizer Trigger */}
              {conversations.length > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-bold text-emerald-200 shrink-0">Active Thread:</span>
                  <select
                    aria-label="Select Saved Conversation"
                    data-testid="assistant-conversation-select"
                    value={activeConversationId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        void handleStartNewConversation();
                      } else {
                        void loadConversationMessages(Number(val));
                      }
                    }}
                    className="flex-1 truncate rounded-xl bg-emerald-900/90 border border-emerald-700/60 px-2.5 py-1 text-[11px] font-bold text-white"
                  >
                    <option value="">+ New Blank Conversation</option>
                    {conversations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.message_count} msgs)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3 Search Mode Selector Pills */}
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-emerald-900/80 p-1 text-[11px] font-bold">
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
                      setSelectedMode(
                        m.id as 'database_only' | 'automatic' | 'online_search'
                      )
                    }
                    className={`rounded-xl py-1.5 px-2 transition truncate ${
                      selectedMode === m.id
                        ? 'bg-white text-emerald-950 shadow-xs font-extrabold'
                        : 'text-emerald-100 hover:bg-emerald-800/60'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Context & Model Selector Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeFoodSlug && (
                    <span className="rounded-lg bg-emerald-800/90 border border-emerald-700/60 px-2 py-0.5 font-semibold">
                      📦 Food: {activeFoodSlug}
                    </span>
                  )}
                  {activeConditionCode && (
                    <span className="rounded-lg bg-emerald-800/90 border border-emerald-700/60 px-2 py-0.5 font-semibold">
                      🩺 Condition: {activeConditionCode}
                    </span>
                  )}
                  {activeMember && (
                    <span className="rounded-lg bg-emerald-800/90 border border-emerald-700/60 px-2 py-0.5 font-semibold">
                      👤 Member: {activeMember.display_name} ({activeMember.dietary_preference})
                    </span>
                  )}
                </div>

                {status && status.installed_models.length > 0 && (
                  <select
                    aria-label="Select Ollama Model"
                    value={selectedModel || status.active_model || ''}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="rounded-lg bg-emerald-900 border border-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white"
                  >
                    {status.installed_models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {status && !status.ollama_reachable && status.remediation_command && (
                <div className="rounded-xl bg-amber-400/15 border border-amber-300/40 px-3 py-2 text-[11px] text-amber-100">
                  <div>{status.status_message}</div>
                  <div className="mt-1 font-mono text-[10px] text-amber-200">
                    Run on Mac: <code>{status.remediation_command}</code>
                  </div>
                </div>
              )}
            </div>

            {/* Organized Saved Chats History Panel (ChatGPT-Style Grouped History) */}
            {showSavedChatsPanel && (
              <div
                data-testid="assistant-saved-chats-panel"
                className="border-b border-stone-200 bg-stone-100/95 p-4 space-y-3 max-h-[58vh] overflow-y-auto shrink-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-emerald-950">
                      Saved Conversations
                    </div>
                    <div className="text-[11px] text-stone-500">
                      Private to {user?.full_name || 'your account'} · Click any chat to resume
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="saved-chats-new-btn"
                      onClick={() => void handleStartNewConversation()}
                      className="rounded-xl bg-emerald-900 px-3 py-1.5 text-[11px] font-extrabold text-white hover:bg-emerald-800 transition"
                    >
                      + Start New Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSavedChatsPanel(false)}
                      className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-50"
                    >
                      Done
                    </button>
                  </div>
                </div>

                {/* Search Saved Conversations */}
                <div className="relative">
                  <input
                    type="search"
                    data-testid="saved-chats-search-input"
                    value={savedChatsSearch}
                    onChange={(e) => setSavedChatsSearch(e.target.value)}
                    placeholder="Search conversations by title or message..."
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 placeholder:text-stone-400 focus:border-emerald-700 focus:outline-none"
                  />
                </div>

                {filteredConversations.length === 0 ? (
                  <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center text-xs text-stone-500">
                    {conversations.length === 0
                      ? 'No saved conversations yet. Ask a question below to start your first conversation.'
                      : 'No conversations match your search.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {DATE_GROUP_ORDER.map((groupLabel) => {
                      const items = groupedConversations[groupLabel];
                      if (!items || items.length === 0) return null;
                      return (
                        <div
                          key={groupLabel}
                          data-testid={`saved-chats-group-${groupLabel
                            .toLowerCase()
                            .replace(/\s+/g, '-')}`}
                          className="space-y-1.5"
                        >
                          <div className="px-1 text-[10px] font-extrabold uppercase tracking-wider text-stone-500">
                            {groupLabel}
                          </div>
                          <div className="space-y-1.5">
                            {items.map((c) => {
                              const isSelected = c.id === activeConversationId;
                              const isRenaming = renamingConvId === c.id;
                              const isConfirmingDelete = confirmDeleteConvId === c.id;
                              const cachedTurns = turnsByConversationId[c.id];
                              const fallbackPreview =
                                cachedTurns && cachedTurns.length > 0
                                  ? cachedTurns[cachedTurns.length - 1].content.slice(0, 95)
                                  : 'New blank conversation — ready for your question';
                              const previewText =
                                c.last_message_preview || fallbackPreview;

                              return (
                                <div
                                  key={c.id}
                                  data-testid={`saved-chat-item-${c.id}`}
                                  data-selected={isSelected ? 'true' : 'false'}
                                  className={`rounded-2xl border p-3 transition ${
                                    isSelected
                                      ? 'border-emerald-700 bg-emerald-50/90 shadow-2xs'
                                      : 'border-stone-200/90 bg-white hover:border-emerald-300'
                                  }`}
                                >
                                  {isRenaming ? (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        data-testid={`rename-chat-input-${c.id}`}
                                        value={renameDraft}
                                        onChange={(e) => setRenameDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            void handleRenameConversation(c.id);
                                          } else if (e.key === 'Escape') {
                                            setRenamingConvId(null);
                                          }
                                        }}
                                        className="flex-1 rounded-lg border border-emerald-600 bg-white px-2.5 py-1 text-xs font-bold text-stone-900 focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        data-testid={`save-rename-chat-btn-${c.id}`}
                                        onClick={() => void handleRenameConversation(c.id)}
                                        className="rounded-lg bg-emerald-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setRenamingConvId(null)}
                                        className="rounded-lg border border-stone-300 bg-stone-50 px-2 py-1 text-[11px] font-bold text-stone-600"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : isConfirmingDelete ? (
                                    <div
                                      data-testid={`delete-confirm-box-${c.id}`}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 border border-rose-200 px-2.5 py-2 text-xs text-rose-950"
                                    >
                                      <span className="font-bold">
                                        Delete “{c.title}” permanently?
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          data-testid={`confirm-delete-chat-btn-${c.id}`}
                                          onClick={() =>
                                            void handleDeleteConversationById(c.id)
                                          }
                                          className="rounded-lg bg-rose-700 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-rose-800"
                                        >
                                          Confirm Delete
                                        </button>
                                        <button
                                          type="button"
                                          data-testid={`cancel-delete-chat-btn-${c.id}`}
                                          onClick={() => setConfirmDeleteConvId(null)}
                                          className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-700"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-start justify-between gap-2">
                                      <button
                                        type="button"
                                        data-testid={`saved-chat-open-${c.id}`}
                                        onClick={() => void loadConversationMessages(c.id)}
                                        className="min-w-0 flex-1 text-left space-y-1"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span
                                            data-testid={`saved-chat-title-${c.id}`}
                                            className="truncate text-xs font-extrabold text-stone-900"
                                          >
                                            {c.title}
                                          </span>
                                          {isSelected && (
                                            <span
                                              data-testid={`saved-chat-active-badge-${c.id}`}
                                              className="shrink-0 rounded-full bg-emerald-800 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white"
                                            >
                                              Active
                                            </span>
                                          )}
                                        </div>
                                        <p
                                          data-testid={`saved-chat-preview-${c.id}`}
                                          className="line-clamp-1 text-[11px] text-stone-600"
                                        >
                                          {previewText}
                                        </p>
                                        <div
                                          data-testid={`saved-chat-time-${c.id}`}
                                          className="text-[10px] font-medium text-stone-400"
                                        >
                                          {formatConversationUpdatedTime(c.updated_at)} ·{' '}
                                          {c.message_count} msgs
                                        </div>
                                      </button>

                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          data-testid={`rename-chat-btn-${c.id}`}
                                          title="Rename conversation"
                                          onClick={() => {
                                            setRenamingConvId(c.id);
                                            setRenameDraft(c.title);
                                            setConfirmDeleteConvId(null);
                                          }}
                                          className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-bold text-stone-700 hover:bg-stone-100"
                                        >
                                          Rename
                                        </button>
                                        <button
                                          type="button"
                                          data-testid={`delete-chat-btn-${c.id}`}
                                          title="Delete conversation"
                                          onClick={() => {
                                            setConfirmDeleteConvId(c.id);
                                            setRenamingConvId(null);
                                          }}
                                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100"
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
            )}

            {/* Distinct Scrollable Chat Conversation Area (Keyed by Active Conversation ID & Nonce for Strict Isolation) */}
            <div
              key={`conv-${activeConversationId ?? 'new'}-${chatViewNonce}`}
              data-testid="assistant-messages-viewport"
              data-active-conversation-id={activeConversationId ?? 'new'}
              className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4"
            >
              {turns.length === 0 ? (
                <div
                  data-testid="assistant-empty-welcome"
                  className="rounded-3xl border border-stone-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4 text-xs text-stone-700"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-xl shadow-2xs">
                      🌿
                    </span>
                    <div>
                      <h3 className="font-black text-emerald-950 text-base sm:text-lg tracking-tight">
                        What would you like to explore today?
                      </h3>
                      <div className="text-[11px] text-stone-500">
                        Ask anything about Indian foods, packaged product labels, or health conditions
                      </div>
                    </div>
                  </div>
                  <p className="text-stone-600 leading-relaxed">
                    GharPlate Assistant queries verified ICMR-NIN / IFCT 2017 food records, condition rules, and barcode providers first — never guessing missing (`NULL`) nutrient values or ingredients.
                  </p>
                  <div
                    data-testid="assistant-suggested-questions"
                    className="space-y-2 pt-1"
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                      Suggested Food &amp; Nutrition Questions:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedFollowups.map((q) => (
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
                        className="max-w-[88%] rounded-3xl rounded-br-lg bg-emerald-800 px-4 py-3 text-xs sm:text-[13px] font-semibold text-white shadow-sm space-y-1"
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
                        {/* Assistant Message Header & Copy Action */}
                        <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs">
                              🤖
                            </span>
                            <span className="text-[11px] font-extrabold text-emerald-950">
                              GharPlate Intelligence
                            </span>
                            {turn.modeUsed && (
                              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                                {turn.modeUsed.replace('_', ' ')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-stone-400">{turn.timestamp}</span>
                            <button
                              type="button"
                              data-testid="copy-answer-btn"
                              onClick={() => handleCopyAnswer(turn.id, turn.content)}
                              className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold text-stone-700 hover:bg-stone-100 transition"
                            >
                              {copiedTurnId === turn.id ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>

                        {/* Rich Structured Markdown Body */}
                        <AssistantMarkdown content={turn.content} />

                        {/* Tool Execution Trace Pills */}
                        {turn.toolTraces && turn.toolTraces.length > 0 && (
                          <div className="border-t border-stone-100 pt-2.5 space-y-1.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                              Verified Backend Tools Executed:
                            </div>
                            <div className="flex flex-wrap gap-1.5">
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
                          </div>
                        )}

                        {/* Verified Sources */}
                        {turn.sources && turn.sources.length > 0 && (
                          <div className="border-t border-stone-100 pt-2.5 space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                              Sources:
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {turn.sources.map((s, idx) =>
                                s.url && isSafeHref(s.url) ? (
                                  <a
                                    key={idx}
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-lg bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 transition"
                                  >
                                    {s.title} ↗
                                  </a>
                                ) : (
                                  <span
                                    key={idx}
                                    className="rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700"
                                  >
                                    {s.title}
                                  </span>
                                )
                              )}
                            </div>
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
                  Querying GharPlate database &amp; synthesising evidence-backed response…
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

              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Follow-Up Chips (when conversation has started) */}
            {turns.length > 0 && suggestedFollowups.length > 0 && (
              <div className="border-t border-stone-200/80 bg-white/95 px-4 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 shrink-0">
                  Follow-up:
                </span>
                {suggestedFollowups.map((q) => (
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

            {/* Pinned Multi-Line Input Area */}
            <div className="border-t border-stone-200 bg-white p-3.5 sm:p-4 space-y-2 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  aria-label="Ask GharPlate Input"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about this food, ingredients, allergens, barcode, or condition..."
                  className="flex-1 resize-none rounded-2xl border border-stone-300 bg-stone-50/70 px-3.5 py-2.5 text-xs sm:text-[13px] text-stone-900 placeholder:text-stone-400 focus:border-emerald-700 focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSendMessage()}
                  disabled={loading || !input.trim()}
                  className="rounded-2xl bg-emerald-900 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-800 transition disabled:opacity-50 shrink-0"
                >
                  Send ↑
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-stone-400">
                <span>
                  Educational nutrition information only · Not a medical diagnosis
                </span>
                <span className="hidden sm:inline">Enter to send · Shift+Enter for new line</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
