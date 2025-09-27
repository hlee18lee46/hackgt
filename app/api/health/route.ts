import type { NextRequest } from "next/server"
import { successResponse } from "@/lib/api-response"
import { handleCors } from "@/lib/cors"

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  return successResponse(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    },
    "API is running",
  )
}

export async function OPTIONS(request: NextRequest) {
  return handleCors(request)
}
