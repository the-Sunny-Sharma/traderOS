import { NextResponse } from "next/server"

export async function POST() {
  const response = NextResponse.json({ success: true })

  // Clear the HttpOnly cookie by setting maxAge to 0
  response.cookies.set("traderos-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,  // expires immediately
    path: "/",
  })

  return response
}