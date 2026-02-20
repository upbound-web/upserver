import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { RequireAdmin } from '@/lib/route-guards'
import { useQuery } from '@tanstack/react-query'
import { getAiConfig } from '@/lib/admin-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Globe, Flag, Bot, Sparkles, Undo2 } from 'lucide-react'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

function AdminPage() {
  const { data: aiConfig } = useQuery({
    queryKey: ['aiConfig'],
    queryFn: getAiConfig,
  })

  return (
    <RequireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
        {/* Dashboard cards (shown on /admin and above nested routes) */}
        <div>
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-stone-600 dark:text-stone-400">
              Manage sites and users across the platform
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Link to="/admin/sites">
              <Card className="hover:bg-stone-50 dark:hover:bg-stone-900 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Globe className="h-6 w-6 text-stone-600 dark:text-stone-400" />
                    <CardTitle>Sites</CardTitle>
                  </div>
                  <CardDescription>
                    View, create, and edit customer sites
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    Manage site configurations, staging URLs, and GitHub repositories
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/users">
              <Card className="hover:bg-stone-50 dark:hover:bg-stone-900 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Users className="h-6 w-6 text-stone-600 dark:text-stone-400" />
                    <CardTitle>Users</CardTitle>
                  </div>
                  <CardDescription>
                    Manage user accounts and permissions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    Create users, assign roles, and manage access to sites
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/requests">
              <Card className="hover:bg-stone-50 dark:hover:bg-stone-900 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Flag className="h-6 w-6 text-stone-600 dark:text-stone-400" />
                    <CardTitle>Flagged Requests</CardTitle>
                  </div>
                  <CardDescription>
                    Quote bigger changes and manage approvals
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    Review flagged work, set one fixed price, and track completion
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* AI Configuration */}
          {aiConfig && (
            <Card className="mt-6">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Bot className="h-6 w-6 text-stone-600 dark:text-stone-400" />
                  <div>
                    <CardTitle className="text-lg">AI Configuration</CardTitle>
                    <CardDescription>Model, plugins, and skills loaded for customer chat</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 p-3">
                    <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">Model</p>
                    <p className="text-sm font-mono">{aiConfig.model}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Undo2 className="h-3 w-3 text-stone-500" />
                      <p className="text-xs font-medium text-stone-500 dark:text-stone-400">File Checkpointing</p>
                    </div>
                    <p className="text-sm">{aiConfig.fileCheckpointing ? 'Enabled' : 'Disabled'}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className="h-3 w-3 text-stone-500" />
                      <p className="text-xs font-medium text-stone-500 dark:text-stone-400">Skills</p>
                    </div>
                    {aiConfig.plugins.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {aiConfig.plugins.flatMap((p) =>
                          p.skills.map((skill) => (
                            <span
                              key={`${p.name}-${skill}`}
                              className="inline-flex items-center rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs font-medium text-stone-700 dark:text-stone-300"
                            >
                              {skill}
                            </span>
                          ))
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-stone-500">None</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Nested admin routes like /admin/sites and /admin/users render here */}
        <Outlet />
      </div>
    </RequireAdmin>
  )
}
