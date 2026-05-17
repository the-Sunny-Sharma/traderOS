"use client"

/**
 * app/(app)/reports/[id]/page.tsx
 *
 * INTERVIEW POINT — Dynamic segments in App Router:
 * [id] is a dynamic segment. The folder name becomes a route parameter.
 * /reports/abc-123 → params.id = "abc-123"
 *
 * INTERVIEW POINT — Status polling pattern:
 * When status is PENDING/PROCESSING, useReport() polls every 2s via
 * refetchInterval. Once COMPLETED, polling stops automatically.
 * The UI transitions from a loading skeleton → full tax summary.
 * No WebSocket needed — polling is simpler and sufficient here.
 *
 * INTERVIEW POINT — Streaming AI responses:
 * The AI chat uses fetch() with a ReadableStream, not axios.
 * Axios buffers the full response before resolving — useless for streaming.
 * fetch() gives you the stream immediately, letting you show text
 * word-by-word as Gemini generates it. This is how ChatGPT's UI works.
 */

import { use } from "react"
import { useRouter } from "next/navigation"
import { useReport } from "@/lib/queries/reports"
import { TaxSummaryPanel } from "@/components/reports/TaxSummaryPanel"
import { AIChatPanel } from "@/components/reports/AIChatPanel"
import { formatDate, cn } from "@/lib/utils"

interface PageProps {
  params: Promise<{ id: string }>
}

export default function ReportDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()

  const { data: report, isLoading, isError } = useReport(id)

  // ── Loading skeleton (initial load or polling) ────────────────────────────
  if (isLoading) return <PageSkeleton />

  if (isError || !report) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-500 mb-4">Report not found or failed to load</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm underline text-zinc-900 dark:text-zinc-100"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Processing state ──────────────────────────────────────────────────────
  if (report.status === "PENDING" || report.status === "PROCESSING") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto mb-6 shadow-sm">
            <svg className="animate-spin h-7 w-7 text-zinc-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Analysing your trades
          </h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            Parsing your P&L file, calculating ICAI-compliant turnover,
            and preparing your tax assessment. This takes about 10–30 seconds.
          </p>
          <div className="mt-6 flex justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Failed state ──────────────────────────────────────────────────────────
  if (report.status === "FAILED") {
    return (
      <PageShell report={report}>
        <div className="text-center py-20 border-2 border-dashed border-red-200 dark:border-red-900 rounded-2xl">
          <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Processing failed</h3>
          <p className="text-zinc-500 text-sm mb-6 max-w-xs mx-auto">
            We couldn&apos;t process your file. Make sure you uploaded a Zerodha Tax P&L report (not a P&L Statement).
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      </PageShell>
    )
  }

  // ── Completed — main content ──────────────────────────────────────────────
  return (
    <PageShell report={report}>
      {report.taxSummary ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Tax summary takes 2/3 on wide screens */}
          <div className="xl:col-span-2">
            <TaxSummaryPanel summary={report.taxSummary} />
          </div>
          {/* AI chat takes 1/3 */}
          <div className="xl:col-span-1">
            <AIChatPanel reportId={report.id} summary={report.taxSummary} />
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-zinc-500">
          Tax summary not available for this report.
        </div>
      )}
    </PageShell>
  )
}

// ── Layout wrapper shared across all states ───────────────────────────────────

function PageShell({
  report,
  children,
}: {
  report: { brokerName: string; fy: string; status: string; createdAt: string | null }
  children: React.ReactNode
}) {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Navbar */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Reports
          </button>
          <span className="text-zinc-200 dark:text-zinc-700">/</span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {report.brokerName.charAt(0) + report.brokerName.slice(1).toLowerCase()} · FY {report.fy}
          </span>
          <span className="text-xs text-zinc-400 ml-auto hidden sm:block">
            {formatDate(report.createdAt)}
          </span>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 h-14" />
      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          {[80, 60, 100, 80].map((w, i) => (
            <div key={i} className="h-32 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
        <div className="h-[600px] rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      </div>
    </div>
  )
}