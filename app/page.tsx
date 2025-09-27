export default function Home() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-2xl mx-auto text-center space-y-6">
        <h1 className="text-4xl font-bold text-foreground">Next.js API Server</h1>
        <p className="text-xl text-muted-foreground">Your TypeScript API is ready to serve your React Native app</p>

        <div className="bg-card border rounded-lg p-6 text-left">
          <h2 className="text-lg font-semibold mb-4">Available Endpoints:</h2>
          <ul className="space-y-2 text-sm font-mono">
            <li>
              <span className="text-green-600">GET</span> /api/health
            </li>
            <li>
              <span className="text-green-600">GET</span> /api/users
            </li>
            <li>
              <span className="text-blue-600">POST</span> /api/users
            </li>
            <li>
              <span className="text-green-600">GET</span> /api/users/[id]
            </li>
            <li>
              <span className="text-yellow-600">PUT</span> /api/users/[id]
            </li>
            <li>
              <span className="text-red-600">DELETE</span> /api/users/[id]
            </li>
            <li>
              <span className="text-green-600">GET</span> /api/posts
            </li>
            <li>
              <span className="text-blue-600">POST</span> /api/posts
            </li>
          </ul>
        </div>

        <div className="bg-muted rounded-lg p-4 text-sm">
          <p className="font-medium mb-2">Ready to deploy to Vercel!</p>
          <p className="text-muted-foreground">
            Replace the mock data with your preferred database (Supabase, Neon, etc.)
          </p>
        </div>
      </div>
    </main>
  )
}
