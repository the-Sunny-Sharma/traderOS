"use client"

/**
 * app/(auth)/login/page.tsx
 *
 * Route group: (auth) — the parentheses mean this folder is NOT part of the URL.
 * The page is accessible at /login, not /auth/login.
 * Route groups let you share layouts without affecting the URL structure.
 *
 * INTERVIEW POINT — React Hook Form + Zod:
 * react-hook-form manages form state WITHOUT re-rendering on every keystroke.
 * It uses uncontrolled inputs (refs) internally — the DOM holds the value,
 * not React state. This makes forms with 10+ fields stay at 60fps.
 *
 * Zod provides schema-based validation. The schema is the single source of
 * truth — it validates on the client AND can be reused on the server (API routes).
 * @hookform/resolvers bridges the two: zod schema → react-hook-form validation.
 *
 * INTERVIEW POINT — Why not useState for forms:
 * const [email, setEmail] = useState("") → re-render on every keystroke
 * react-hook-form → zero re-renders until submit or explicit trigger
 * For a login form this doesn't matter. For a 20-field form, it's the difference
 * between 60fps and janky UI.
 */

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useMutation } from "@tanstack/react-query"
import { useAuthStore } from "@/lib/stores/authStore"
import { getErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"

// ── Validation schemas ────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

const registerSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one number"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

type LoginForm = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

// ── API calls ─────────────────────────────────────────────────────────────────

async function loginRequest(data: LoginForm) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? "Login failed")
  }
  return res.json()
}

async function registerRequest(data: Omit<RegisterForm, "confirmPassword">) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? "Registration failed")
  }
  return res.json()
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<"login" | "register">("login")
  const { login } = useAuthStore()

  const redirectTo = searchParams.get("redirect") ?? "/dashboard"
  const sessionExpired = searchParams.get("reason") === "session_expired"

  // ── Login form ──────────────────────────────────────────────────────────
  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (data) => {
      login({ email: data.email, fullName: data.fullName })
      router.push(redirectTo)
    },
  })

  // ── Register form ───────────────────────────────────────────────────────
  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  })

  const registerMutation = useMutation({
    mutationFn: (data: RegisterForm) =>
      registerRequest({ fullName: data.fullName, email: data.email, password: data.password }),
    onSuccess: (data) => {
      login({ email: data.email, fullName: data.fullName })
      router.push("/dashboard")
    },
  })

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — branding ─────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-zinc-950 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <span className="text-zinc-950 font-bold text-sm">T</span>
          </div>
          <span className="text-white font-semibold text-lg">TraderOS</span>
        </div>

        <div>
          <blockquote className="text-zinc-300 text-xl leading-relaxed font-light mb-8">
            "93% of F&O traders lose money. All of them still owe taxes.
            TraderOS makes sure you pay exactly what you owe — not a rupee more."
          </blockquote>
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {["S", "R", "A", "M"].map((letter, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-zinc-700 border-2 border-zinc-950 flex items-center justify-center text-xs text-zinc-300 font-medium"
                >
                  {letter}
                </div>
              ))}
            </div>
            <p className="text-zinc-400 text-sm">
              Trusted by traders across Zerodha, Groww & Upstox
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-6 border-t border-zinc-800 pt-8">
          {[
            { value: "ICAI", label: "8th Ed. compliant" },
            { value: "AY 25-26", label: "Assessment year" },
            { value: "ITR-3", label: "F&O form ready" },
          ].map((stat) => (
            <div key={stat.value}>
              <p className="text-white font-semibold text-lg">{stat.value}</p>
              <p className="text-zinc-500 text-xs mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-7 h-7 rounded-md bg-zinc-950 flex items-center justify-center">
              <span className="text-white font-bold text-xs">T</span>
            </div>
            <span className="font-semibold">TraderOS</span>
          </div>

          {/* Session expired banner */}
          {sessionExpired && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm dark:bg-amber-950 dark:border-amber-800 dark:text-amber-400">
              Your session expired. Please sign in again.
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-900 p-1 mb-8">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                  tab === t
                    ? "bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}
              >
                {t === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {/* ── Login form ─────────────────────────────────────────────── */}
          {tab === "login" && (
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                Welcome back
              </h1>
              <p className="text-zinc-500 text-sm mb-8">
                Sign in to your TraderOS account
              </p>

              <form
                onSubmit={loginForm.handleSubmit((data) =>
                  loginMutation.mutate(data)
                )}
                className="space-y-4"
              >
                <Field
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  error={loginForm.formState.errors.email?.message}
                  {...loginForm.register("email")}
                />
                <Field
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  error={loginForm.formState.errors.password?.message}
                  {...loginForm.register("password")}
                />

                {loginMutation.isError && (
                  <ErrorBanner message={getErrorMessage(loginMutation.error)} />
                )}

                <SubmitButton
                  loading={loginMutation.isPending}
                  label="Sign in"
                />
              </form>
            </div>
          )}

          {/* ── Register form ──────────────────────────────────────────── */}
          {tab === "register" && (
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                Create your account
              </h1>
              <p className="text-zinc-500 text-sm mb-8">
                Start calculating your F&O taxes in minutes
              </p>

              <form
                onSubmit={registerForm.handleSubmit((data) =>
                  registerMutation.mutate(data)
                )}
                className="space-y-4"
              >
                <Field
                  label="Full name"
                  type="text"
                  placeholder="Sunny Sharma"
                  error={registerForm.formState.errors.fullName?.message}
                  {...registerForm.register("fullName")}
                />
                <Field
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  error={registerForm.formState.errors.email?.message}
                  {...registerForm.register("email")}
                />
                <Field
                  label="Password"
                  type="password"
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                  error={registerForm.formState.errors.password?.message}
                  {...registerForm.register("password")}
                />
                <Field
                  label="Confirm password"
                  type="password"
                  placeholder="••••••••"
                  error={registerForm.formState.errors.confirmPassword?.message}
                  {...registerForm.register("confirmPassword")}
                />

                {registerMutation.isError && (
                  <ErrorBanner message={getErrorMessage(registerMutation.error)} />
                )}

                <SubmitButton
                  loading={registerMutation.isPending}
                  label="Create account"
                />
              </form>
            </div>
          )}

          <p className="mt-8 text-center text-xs text-zinc-400">
            By continuing, you agree to TraderOS&apos;s{" "}
            <a href="#" className="underline hover:text-zinc-600">
              Terms
            </a>{" "}
            and{" "}
            <a href="#" className="underline hover:text-zinc-600">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

import { forwardRef } from "react"

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, ...props }, ref) => (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
        {label}
      </label>
      <input
        ref={ref}
        className={cn(
          "w-full px-3 py-2.5 rounded-lg border text-sm transition-colors outline-none",
          "bg-white dark:bg-zinc-900",
          "text-zinc-900 dark:text-zinc-100",
          "placeholder:text-zinc-400",
          error
            ? "border-red-300 dark:border-red-700 focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900"
            : "border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800"
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  )
)
Field.displayName = "Field"

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-400">
      {message}
    </div>
  )
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={cn(
        "w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
        "bg-zinc-900 text-white hover:bg-zinc-700",
        "dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2"
      )}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </span>
      ) : (
        label
      )}
    </button>
  )
}