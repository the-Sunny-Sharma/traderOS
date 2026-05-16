import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * cn — class name utility used by every shadcn component.
 *
 * Combines two libraries:
 *   clsx        — conditionally joins class strings
 *                 cn("foo", isActive && "bar") → "foo bar" or "foo"
 *   tailwind-merge — resolves Tailwind conflicts intelligently
 *                 cn("p-4", "p-8") → "p-8"  (last wins, no duplicate)
 *                 Without twMerge: "p-4 p-8" → both apply, unpredictable
 *
 * INTERVIEW POINT:
 * Tailwind generates atomic utility classes. When you write "p-4 p-8" both
 * classes are in the CSS — whichever appears later in the stylesheet wins,
 * NOT whichever appears later in your className string. This makes dynamic
 * overrides unreliable. tailwind-merge understands Tailwind's class groups
 * and keeps only the last class in each group. It's the standard solution
 * in every production Tailwind codebase.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as Indian Rupees.
 * Uses Intl.NumberFormat — no external library needed.
 *
 * formatINR(42364.13) → "₹42,364.13"
 * formatINR(0)        → "₹0.00"
 */
export function formatINR(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value
  if (isNaN(num)) return "₹0.00"
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Format ISO date string to readable format.
 * formatDate("2026-05-15T06:25:53.400379") → "15 May 2026"
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—"
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * Map report status to display config.
 * Single source of truth — used in badges, icons, colors.
 */
export function getStatusConfig(status: string) {
  const configs = {
    COMPLETED: {
      label: "Completed",
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
      darkColor: "dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-800",
    },
    PENDING: {
      label: "Pending",
      color: "text-amber-600 bg-amber-50 border-amber-200",
      darkColor: "dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800",
    },
    PROCESSING: {
      label: "Processing",
      color: "text-blue-600 bg-blue-50 border-blue-200",
      darkColor: "dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800",
    },
    FAILED: {
      label: "Failed",
      color: "text-red-600 bg-red-50 border-red-200",
      darkColor: "dark:text-red-400 dark:bg-red-950 dark:border-red-800",
    },
  } as const

  return configs[status as keyof typeof configs] ?? configs.PENDING
}