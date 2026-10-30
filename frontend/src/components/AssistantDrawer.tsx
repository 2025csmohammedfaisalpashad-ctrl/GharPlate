import React, { useEffect, useRef, useState } from 'react';
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
  modeUsed?: string;
  modelUsed?: string;
  ollamaConnected?: boolean;
  toolTraces?: AssistantToolExecutionTrace[];
  sources?: AssistantSourceReference[];
}

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
  const [suggestedFollowups, setSuggestedFollowups] = useState<string[]>([
    'What are the ingredients in this product?',
    'Does it contain milk, egg, wheat, or soy?',
    'Why are the nutritional values missing (NULL)?',
    'Which foods are reviewed for Fever recovery?',
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
    if (isOpen && messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, isOpen, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || loading) return;

    const userTurn: ChatTurn = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: query,
    };

    const historyPayload: AssistantChatMessage[] = turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));

    setTurns((prev) => [...prev, userTurn]);
    if (!textToSend) setInput('');
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

  return (
    <>
      {/* Floating Ask GharPlate Button on the Right Side of Every Page */}
      <button
        type="button"
        data-testid="ask-gharplate-fab"
        aria-label="Ask GharPlate AI Assistant"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-5 lg:bottom-7 lg:right-7 z-40 flex items-center gap-2.5 rounded-full bg-emerald-900 px-5 py-3.5 text-xs sm:text-sm font-extrabold text-white shadow-xl ring-4 ring-emerald-900/15 hover:bg-emerald-800 hover:scale-[1.02] transition"
      >
        <span className="text-base">🤖</span>
        <span>Ask GharPlate</span>
        {activeFoodSlug && (
          <span className="hidden sm:inline-block rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-stone-950">
            Page Context Active
          </span>
        )}
      </button>

      {/* Right-Side Interactive Assistant Drawer */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Ask GharPlate AI Assistant Drawer"
          data-testid="assistant-drawer"
          className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-xs"
        >
          <div className="relative flex h-full w-full max-w-lg flex-col bg-[#FAF8F5] shadow-2xl border-l border-stone-200">
            {/* Drawer Header */}
            <div className="bg-emerald-950 text-white p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🤖</span>
                    <h2 className="text-base sm:text-lg font-black">
                      Ask GharPlate Assistant
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        status?.ollama_reachable
                          ? 'bg-emerald-400 text-stone-950'
                          : 'bg-amber-300 text-stone-950'
                      }`}
                    >
                      {status?.ollama_reachable
                        ? `Ollama: ${status.active_model || 'Ready'}`
                        : 'Local Tool Engine Ready'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-emerald-200/90">
                    Database-first Indian food, barcode, ingredient & condition intelligence
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {turns.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTurns([]);
                        setError(null);
                      }}
                      className="rounded-xl bg-emerald-900/90 px-2.5 py-1.5 text-[11px] font-bold text-emerald-100 hover:bg-emerald-800"
                    >
                      Clear Chat
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Close Assistant Drawer"
                    onClick={() => setIsOpen(false)}
                    className="rounded-xl bg-emerald-900 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-800"
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
                    className={`rounded-xl py-1.5 px-2 transition ${
                      selectedMode === m.id
                        ? 'bg-white text-emerald-950 shadow-xs font-extrabold'
                        : 'text-emerald-100 hover:bg-emerald-800/60'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Context & Model Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeFoodSlug && (
                    <span className="rounded-lg bg-emerald-800 px-2 py-0.5 font-semibold">
                      📦 Food: {activeFoodSlug}
                    </span>
                  )}
                  {activeConditionCode && (
                    <span className="rounded-lg bg-emerald-800 px-2 py-0.5 font-semibold">
                      🩺 Condition: {activeConditionCode}
                    </span>
                  )}
                  {activeMember && (
                    <span className="rounded-lg bg-emerald-800 px-2 py-0.5 font-semibold">
                      👤 Member: {activeMember.display_name} ({activeMember.dietary_preference})
                    </span>
                  )}
                </div>

                {status && status.installed_models.length > 1 && (
                  <select
                    aria-label="Select Ollama Model"
                    value={selectedModel}
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

            {/* Chat Conversation History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {turns.length === 0 ? (
                <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs space-y-3 text-xs text-stone-700">
                  <div className="font-extrabold text-stone-900 text-sm">
                    Ask anything about what’s on this page or in GharPlate
                  </div>
                  <p className="text-stone-500 leading-relaxed">
                    The assistant queries GharPlate’s real SQLite database, condition rules, and external barcode providers first — never guessing nutrient values or ingredients.
                  </p>
                  <div className="space-y-1.5 pt-1">
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
                    <div
                      className={`max-w-[92%] rounded-2xl p-4 text-xs leading-relaxed shadow-xs space-y-2.5 ${
                        turn.role === 'user'
                          ? 'bg-emerald-800 text-white font-semibold'
                          : 'bg-white border border-stone-200 text-stone-800'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{turn.content}</div>

                      {/* Tool Execution Trace Badges */}
                      {turn.toolTraces && turn.toolTraces.length > 0 && (
                        <div className="border-t border-stone-100 pt-2 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            Verified Tools Executed ({turn.modeUsed}):
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {turn.toolTraces.map((tr, idx) => (
                              <span
                                key={`${tr.tool_name}-${idx}`}
                                title={tr.summary}
                                className="rounded-md bg-stone-100 border border-stone-200 px-2 py-0.5 font-mono text-[10px] font-semibold text-stone-700"
                              >
                                🔧 {tr.tool_name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Verified Sources */}
                      {turn.sources && turn.sources.length > 0 && (
                        <div className="border-t border-stone-100 pt-2 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            Sources:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {turn.sources.map((s, idx) =>
                              s.url ? (
                                <a
                                  key={idx}
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] font-bold text-emerald-800 underline hover:text-emerald-600"
                                >
                                  {s.title} ↗
                                </a>
                              ) : (
                                <span
                                  key={idx}
                                  className="text-[11px] font-semibold text-stone-600"
                                >
                                  {s.title}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
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
              <div className="border-t border-stone-200 bg-stone-50 px-4 py-2 flex items-center gap-1.5 overflow-x-auto">
                {suggestedFollowups.slice(0, 3).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void handleSendMessage(q)}
                    className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-1 text-[11px] font-bold text-stone-700 hover:border-emerald-600 hover:text-emerald-900"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Chat Input Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendMessage();
              }}
              className="border-t border-stone-200 bg-white p-3.5 space-y-2"
            >
              <div className="flex items-end gap-2">
                <textarea
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    activeFoodSlug
                      ? `Ask about ${activeFoodSlug} (ingredients, allergens, barcode, missing nutrients)...`
                      : 'Ask about any food, barcode, ingredient list, or health condition...'
                  }
                  aria-label="Ask GharPlate Input"
                  className="flex-1 resize-none rounded-2xl border border-stone-300 px-3.5 py-2.5 text-xs text-stone-900 focus:border-emerald-700 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="rounded-2xl bg-emerald-800 px-4 py-3 text-xs font-extrabold text-white shadow hover:bg-emerald-700 disabled:opacity-40"
                >
                  Send
                </button>
              </div>
              <div className="text-[10px] text-stone-400 flex items-center justify-between">
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
