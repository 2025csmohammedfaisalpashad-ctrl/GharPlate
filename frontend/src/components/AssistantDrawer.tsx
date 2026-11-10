import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AssistantWorkspacePanel } from './AssistantWorkspacePanel';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocation } from 'react-router-dom';
import {
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

export type VoiceAssistantState =
  | 'Ready'
  | 'Listening'
  | 'Processing speech'
  | 'Reviewing transcription'
  | 'Thinking'
  | 'Speaking'
  | 'Error';

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
const STORAGE_VOICE_AUTOSPEAK_KEY = 'gharplate_assistant_voice_autospeak';
const STORAGE_VOICE_LANG_KEY = 'gharplate_assistant_voice_lang';
const STORAGE_VOICE_RATE_KEY = 'gharplate_assistant_voice_rate';
const MIN_ASSISTANT_WIDTH = 360;
const DEFAULT_ASSISTANT_WIDTH = 540;

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
 * Strips Markdown formatting so spoken SpeechSynthesis output sounds natural and clear.
 */
export function cleanMarkdownForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~>•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Safe, rich Markdown renderer for Ask GharPlate Assistant messages.
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
  return <AssistantWorkspacePanel />;
};
