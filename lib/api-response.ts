import { NextResponse } from "next/server"
import type { ApiResponse } from "@/types/api"

export function successResponse<T>(data: T, message?: string): NextResponse<ApiResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    message,
  })
}

export function errorResponse(error: string, status = 400): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status },
  )
}

export function notFoundResponse(resource = "Resource"): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: `${resource} not found`,
    },
    { status: 404 },
  )
}

export function serverErrorResponse(error?: string): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: error || "Internal server error",
    },
    { status: 500 },
  )
}
