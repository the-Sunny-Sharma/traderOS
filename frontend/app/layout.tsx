/**
 * app/layout.tsx — Root layout
 *
 * This is the entry point for every page. It wraps all pages with:
 *   1. QueryClientProvider — TanStack Query's context (required)
 *   2. Font loading — Inter via next/font (zero layout shift)
 *   3. HTML metadata
 *
 * INTERVIEW POINT — Why next/font:
 * Google Fonts loaded via <link> cause layout shift (FOUC — Flash of Unstyled Content)
 * because the font loads asynchronously. next/font downloads the font at BUILD TIME,
 * hosts it on your domain, and injects it as a CSS variable before any content renders.
 * Zero layout shift, zero external network request, better Lighthouse score.
 *
 * INTERVIEW POINT — Provider placement:
 * QueryClientProvider must wrap every component that uses useQuery/useMutation.
 * Putting it in the root layout means the entire app has access.
 * QueryClient is created OUTSIDE the component (not in useState/useMemo) so it
 * survives hot reloads in development without resetting the cache.
 */

import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",  // matches the CSS variable in globals.css
})

export const metadata: Metadata = {
  title: {
    default: "TraderOS — F&O Tax Calculator",
    template: "%s | TraderOS",
  },
  description:
    "AI-powered F&O tax calculator for Indian retail traders. ICAI-compliant turnover calculation, audit assessment, and ITR form recommendation.",
  keywords: ["F&O tax", "trading tax India", "ITR-3", "Section 44AB", "tax calculator"],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}