/**
 * app/api/proxy/[...path]/route.ts — Reverse proxy to Spring Boot
 *
 * INTERVIEW POINT — Catch-all route segments:
 * [...path] matches any number of segments after /api/proxy/
 * /api/proxy/reports          → params.path = ["reports"]
 * /api/proxy/reports/abc-123  → params.path = ["reports", "abc-123"]
 * /api/proxy/auth/login       → params.path = ["auth", "login"]
 *
 * This single file proxies ALL requests to Spring Boot.
 * The browser calls /api/proxy/anything, this reads the HttpOnly cookie,
 * adds the JWT as Authorization: Bearer header, and forwards to Spring Boot.
 *
 * INTERVIEW POINT — Why proxy instead of browser → Spring Boot directly:
 * 1. CORS: browser can't call localhost:8080 from localhost:3000 without CORS config
 * 2. Security: JWT stays in HttpOnly cookie, browser JS never touches it
 * 3. Flexibility: can add caching, rate limiting, request transformation here
 * 4. Single origin: all requests go to :3000, cleaner CSP headers
 *
 * INTERVIEW POINT — This is the BFF pattern (Backend For Frontend):
 * A dedicated backend layer for a specific frontend client. The BFF owns
 * auth token management, request transformation, and response shaping.
 * Netflix, Spotify, and Zalando popularized this pattern.
 */

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const SPRING_BOOT_URL = process.env.SPRING_BOOT_URL ?? "http://localhost:8080"

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get("traderos-token")?.value

  // Build the target URL — preserve query params
  const targetPath = path.join("/")
  const queryString = request.nextUrl.search
  const targetUrl = `${SPRING_BOOT_URL}/api/${targetPath}${queryString}`

  // Forward headers, add Authorization
  const headers = new Headers()
  headers.set("Authorization", `Bearer ${token ?? ""}`)

  // Forward content-type for POST/PUT requests
  const contentType = request.headers.get("content-type")
  if (contentType) headers.set("Content-Type", contentType)

  // Add tracing header — same request ID flows through Next.js → Spring Boot → Python
  headers.set("X-Request-ID", request.headers.get("x-request-id") ?? crypto.randomUUID())

  try {
    const body =
      request.method !== "GET" && request.method !== "HEAD"
        ? await request.blob()  // preserves binary data for file uploads
        : undefined

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    })

    // Stream the response back — important for large responses and SSE
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } catch (error) {
    console.error(`Proxy error for ${targetUrl}:`, error)
    return NextResponse.json(
      { message: "Service temporarily unavailable" },
      { status: 503 }
    )
  }
}

// Export handlers for all HTTP methods
export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler