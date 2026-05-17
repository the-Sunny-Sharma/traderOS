"use client"

/**
 * components/reports/AIChatPanel.tsx
 *
 * AI chat that explains the user's tax assessment and answers questions.
 *
 * INTERVIEW POINT — Streaming AI responses:
 * We use the Fetch API with ReadableStream, not axios.
 * Reason: axios buffers the entire response body before resolving the promise.
 * fetch() gives access to response.body as a ReadableStream immediately.
 * We pipe it through a TextDecoder and update state on each chunk.
 * This is the same technique used by ChatGPT, Claude, and Cursor.
 *
 * INTERVIEW POINT — RAG (Retrieval-Augmented Generation):
 * We inject the user's actual tax data into the AI prompt as context.
 * The AI doesn't "know" this user's trades — we TELL it via the system prompt.
 * This is a simple but powerful form of RAG: retrieve relevant data
 * (the tax summary), augment the prompt with it, generate a response.
 *
 * Full RAG with a vector database would chunk tax law documents into embeddings,
 * retrieve the most relevant sections at query time, and inject those too.
 * We'll add that in Phase 5. For now, the summary context alone is very useful.
 *
 * INTERVIEW POINT — Conversation history:
 * LLMs are stateless — each API call is independent. To have a "conversation",
 * you must send the full message history on every request. We store messages
 * in React state and send them all to the API route each time.
 * This is exactly what ChatGPT does. The context window is the "memory".
 *
 * INTERVIEW POINT — Why the AI call goes through a Next.js API route:
 * The Gemini API key must never be exposed to the browser bundle.
 * The Next.js API route runs on the server — it reads the key from env vars
 * and makes the Gemini call. The browser never sees the key.
 */

import { useState, useRef, useEffect, useCallback } from "react"
import { type TaxSummary } from "@/lib/api"
import { formatINR, cn } from "@/lib/utils"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface Props {
  reportId: string
  summary: TaxSummary
}

// Pre-built questions that surface the most useful AI answers
const SUGGESTED_QUESTIONS = [
  "Why do I need a tax audit?",
  "What is ITR-3 and how do I file it?",
  "How is my intraday turnover calculated?",
  "What expenses can I deduct?",
  "How do I pay advance tax?",
]

export function AIChatPanel({ reportId, summary }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || isStreaming) return

      const userMessage: Message = { role: "user", content: messageText.trim() }
      const updatedMessages = [...messages, userMessage]

      setMessages(updatedMessages)
      setInput("")
      setError(null)
      setIsStreaming(true)

      // Add empty assistant message that we'll fill via streaming
      setMessages((prev) => [...prev, { role: "assistant", content: "" }])

      try {
        /**
         * INTERVIEW POINT — The fetch call:
         * We call our Next.js API route, NOT Gemini directly.
         * The API route:
         *   1. Reads the GEMINI_API_KEY from server env vars
         *   2. Builds the prompt with RAG context (tax summary)
         *   3. Calls Gemini with streaming enabled
         *   4. Pipes the stream back to the browser
         *
         * The browser receives a stream of text chunks and appends them
         * to the last message in state — word by word.
         */
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            reportId,
            messages: updatedMessages,
            summary, // inject tax data as RAG context
          }),
        })

        if (!response.ok) {
          throw new Error(`AI service error: ${response.status}`)
        }

        if (!response.body) throw new Error("No response stream")

        // ── Read the stream chunk by chunk ──────────────────────────────
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })

          // Each chunk may contain multiple SSE "data: ..." lines
          // We parse them and append each piece to the last message
          const lines = chunk.split("\n")
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim()
              if (data === "[DONE]") continue
              try {
                const parsed = JSON.parse(data)
                const text = parsed.text ?? parsed.content ?? data
                setMessages((prev) => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + text,
                    }
                  }
                  return updated
                })
              } catch {
                // If not JSON, treat raw chunk as text directly
                if (data && data !== "[DONE]") {
                  setMessages((prev) => {
                    const updated = [...prev]
                    const last = updated[updated.length - 1]
                    if (last.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        content: last.content + data,
                      }
                    }
                    return updated
                  })
                }
              }
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get AI response")
        // Remove the empty assistant message on error
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setIsStreaming(false)
      }
    },
    [messages, isStreaming, reportId, summary]
  )

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Submit on Enter (not Shift+Enter — that's a newline)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col h-[680px] xl:sticky xl:top-20">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tax AI</p>
            <p className="text-xs text-zinc-400">Ask anything about your assessment</p>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Welcome state with context summary */}
        {messages.length === 0 && (
          <WelcomeState summary={summary} />
        )}

        {/* Message history */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} isStreaming={isStreaming && i === messages.length - 1} />
        ))}

        {/* Error */}
        {error && (
          <div className="text-xs text-red-500 dark:text-red-400 px-1">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions — show when no messages yet */}
      {messages.length === 0 && (
        <div className="px-4 pb-3 shrink-0">
          <p className="text-xs text-zinc-400 mb-2">Suggested questions</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={isStreaming}
                className="text-xs px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 pb-4 shrink-0 border-t border-zinc-100 dark:border-zinc-800 pt-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            rows={1}
            placeholder="Ask about your taxes…"
            className={cn(
              "flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors",
              "bg-zinc-50 dark:bg-zinc-800",
              "border-zinc-200 dark:border-zinc-700",
              "text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400",
              "focus:border-zinc-400 dark:focus:border-zinc-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "max-h-32 overflow-y-auto"
            )}
            style={{ lineHeight: "1.5" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            className={cn(
              "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all",
              "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900",
              "hover:bg-zinc-700 dark:hover:bg-zinc-200",
              "disabled:opacity-30 disabled:cursor-not-allowed"
            )}
          >
            {isStreaming ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-[10px] text-zinc-400 mt-2 text-center">
          AI responses are for guidance only. Consult a CA for filing advice.
        </p>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WelcomeState({ summary }: { summary: TaxSummary }) {
  const netPnl = summary.netFnoPnl + summary.netIntradayPnl + summary.netDeliveryPnl
  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950 dark:to-indigo-950 border border-violet-100 dark:border-violet-900">
        <p className="text-xs font-medium text-violet-700 dark:text-violet-400 mb-2">
          Your tax assessment at a glance
        </p>
        <div className="space-y-1.5 text-xs text-violet-800 dark:text-violet-300">
          <p>📋 File: <span className="font-medium">{summary.itrForm}</span></p>
          <p>🔍 Audit: <span className="font-medium">{summary.auditRequired ? "Required" : "Not required"}</span></p>
          <p>📊 Net P&L: <span className={cn("font-medium", netPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>{formatINR(netPnl)}</span></p>
          <p>💰 Deductions: <span className="font-medium">{formatINR(summary.deductibleExpenses)}</span></p>
        </div>
      </div>
      <p className="text-xs text-zinc-400 text-center px-4">
        I have full context of your assessment. Ask me anything.
      </p>
    </div>
  )
}

function MessageBubble({
  message,
  isStreaming,
}: {
  message: Message
  isStreaming: boolean
}) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5 mr-2">
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
          </svg>
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-tr-sm"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-tl-sm"
        )}
      >
        {message.content || (
          isStreaming && (
            // Typing indicator while waiting for first chunk
            <span className="flex gap-1 items-center py-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          )
        )}
        {/* Streaming cursor */}
        {isStreaming && message.content && (
          <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse align-text-bottom" />
        )}
      </div>
    </div>
  )
}