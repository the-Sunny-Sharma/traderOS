"use client"

/**
 * app/(app)/dashboard/page.tsx
 *
 * ARCHITECTURE NOTE:
 * This is a Client Component because it uses:
 *   - useReports() hook (TanStack Query — needs React context)
 *   - useAuthStore() (Zustand)
 *   - useState for upload modal
 *
 * In a larger app you'd fetch the initial reports list as a Server Component
 * using React Server Components + async/await, then hydrate with TanStack Query.
 * For now Client Component is the right pragmatic choice.
 *
 * INTERVIEW POINT — When to use Server vs Client Components for data fetching:
 * Server Component: initial page load data, SEO-critical content, no interactivity
 * Client Component: user-specific data that changes, needs polling, has interactions
 * Reports list = user-specific + needs polling (status updates) → Client Component
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useReports } from "@/lib/queries/reports"
import { useAuthStore, selectUser } from "@/lib/stores/authStore"
import { formatDate, formatINR, getStatusConfig, cn } from "@/lib/utils"
import { UploadModal } from "@/components/upload/UploadModal"

export default function DashboardPage() {
  const router = useRouter()
  const user = useAuthStore(selectUser)
  const [uploadOpen, setUploadOpen] = useState(false)

  const { data: reports, isLoading, isError, refetch } = useReports()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-zinc-950 dark:bg-white flex items-center justify-center">
              <span className="text-white dark:text-zinc-950 font-bold text-xs">T</span>
            </div>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">TraderOS</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 hidden sm:block">
              {user?.fullName}
            </span>
            <LogoutButton />
          </div>
        </div>
      </nav>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Header row */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Tax Reports
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Upload your broker P&L file to get your F&O tax assessment
            </p>
          </div>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload P&L
          </button>
        </div>

        {/* ── Reports list ──────────────────────────────────────────────── */}
        {isLoading && <ReportsListSkeleton />}

        {isError && (
          <div className="text-center py-16">
            <p className="text-zinc-500 mb-4">Failed to load reports</p>
            <button
              onClick={() => refetch()}
              className="text-sm text-zinc-900 dark:text-zinc-100 underline"
            >
              Try again
            </button>
          </div>
        )}

        {reports && reports.length === 0 && (
          <EmptyState onUpload={() => setUploadOpen(true)} />
        )}

        {reports && reports.length > 0 && (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                onClick={() =>
                  report.status === "COMPLETED"
                    ? router.push(`/reports/${report.id}`)
                    : null
                }
                className={cn(
                  "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5",
                  "flex items-center justify-between gap-4",
                  "transition-all",
                  report.status === "COMPLETED"
                    ? "cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-sm"
                    : "cursor-default"
                )}
              >
                {/* Left — broker + date */}
                <div className="flex items-center gap-4">
                  <BrokerIcon broker={report.brokerName} />
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
                      {report.brokerName.charAt(0) + report.brokerName.slice(1).toLowerCase()}
                      {" · "}
                      <span className="text-zinc-500">FY {report.fy}</span>
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {formatDate(report.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Right — status badge */}
                <div className="flex items-center gap-3">
                  <StatusBadge status={report.status} />
                  {report.status === "COMPLETED" && (
                    <svg
                      className="w-4 h-4 text-zinc-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  {(report.status === "PENDING" || report.status === "PROCESSING") && (
                    <ProcessingSpinner />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Upload modal ─────────────────────────────────────────────────── */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config = getStatusConfig(status)
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        config.color,
        config.darkColor
      )}
    >
      {config.label}
    </span>
  )
}

function BrokerIcon({ broker }: { broker: string }) {
  const initials = broker.charAt(0)
  const colors: Record<string, string> = {
    ZERODHA: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    GROWW: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    UPSTOX: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    DHAN: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  }
  return (
    <div
      className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold",
        colors[broker] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      )}
    >
      {initials}
    </div>
  )
}

function ProcessingSpinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ReportsListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-32 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-5 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-full animate-pulse" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="text-center py-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
      <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">
        No reports yet
      </h3>
      <p className="text-zinc-500 text-sm mb-6">
        Upload your Zerodha Tax P&L file to get started
      </p>
      <button
        onClick={onUpload}
        className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
      >
        Upload your first P&L
      </button>
    </div>
  )
}

function LogoutButton() {
  const router = useRouter()
  const { logout } = useAuthStore()

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    logout()
    router.push("/login")
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
    >
      Sign out
    </button>
  )
}