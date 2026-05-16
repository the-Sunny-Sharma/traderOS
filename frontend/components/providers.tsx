"use client"

/**
 * components/providers.tsx
 *
 * INTERVIEW POINT — Why a separate Providers component:
 *
 * app/layout.tsx is a Server Component by default (no "use client").
 * Server Components cannot use React Context or hooks.
 * QueryClientProvider uses React Context internally → needs "use client".
 *
 * The solution: extract all providers into a Client Component, import it
 * into the Server Component layout. The layout stays a Server Component
 * (better performance), the providers get their "use client" boundary.
 *
 * This is the recommended Next.js App Router pattern.
 * The layout renders on the server, Providers hydrates on the client.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { useState } from "react"

/**
 * INTERVIEW POINT — QueryClient configuration:
 *
 * defaultOptions apply to every query/mutation unless overridden.
 *
 * staleTime: 60_000 — data is considered fresh for 60s globally.
 * Individual queries can override this (e.g., the status poller uses 5s).
 *
 * retry: 2 — TanStack Query retries failed queries 2 times automatically.
 * Combine with our axios retry for a two-layer retry strategy:
 *   - Axios retries: network-level (500, 502, 503, 504)
 *   - TanStack Query retries: query-level (any error)
 *
 * gcTime (garbage collection time, formerly cacheTime):
 * How long inactive queries stay in memory. After 5 minutes of no subscribers,
 * the cache entry is deleted. Next time it's needed, a fresh fetch fires.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // useState ensures each browser tab gets its own QueryClient instance.
  // NEVER create QueryClient at module level in Next.js — it would be shared
  // across ALL server requests (one user's cache bleeds into another's).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 2,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: true,
          },
          mutations: {
            retry: 0, // Don't retry mutations — side effects may be non-idempotent
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* DevTools only loads in development — zero production bundle cost */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}