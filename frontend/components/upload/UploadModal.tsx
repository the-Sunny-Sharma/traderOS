"use client"

/**
 * components/upload/UploadModal.tsx
 *
 * INTERVIEW POINT — Drag and Drop API:
 * The HTML Drag and Drop API fires these events on the drop target:
 *   dragenter — something dragged into the element
 *   dragover  — something dragged over the element (must preventDefault to allow drop)
 *   dragleave — something dragged out of the element
 *   drop      — something dropped (e.dataTransfer.files has the files)
 *
 * The crucial detail: you MUST call e.preventDefault() on dragover
 * or the browser handles the drop itself (opens the file in a new tab).
 *
 * INTERVIEW POINT — Controlled modal pattern:
 * This modal is "controlled" — the parent owns the open/close state.
 * open + onClose props make it reusable from any parent.
 * Alternative: uncontrolled with a ref. Controlled is easier to test and reason about.
 *
 * INTERVIEW POINT — FormData for file uploads:
 * Files cannot be sent as JSON — they're binary data.
 * FormData creates a multipart/form-data body, same as a browser form submission.
 * The server receives it as multipart — this is what our Spring Boot endpoint expects.
 */

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useUploadReport } from "@/lib/queries/reports"
import {  cn } from "@/lib/utils"
import { getErrorMessage } from "@/lib/api"

interface UploadModalProps {
  open: boolean
  onClose: () => void
}

const BROKERS = [
  { value: "zerodha", label: "Zerodha", status: "stable" },
  { value: "groww", label: "Groww", status: "coming_soon" },
  { value: "upstox", label: "Upstox", status: "coming_soon" },
  { value: "dhan", label: "Dhan", status: "coming_soon" },
] as const

const FINANCIAL_YEARS = [
  "2024-25",
  "2023-24",
  "2022-23",
] as const

const TAX_REGIMES = [
  { value: "new", label: "New regime" },
  { value: "old", label: "Old regime" },
] as const

export function UploadModal({ open, onClose }: UploadModalProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [file, setFile] = useState<File | null>(null)
  const [broker, setBroker] = useState<string>("zerodha")
  const [fy, setFy] = useState<string>("2024-25")
  const [otherIncome, setOtherIncome] = useState<string>("0")
  const [regime, setRegime] = useState<string>("new")
  const [isDragging, setIsDragging] = useState(false)

  const uploadMutation = useUploadReport()

  // ── Drag and drop handlers ────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()           // REQUIRED — allows drop
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const dropped = e.dataTransfer.files[0]
    if (dropped && isValidFile(dropped)) {
      setFile(dropped)
    }
  }, [])

  function isValidFile(f: File): boolean {
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ]
    const validExtensions = [".xlsx", ".xls", ".csv"]
    const hasValidExtension = validExtensions.some((ext) =>
      f.name.toLowerCase().endsWith(ext)
    )
    return validTypes.includes(f.type) || hasValidExtension
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected && isValidFile(selected)) {
      setFile(selected)
    }
  }

  // ── Upload submit ─────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!file) return

    uploadMutation.mutate(
      {
        file,
        broker,
        fy,
        otherIncome: parseFloat(otherIncome) || 0,
        regime,
      },
      {
        onSuccess: (report) => {
          handleClose()
          // Navigate to report detail — the status poller will take over
          router.push(`/reports/${report.id}`)
        },
      }
    )
  }

  function handleClose() {
    if (uploadMutation.isPending) return
    setFile(null)
    uploadMutation.reset()
    onClose()
  }

  if (!open) return null

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      {/* Modal panel */}
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Upload P&L file
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Download from your broker&apos;s tax P&L section
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Broker selector ──────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Broker
            </label>
            <div className="grid grid-cols-4 gap-2">
              {BROKERS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => b.status === "stable" && setBroker(b.value)}
                  disabled={b.status === "coming_soon"}
                  className={cn(
                    "py-2 px-3 rounded-lg text-xs font-medium border transition-all relative",
                    broker === b.value && b.status === "stable"
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300",
                    b.status === "coming_soon"
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:border-zinc-400 dark:hover:border-zinc-500"
                  )}
                >
                  {b.label}
                  {b.status === "coming_soon" && (
                    <span className="absolute -top-1.5 -right-1 text-[9px] bg-zinc-200 dark:bg-zinc-700 text-zinc-500 px-1 rounded">
                      soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── FY + Regime row ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Financial year
              </label>
              <select
                value={fy}
                onChange={(e) => setFy(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
              >
                {FINANCIAL_YEARS.map((year) => (
                  <option key={year} value={year}>
                    FY {year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Tax regime
              </label>
              <select
                value={regime}
                onChange={(e) => setRegime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
              >
                {TAX_REGIMES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Other income ─────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Other annual income{" "}
              <span className="text-zinc-400 font-normal">(salary, freelance, etc.)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">₹</span>
              <input
                type="number"
                min="0"
                value={otherIncome}
                onChange={(e) => setOtherIncome(e.target.value)}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
              />
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Used to calculate advance tax and slab-based tax liability
            </p>
          </div>

          {/* ── File drop zone ───────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              P&L file
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer",
                isDragging
                  ? "border-zinc-400 bg-zinc-50 dark:bg-zinc-800 scale-[1.01]"
                  : file
                  ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950"
                  : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileInput}
                className="hidden"
              />

              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {file.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null) }}
                    className="ml-auto text-zinc-400 hover:text-zinc-600 text-xs underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <svg className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">XLSX, XLS, CSV up to 10MB</p>
                </>
              )}
            </div>
          </div>

          {/* Error */}
          {uploadMutation.isError && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-400">
              {getErrorMessage(uploadMutation.error)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
          <button
            onClick={handleClose}
            disabled={uploadMutation.isPending}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || uploadMutation.isPending}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all",
              "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900",
              "hover:bg-zinc-700 dark:hover:bg-zinc-200",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {uploadMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing…
              </>
            ) : (
              "Analyse taxes →"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}