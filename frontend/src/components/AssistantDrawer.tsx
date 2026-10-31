import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocation } from 'react-router-dom';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  AssistantChatMessage,
  AssistantSourceReference,
  AssistantStatusResponse,
  AssistantToolExecutionTrace,
} from '../types/api';

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modeUsed?: string;
  modelUsed?: string;
  ollamaConnected?: boolean;
  toolTraces?: AssistantToolExecutionTrace[];
  sources?: AssistantSourceReference[];
}

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
  const { household, activeMember } = useHousehold();

  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<AssistantStatusResponse | null>(null);
  const [selectedMode, setSelectedMode] = useState<
    'database_only' | 'automatic' | 'online_search'
  >('automatic');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);

  // Interactive Resizing & Docking State (persisted in localStorage)
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

  useEffect(() => {
    if (isOpen && !status) {
      void api
        .getAssistantStatus()
        .then((res) => {
          setStatus(res);
          if (res.active_model) setSelectedModel(res.active_model);
        })
        .catch(() => null);
    }
  }, [isOpen, status]);

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
    }
  }, [activeFoodSlug, activeConditionCode]);

  useEffect(() => {
    if (
      isOpen &&
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
    // When docked right, dragging left (negative deltaX) increases width
    // When docked left, dragging right (positive deltaX) increases width
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

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || loading) return;

    const nowTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const userTurn: ChatTurn = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: nowTime,
    };

    const historyPayload: AssistantChatMessage[] = turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));

    setTurns((prev) => [...prev, userTurn]);
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

      const assistantTurn: ChatTurn = {
        id: `a_${Date.now()}`,
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

      setTurns((prev) => [...prev, assistantTurn]);
      if (resp.suggested_followups && resp.suggested_followups.length > 0) {
        setSuggestedFollowups(resp.suggested_followups);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant request failed.');
    } finally {
      setLoading(false);
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
            className={`relative z-10 flex h-full w-full sm:my-3 sm:mx-3 sm:h-[calc(100vh-1.5rem)] flex-col overflow-hidden bg-[#FAF8F5] sm:rounded-3xl shadow-[0_24px_64px_-12px_rgba(6,78,59,0.35)] border border-stone-200/90 ring-1 ring-emerald-950/10 transition-transform duration-200 motion-reduce:transition-none`}
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
                    Database-first Indian food, barcode, ingredient & condition intelligence
                  </p>
                </div>

                {/* Window Action Controls (Dock Side, Clear Chat, Close) */}
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

                  {turns.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTurns([]);
                        setError(null);
                      }}
                      className="rounded-xl bg-emerald-900/90 border border-emerald-700/60 px-2.5 py-1.5 text-[11px] font-bold text-emerald-100 hover:bg-emerald-800 transition"
                    >
                      Clear Chat
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

            {/* Distinct Scrollable Chat Conversation Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {turns.length === 0 ? (
                <div className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-xs space-y-3.5 text-xs text-stone-700">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-100 text-lg">
                      🌿
                    </span>
                    <div>
                      <div className="font-extrabold text-stone-900 text-sm">
                        Ask anything about what’s on this page or in GharPlate
                      </div>
                      <div className="text-[11px] text-stone-500">
                        Drag the {dockSide === 'right' ? 'left' : 'right'} edge anytime to resize this window
                      </div>
                    </div>
                  </div>
                  <p className="text-stone-600 leading-relaxed">
                    The assistant queries GharPlate’s verified SQLite database, condition rules, and external barcode providers first — never guessing nutrient values or ingredients.
                  </p>
                  <div className="space-y-2 pt-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                      Suggested Questions:
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
                            <span className="text-[10px] text-stone-400">
                              {turn.timestamp}
                            </span>
                            <button
                              type="button"
                              data-testid="copy-answer-btn"
                              onClick={() => handleCopyAnswer(turn.id, turn.content)}
                              className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold text-stone-700 hover:bg-emerald-50 hover:text-emerald-900 transition"
                            >
                              {copiedTurnId === turn.id ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>

                        {/* Rich Markdown Answer Content */}
                        <AssistantMarkdown content={turn.content} />

                        {/* Tool Execution Trace Badges */}
                        {turn.toolTraces && turn.toolTraces.length > 0 && (
                          <div className="border-t border-stone-100 pt-2.5 space-y-1.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                              Verified Tools Executed ({turn.modeUsed}):
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
                                    className="rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600"
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
                  data-testid="assistant-loading"
                  className="rounded-2xl border border-stone-200 bg-white p-4 text-xs font-bold text-emerald-900 animate-pulse"
                >
                  🔍 Checking GharPlate database & running verified tools...
                </div>
              )}

              {error && (
                <div
                  data-testid="assistant-error"
                  className="rounded-2xl border border-rose-300 bg-rose-50 p-3.5 text-xs font-bold text-rose-900"
                >
                  ⚠️ {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Follow-up Suggestions Strip */}
            {turns.length > 0 && suggestedFollowups.length > 0 && (
              <div className="border-t border-stone-200/80 bg-stone-50 px-4 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
                {suggestedFollowups.slice(0, 3).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void handleSendMessage(q)}
                    className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-1 text-[11px] font-bold text-stone-700 hover:border-emerald-600 hover:text-emerald-900 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Fixed Bottom Message Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendMessage();
              }}
              className="border-t border-stone-200/90 bg-white p-3.5 sm:p-4 space-y-2 shrink-0"
            >
              <div className="flex items-end gap-2.5 rounded-2xl border border-stone-300 bg-stone-50/70 p-2 focus-within:border-emerald-700 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-700/15 transition">
                <textarea
                  ref={textareaRef}
                  rows={2}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    activeFoodSlug
                      ? `Ask about ${activeFoodSlug} (ingredients, allergens, barcode, missing nutrients)...`
                      : 'Ask about any food, barcode, ingredient list, or health condition...'
                  }
                  aria-label="Ask GharPlate Input"
                  className="flex-1 resize-none border-0 bg-transparent px-2 py-1 text-xs sm:text-[13px] leading-relaxed text-stone-900 placeholder-stone-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 transition shrink-0"
                >
                  {loading ? 'Sending...' : 'Send ↑'}
                </button>
              </div>
              <div className="text-[10px] text-stone-400 flex flex-wrap items-center justify-between gap-2 px-1">
                <span>Press Enter to send • Shift+Enter for new line</span>
                <span>Educational only — not medical advice</span>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
