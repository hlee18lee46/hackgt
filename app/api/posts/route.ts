import type { NextRequest } from "next/server"
import { successResponse, errorResponse, serverErrorResponse } from "@/lib/api-response"
import { handleCors } from "@/lib/cors"
import type { Post, CreatePostRequest } from "@/types/api"

// Mock data - replace with your database
const posts: Post[] = [
  {
    id: "1",
    title: "Welcome to our API",
    content: "This is a sample post from our Next.js API",
    authorId: "1",
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
    const authorId = searchParams.get("authorId")

    let filteredPosts = posts
    if (authorId) {
      filteredPosts = posts.filter((post) => post.authorId === authorId)
    }

    const paginatedPosts = filteredPosts.slice(offset, offset + limit)

    return successResponse({
      posts: paginatedPosts,
      total: filteredPosts.length,
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
    const body: CreatePostRequest = await request.json()

    if (!body.title || !body.content || !body.authorId) {
      return errorResponse("Title, content, and authorId are required")
    }

    const newPost: Post = {
      id: Date.now().toString(),
      title: body.title,
      content: body.content,
      authorId: body.authorId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    posts.push(newPost)

    return successResponse(newPost, "Post created successfully")
  } catch (error) {
    return serverErrorResponse()
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleCors(request)
}
