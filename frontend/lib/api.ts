/**
 * lib/api.ts — Typed API client for TraderOS
 *
 * Architecture decisions explained:
 *
 * 1. WHY AXIOS over fetch:
 *    - Request/response interceptors (add JWT, handle 401 globally)
 *    - Automatic JSON serialization/deserialization
 *    - Request timeout support (fetch has no native timeout in older browsers)
 *    - Better error objects (response body on error, not just status)
 *    - Retry logic via interceptors
 *
 * 2. WHY PROXY through Next.js API routes:
 *    - JWT never touches browser JS (set as HttpOnly cookie by the server)
 *    - CORS: browser calls same-origin Next.js, Next.js calls Spring Boot
 *    - API URL never exposed to client bundle
 *    - Can add rate limiting, caching, auth refresh in one place
 *
 * 3. WHY TYPED RESPONSES:
 *    - TypeScript catches field mismatches at compile time
 *    - IDE autocomplete on every API response
 *    - Refactoring is safe — rename a field, TypeScript shows every usage
 *
 * INTERVIEW POINT — Interceptor pattern:
 *   Axios interceptors implement the Chain of Responsibility pattern.
 *   Every request/response passes through a chain of handlers in order.
 *   This is how Spring's filter chain works too — same concept, different layer.
 */

import axios, { AxiosError, type AxiosInstance } from "axios"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string
  email: string
  fullName: string
}

export interface ReportSummary {
  id: string
  brokerName: string
  fy: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  createdAt: string | null
}

export interface TaxSummary {
  fnoTurnover: number
  intradayTurnover: number
  deliveryTurnover: number
  netFnoPnl: number
  netIntradayPnl: number
  netDeliveryPnl: number
  auditRequired: boolean
  auditReason: string
  itrForm: string
  itrReason: string | null
  advanceTaxQ1: number
  advanceTaxQ2: number
  advanceTaxQ3: number
  advanceTaxQ4: number
  deductibleExpenses: number
  estimatedTotalTax: number | null
}

export interface ReportDetail extends ReportSummary {
  taxSummary: TaxSummary | null
}

export interface UploadResponse {
  id: string
  brokerName: string
  fy: string
  status: "PENDING"
  createdAt: string | null
}

export interface ApiError {
  message: string
  status: number
}

// ── Retry configuration ───────────────────────────────────────────────────────

const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: (attempt: number) => Math.pow(2, attempt) * 1000, // exponential backoff
  retryableStatuses: [408, 429, 500, 502, 503, 504],
}

