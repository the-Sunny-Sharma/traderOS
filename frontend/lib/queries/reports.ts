/**
 * lib/queries/reports.ts — TanStack Query hooks
 *
 * INTERVIEW POINT — Why TanStack Query:
 *
 * Every "fetch data in a component" pattern has these problems by default:
 *   1. Race conditions — two fetches, first one returns after second → stale data shown
 *   2. No deduplication — 5 components mount, 5 identical network requests fire
 *   3. No caching — navigate away and back, full refetch every time
 *   4. No background refresh — user sees stale data until they refresh the page
 *   5. Loading/error state boilerplate — useState for each
 *   6. No retry — one network blip = broken UI
 *
 * TanStack Query solves ALL of these. It's a server state manager:
 *   - Cache keyed by queryKey array
 *   - Deduplicates identical in-flight requests
 *   - Stale-while-revalidate: shows cached data instantly, fetches fresh in background
 *   - Automatic retry with exponential backoff
 *   - Window focus refetch — user tabs back, data refreshes
 *   - Optimistic updates for mutations
 *
 * INTERVIEW POINT — stale-while-revalidate:
 * An HTTP caching strategy (RFC 5861) where you return stale cached data
 * immediately (fast), while simultaneously fetching fresh data in the background.
 * The user sees something instantly, then the UI updates when fresh data arrives.
 * This is how Google, Facebook, and every major web app handles data loading.
 * TanStack Query implements this with staleTime + refetchOnWindowFocus.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query"
import { api, type ReportSummary, type ReportDetail } from "@/lib/api"

// ── Query Keys ────────────────────────────────────────────────────────────────
// INTERVIEW POINT: Query keys are the cache keys. Structure them hierarchically
// so you can invalidate at any level:
//   invalidate ['reports']        → invalidates ALL report queries
//   invalidate ['reports', id]    → invalidates only that report's detail
// This is the recommended pattern from TanStack Query docs.

export const reportKeys = {
  all: ["reports"] as const,
  lists: () => [...reportKeys.all, "list"] as const,
  detail: (id: string) => [...reportKeys.all, "detail", id] as const,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the user's reports list.
 * Cached for 30s — stale after that, refetches in background.
 */
export function useReports() {
  return useQuery({
    queryKey: reportKeys.lists(),
    queryFn: api.reports.list,
    staleTime: 30_000,           // consider data fresh for 30s
    refetchOnWindowFocus: true,  // refresh when user tabs back to the app
  })
}

/**
 * Fetches a single report's detail including tax summary.
 *
 * refetchInterval: polls every 2s while status is PENDING/PROCESSING.
 * Stops automatically once status is COMPLETED or FAILED.
 *
 * INTERVIEW POINT — Why polling over WebSockets here:
 * WebSockets maintain a persistent connection — expensive for a rarely-changing
 * status field. Polling every 2s is cheap and sufficient. We use SSE for
 * real-time AI streaming (one-way server→client). The right tool for each job.
 */
export function useReport(id: string, options?: Partial<UseQueryOptions<ReportDetail>>) {
  return useQuery({
    queryKey: reportKeys.detail(id),
    queryFn: () => api.reports.get(id),
    staleTime: 5_000,
    // Poll while processing — stop once terminal state reached
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === "COMPLETED" || status === "FAILED") return false
      return 2_000 // poll every 2s
    },
    ...options,
  })
}

/**
 * Upload mutation — handles file upload with proper cache invalidation.
 *
 * INTERVIEW POINT — useMutation vs useQuery:
 * useQuery: read operations, GET requests, cached, automatically refetched
 * useMutation: write operations, POST/PUT/DELETE, not cached, triggered manually
 *
 * After a successful upload, we invalidate the reports list cache so
 * the new report appears immediately without a manual page refresh.
 * This is called "cache invalidation" — one of the two hard problems in CS.
 */
export function useUploadReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      file,
      broker,
      fy,
      otherIncome,
      regime,
    }: {
      file: File
      broker: string
      fy: string
      otherIncome: number
      regime: string
    }) => api.reports.upload(file, broker, fy, otherIncome, regime),

    onSuccess: (newReport) => {
      // Invalidate the reports list — triggers a background refetch
      queryClient.invalidateQueries({ queryKey: reportKeys.lists() })

      // Optimistically add the new report to the list cache
      // INTERVIEW POINT — Optimistic updates:
      // Update the UI immediately without waiting for the server refetch.
      // If the server returns different data, TanStack Query corrects it.
      // This makes the app feel instant.
      queryClient.setQueryData<ReportSummary[]>(
        reportKeys.lists(),
        (old) => (old ? [newReport as ReportSummary, ...old] : [newReport as ReportSummary])
      )
    },
  })
}