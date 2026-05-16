import { NextRequest, NextResponse } from "next/server"

const SPRING_BOOT_URL = process.env.SPRING_BOOT_URL ?? "http://localhost:8080"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const springResponse = await fetch(
      `${SPRING_BOOT_URL}/api/auth/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )

    if (!springResponse.ok) {
      const error = await springResponse.json().catch(() => ({}))
      return NextResponse.json(
        { message: error.message ?? "Registration failed" },
        { status: springResponse.status }
      )
    }

    const data = await springResponse.json()
    const { token, email, fullName } = data

    const response = NextResponse.json({ email, fullName }, { status: 201 })

    response.cookies.set("traderos-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24,
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Register error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}