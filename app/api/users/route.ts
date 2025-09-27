import type { NextRequest } from "next/server"
import { successResponse, errorResponse, serverErrorResponse } from "@/lib/api-response"
import { handleCors } from "@/lib/cors"
import type { User, CreateUserRequest } from "@/types/api"

// Mock data - replace with your database
const users: User[] = [
  {
    id: "1",
    email: "john@example.com",
    name: "John Doe",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
]

export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  try {
    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "10")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    const paginatedUsers = users.slice(offset, offset + limit)

    return successResponse({
      users: paginatedUsers,
      total: users.length,
      limit,
      offset,
    })
  } catch (error) {
    return serverErrorResponse()
  }
}

export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  try {
    const body: CreateUserRequest = await request.json()

    if (!body.email || !body.name) {
      return errorResponse("Email and name are required")
    }

    // Check if user already exists
    const existingUser = users.find((user) => user.email === body.email)
    if (existingUser) {
      return errorResponse("User with this email already exists", 409)
    }

    const newUser: User = {
      id: Date.now().toString(),
      email: body.email,
      name: body.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    users.push(newUser)

    return successResponse(newUser, "User created successfully")
  } catch (error) {
    return serverErrorResponse()
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleCors(request)
}
