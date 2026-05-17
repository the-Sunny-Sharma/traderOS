"use client"

/**
 * components/reports/TaxSummaryPanel.tsx
 *
 * Displays the complete tax assessment in a modern SaaS card layout.
 *
 * INTERVIEW POINT — Recharts:
 * Recharts is a React wrapper around D3. It uses React components for
 * SVG elements, making it composable and type-safe. The ResponsiveContainer
 * reads the parent's width via ResizeObserver — no hardcoded pixel widths.
 *
 * INTERVIEW POINT — Component decomposition:
 * Each "card" in this panel is its own function. This keeps each unit
 * testable in isolation and makes the code readable at every level.
 * You read the top-level and understand the layout. You read a card
 * function and understand exactly what it renders.
 */

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { type TaxSummary } from "@/lib/api"
import { formatINR, cn } from "@/lib/utils"

interface Props {
  summary: TaxSummary
}

export function TaxSummaryPanel({ summary }: Props) {
  return (
    <div className="space-y-4">
      {/* ── Hero row — key verdict cards ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <VerdictCard
          label="ITR Form"
          value={summary.itrForm}
          description={
            summary.itrForm === "ITR-3"
              ? "Has business income (intraday/F&O)"
              : "Capital gains only"
          }
          color="blue"
        />
        <VerdictCard
          label="Tax Audit"
          value={summary.auditRequired ? "Required" : "Not required"}
          description={
            summary.auditRequired
              ? "Under Section 44AB"
              : "Below audit threshold"
          }
          color={summary.auditRequired ? "amber" : "green"}
        />
        <VerdictCard
          label="Net P&L"
          value={formatINR(
            summary.netFnoPnl + summary.netIntradayPnl + summary.netDeliveryPnl
          )}
          description="Across all segments"
          color={
            summary.netFnoPnl + summary.netIntradayPnl + summary.netDeliveryPnl >= 0
              ? "green"
              : "red"
          }
        />
      </div>

      {/* ── Turnover breakdown ──────────────────────────────────────────── */}
      <SectionCard title="Turnover Breakdown" subtitle="ICAI 8th Edition compliant">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <TurnoverChart summary={summary} />
          <div className="space-y-3">
            <TurnoverRow
              label="F&O Turnover"
              amount={summary.fnoTurnover}
              pnl={summary.netFnoPnl}
              rule="Abs. P&L per trade"
            />
            <TurnoverRow
              label="Intraday Equity"
              amount={summary.intradayTurnover}
              pnl={summary.netIntradayPnl}
              rule="Abs. P&L per trade"
            />
            <TurnoverRow
              label="Delivery Equity"
              amount={summary.deliveryTurnover}
              pnl={summary.netDeliveryPnl}
              rule="Full sell value"
            />
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex justify-between text-sm font-semibold">
              <span className="text-zinc-700 dark:text-zinc-300">Total Speculative</span>
              <span className="text-zinc-900 dark:text-zinc-100">
                {formatINR(summary.fnoTurnover + summary.intradayTurnover)}
              </span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Audit reason ───────────────────────────────────────────────── */}
      {summary.auditRequired && (
        <div className="flex gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
          <div className="mt-0.5 shrink-0">
            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-0.5">
              Tax Audit Required
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {summary.auditReason}
            </p>
          </div>
        </div>
      )}

      {/* ── Advance tax schedule ────────────────────────────────────────── */}
      <SectionCard
        title="Advance Tax Schedule"
        subtitle="Section 211 — pay to avoid interest under Section 234B/234C"
      >
        <AdvanceTaxChart summary={summary} />
      </SectionCard>

      {/* ── Deductions ─────────────────────────────────────────────────── */}
      <SectionCard
        title="Section 37 Deductions"
        subtitle="Business expenses deductible from trading income"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {formatINR(summary.deductibleExpenses)}
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Estimated deductible expenses (STT, brokerage, exchange charges)
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-400 mb-1">Includes</p>
            {["STT paid", "Brokerage", "Exchange charges", "SEBI fees"].map((item) => (
              <p key={item} className="text-xs text-zinc-500">
                {item}
              </p>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VerdictCard({
  label,
  value,
  description,
  color,
}: {
  label: string
  value: string
  description: string
  color: "blue" | "green" | "red" | "amber"
}) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
    green: "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800",
    red: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
    amber: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
  }
  const textColors = {
    blue: "text-blue-900 dark:text-blue-100",
    green: "text-emerald-900 dark:text-emerald-100",
    red: "text-red-900 dark:text-red-100",
    amber: "text-amber-900 dark:text-amber-100",
  }
  const subColors = {
    blue: "text-blue-600 dark:text-blue-400",
    green: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  }
  return (
    <div className={cn("rounded-xl border p-4", colors[color])}>
      <p className={cn("text-xs font-medium uppercase tracking-wide mb-2", subColors[color])}>
        {label}
      </p>
      <p className={cn("text-xl font-semibold mb-1", textColors[color])}>{value}</p>
      <p className={cn("text-xs", subColors[color])}>{description}</p>
    </div>
  )
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
      <div className="mb-5">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">{title}</h3>
        <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function TurnoverRow({
  label,
  amount,
  pnl,
  rule,
}: {
  label: string
  amount: number
  pnl: number
  rule: string
}) {
  const isProfit = pnl >= 0
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
        <p className="text-xs text-zinc-400">{rule}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {formatINR(amount)}
        </p>
        <p className={cn("text-xs", isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
          {isProfit ? "+" : ""}{formatINR(pnl)}
        </p>
      </div>
    </div>
  )
}

const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#10b981"]

function TurnoverChart({ summary }: { summary: TaxSummary }) {
  const data = [
    { name: "F&O", value: Number(summary.fnoTurnover) },
    { name: "Intraday", value: Number(summary.intradayTurnover) },
    { name: "Delivery", value: Number(summary.deliveryTurnover) },
  ].filter((d) => d.value > 0)

  if (data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-zinc-400 text-sm">No turnover data</div>
  }

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={65}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [formatINR(value), "Turnover"]}
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function AdvanceTaxChart({ summary }: { summary: TaxSummary }) {
  const quarters = [
    { quarter: "Q1 (Jun 15)", amount: Number(summary.advanceTaxQ1), deadline: "15 Jun" },
    { quarter: "Q2 (Sep 15)", amount: Number(summary.advanceTaxQ2), deadline: "15 Sep" },
    { quarter: "Q3 (Dec 15)", amount: Number(summary.advanceTaxQ3), deadline: "15 Dec" },
    { quarter: "Q4 (Mar 15)", amount: Number(summary.advanceTaxQ4), deadline: "15 Mar" },
  ]

  const total = quarters.reduce((s, q) => s + q.amount, 0)

  if (total === 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
        <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          No advance tax due. Your estimated total tax is below the ₹10,000 threshold.
        </p>
      </div>
    )
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={quarters} barSize={32}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="deadline"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => [formatINR(value), "Amount due"]}
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}