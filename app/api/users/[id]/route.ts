import type { NextRequest } from "next/server"
import { successResponse, notFoundResponse, serverErrorResponse } from "@/lib/api-response"
import { handleCors } from "@/lib/cors"
import type { User } from "@/types/api"

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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  try {
    const user = users.find((u) => u.id === params.id)

    if (!user) {
      return notFoundResponse("User")
    }

    return successResponse(user)
  } catch (error) {
    return serverErrorResponse()
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  try {
    const body = await request.json()
    const userIndex = users.findIndex((u) => u.id === params.id)

    if (userIndex === -1) {
      return notFoundResponse("User")
    }

    users[userIndex] = {
      ...users[userIndex],
      ...body,
      updatedAt: new Date().toISOString(),
    }

    return successResponse(users[userIndex], "User updated successfully")
  } catch (error) {
    return serverErrorResponse()
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  try {
    const userIndex = users.findIndex((u) => u.id === params.id)

    if (userIndex === -1) {
      return notFoundResponse("User")
    }

    users.splice(userIndex, 1)

    return successResponse(null, "User deleted successfully")
  } catch (error) {
    return serverErrorResponse()
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleCors(request)
}
