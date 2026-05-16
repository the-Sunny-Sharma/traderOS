/**
 * app/api/auth/login/route.ts
 *
 * This is a Next.js Route Handler (App Router equivalent of pages/api).
 * It runs on the SERVER — never exposed to the browser.
 *
 * Flow:
 *   Browser → POST /api/auth/login (this file)
 *          → POST http://traderos-api:8080/api/auth/login (Spring Boot)
 *          ← JWT token in response body
 *          → Set JWT as HttpOnly cookie
 *          ← 200 OK with user info (no token in body — browser never sees it)
 *
 * INTERVIEW POINT — The BFF Pattern (Backend For Frontend):
 * This Next.js API route acts as a BFF — it sits between the browser and
 * Spring Boot, handling auth token management. The browser never gets the
 * JWT directly. This is the same pattern used by Vercel, Stripe, and Linear.
 *
 * Why this matters for security:
 *   - JWT in localStorage: XSS attack → attacker reads token → account stolen
 *   - JWT in HttpOnly cookie: XSS attack → attacker cannot read cookie → safe
 *
 * INTERVIEW POINT — Same-site vs Same-origin:
 * Same-origin: protocol + host + port must match exactly
 * Same-site: only the registrable domain needs to match
 * SameSite=Strict on our cookie means it's NEVER sent on cross-site requests.
 * This prevents CSRF — an attacker's site can't trigger authenticated actions.
 */

import { NextRequest, NextResponse } from "next/server"

const SPRING_BOOT_URL = process.env.SPRING_BOOT_URL ?? "http://localhost:8080"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Forward to Spring Boot
    const springResponse = await fetch(
      `${SPRING_BOOT_URL}/api/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )

    if (!springResponse.ok) {
      const error = await springResponse.json().catch(() => ({}))
      return NextResponse.json(
        { message: error.message ?? "Invalid credentials" },
        { status: springResponse.status }
      )
    }

    const data = await springResponse.json()
    const { token, email, fullName } = data

    // Set JWT as HttpOnly cookie — browser JS cannot read this
    const response = NextResponse.json(
      { email, fullName },  // return user info but NOT the token
      { status: 200 }
    )

    response.cookies.set("traderos-token", token, {
      httpOnly: true,      // JS cannot access — prevents XSS token theft
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      sameSite: "strict",  // never sent on cross-site requests — prevents CSRF
      maxAge: 60 * 60 * 24, // 24 hours — matches Spring Boot JWT expiry
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    )
  }
}