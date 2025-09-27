// Common API response types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Example data types - customize these for your app
export interface User {
  id: string
  email: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Post {
  id: string
  title: string
  content: string
  authorId: string
  createdAt: string
  updatedAt: string
}

// Request body types
export interface CreateUserRequest {
  email: string
  name: string
}

export interface CreatePostRequest {
  title: string
  content: string
  authorId: string
}