/**
 * INTERVIEW POINT — Exponential Backoff:
 * When a server is overloaded, hammering it with retries makes things worse.
 * Exponential backoff spaces retries: 1s, 2s, 4s, 8s...
 * This is used by every production HTTP client and AWS SDK by default.
 * The formula: delay = baseDelay * 2^attempt
 * Add jitter (random offset) to prevent retry storms when many clients
 * fail simultaneously: delay = baseDelay * 2^attempt + Math.random() * 1000
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Create axios instance ─────────────────────────────────────────────────────

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: "/api/proxy", // Next.js API route proxies to Spring Boot
    timeout: 30_000,       // 30s — file uploads can be slow
    headers: {
      "Content-Type": "application/json",
    },
    withCredentials: true, // send HttpOnly cookies automatically
  })

  // ── Request interceptor ───────────────────────────────────────────────────
  // Runs before EVERY request. Attach auth token, add request ID for tracing.
  client.interceptors.request.use(
    (config) => {
      // Request ID for distributed tracing — matches logs across services
      // INTERVIEW POINT: In microservices, a requestId flows through all services
      // so you can trace one user action across 5 service logs.
      config.headers["X-Request-ID"] = crypto.randomUUID()
      return config
    },
    (error) => Promise.reject(error)
  )

  // ── Response interceptor ──────────────────────────────────────────────────
  // Runs after EVERY response. Handle errors globally, implement retry logic.
  client.interceptors.response.use(
    (response) => response, // success — pass through unchanged

    async (error: AxiosError) => {
      const config = error.config as typeof error.config & {
        _retryCount?: number
      }

      if (!config) return Promise.reject(error)

      // Initialize retry counter
      config._retryCount = config._retryCount ?? 0

      const status = error.response?.status ?? 0
      const shouldRetry =
        config._retryCount < RETRY_CONFIG.maxRetries &&
        RETRY_CONFIG.retryableStatuses.includes(status)

      if (shouldRetry) {
        config._retryCount++
        const delay = RETRY_CONFIG.retryDelay(config._retryCount)
        console.warn(
          `Request failed with ${status}. Retry ${config._retryCount}/${RETRY_CONFIG.maxRetries} in ${delay}ms`
        )
        await sleep(delay)
        return client(config) // retry the request
      }

      // 401 — token expired or invalid → redirect to login
      // INTERVIEW POINT: Never handle 401 in individual components — handle
      // it globally in the interceptor. Otherwise every component needs
      // "if error.status === 401 redirect to login" duplicated everywhere.
      if (status === 401) {
        // Clear auth state and redirect
        window.location.href = "/login?reason=session_expired"
        return Promise.reject(error)
      }

      // 429 — rate limited. The server tells us when to retry via Retry-After header.
      if (status === 429) {
        const retryAfter = error.response?.headers["retry-after"]
        console.warn(`Rate limited. Retry after ${retryAfter}s`)
      }

      return Promise.reject(error)
    }
  )

  return client
}

export const apiClient = createApiClient()

// ── API methods ───────────────────────────────────────────────────────────────
// Typed wrappers — callers never touch axios directly.
// This means you can swap axios for fetch later without changing any component.

export const api = {
  // Auth
  auth: {
    login: async (email: string, password: string): Promise<AuthResponse> => {
      const { data } = await apiClient.post<AuthResponse>("/auth/login", {
        email,
        password,
      })
      return data
    },

    register: async (
      email: string,
      password: string,
      fullName: string
    ): Promise<AuthResponse> => {
      const { data } = await apiClient.post<AuthResponse>("/auth/register", {
        email,
        password,
        fullName,
      })
      return data
    },

    logout: async (): Promise<void> => {
      await apiClient.post("/auth/logout")
    },
  },

  // Reports
  reports: {
    list: async (): Promise<ReportSummary[]> => {
      const { data } = await apiClient.get<ReportSummary[]>("/reports")
      return data
    },

    get: async (id: string): Promise<ReportDetail> => {
      const { data } = await apiClient.get<ReportDetail>(`/reports/${id}`)
      return data
    },

    upload: async (
      file: File,
      broker: string,
      fy: string,
      otherIncome: number,
      regime: string
    ): Promise<UploadResponse> => {
      const formData = new FormData()
      formData.append("file", file)

      const { data } = await apiClient.post<UploadResponse>(
        `/reports/upload?broker=${broker}&fy=${encodeURIComponent(fy)}&otherIncome=${otherIncome}&regime=${regime}`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120_000, // 2min for large files
        }
      )
      return data
    },
  },

  // AI chat
  ai: {
    /**
     * Send a message to the AI about a specific report.
     * Returns a ReadableStream for streaming responses.
     *
     * INTERVIEW POINT — Streaming vs regular response:
     * For AI responses that take 3-10s to generate, streaming shows the
     * user text appearing word by word (like ChatGPT). This dramatically
     * improves perceived performance — users start reading immediately.
     * We use the Fetch API here (not axios) because axios buffers the
     * entire response before resolving. Fetch's ReadableStream is native.
     */
    chat: async (reportId: string, message: string): Promise<Response> => {
      return fetch(`/api/proxy/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reportId, message }),
      })
    },
  },
}

/**
 * Extract a human-readable error message from any error type.
 * Use this in catch blocks — never expose raw axios errors to users.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    // Server returned a structured error body
    const serverMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data

    if (typeof serverMessage === "string") return serverMessage
    if (error.response?.status === 413) return "File is too large. Maximum size is 10MB."
    if (error.response?.status === 415) return "Invalid file type. Please upload an XLSX or CSV file."
    if (error.response?.status === 429) return "Too many requests. Please wait a moment and try again."
    if (error.code === "ECONNABORTED") return "Request timed out. Please check your connection."
  }

  if (error instanceof Error) return error.message
  return "An unexpected error occurred. Please try again."
}