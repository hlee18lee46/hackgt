import { type NextRequest, NextResponse } from "next/server"
import { corsHeaders } from "@/lib/cors"

export function middleware(request: NextRequest) {
  // Add CORS headers to all API responses
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = NextResponse.next()

    // Add CORS headers
    Object.entries(corsHeaders()).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
