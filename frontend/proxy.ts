/**
 * middleware.ts — Next.js Edge Middleware
 *
 * INTERVIEW POINT — What is Edge Middleware:
 * Middleware runs at the CDN edge (Vercel's edge network, ~300 locations globally)
 * BEFORE the request reaches your Next.js server. This means:
 *   - Auth checks happen in <5ms, not 50-200ms (no server cold start)
 *   - Unauthenticated users are redirected before any page code runs
 *   - No wasted server compute on unauthorized requests
 *   - Scales infinitely — no server involved
 *
 * INTERVIEW POINT — Edge Runtime constraints:
 * Edge runs in a V8 isolate (not Node.js). It cannot use:
 *   - Node.js built-ins (fs, path, crypto from 'node:crypto')
 *   - Most npm packages that depend on Node.js internals
 * It CAN use: Web Crypto API, fetch, Response, Request, URL, Headers
 *
 * This is why we use Web Crypto (crypto.subtle) for JWT verification here,
 * not the 'jsonwebtoken' npm package (which uses Node.js crypto).
 *
 * INTERVIEW POINT — HttpOnly cookie auth flow:
 * 1. User logs in → Next.js API route calls Spring Boot → gets JWT
 * 2. Next.js API route sets JWT as HttpOnly cookie (JS can't read this)
 * 3. Every browser request automatically includes the cookie
 * 4. This middleware reads the cookie and verifies it
 * 5. Protected pages redirect to /login if cookie is missing/invalid
 *
 * This is more secure than localStorage JWT because:
 *   - XSS attacks cannot steal the token (JS can't access HttpOnly cookies)
 *   - CSRF is mitigated by SameSite=Strict cookie attribute
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/reports"]

// Routes that should redirect to dashboard if already authenticated
const AUTH_ROUTES = ["/login"]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Read the auth token from HttpOnly cookie
  const token = request.cookies.get("traderos-token")?.value

  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  )
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route))

  // Unauthenticated user trying to access protected route → redirect to login
  if (isProtectedRoute && !token) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname) // remember where they were going
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user trying to access login → redirect to dashboard
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

/**
 * Matcher config — which paths middleware runs on.
 *
 * INTERVIEW POINT — Why not match everything:
 * Middleware runs on EVERY matched request, including static files.
 * Matching /_next/static/** would run auth checks on CSS/JS files — wasteful.
 * Exclude static files and API routes that don't need auth.
 */
export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     * - /api/auth/* (auth endpoints themselves don't need auth)
     */
    "/((?!_next/static|_next/image|favicon.ico|public|api/auth).*)",
  ],
}