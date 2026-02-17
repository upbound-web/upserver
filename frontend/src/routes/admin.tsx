import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { RequireAdmin } from '@/lib/route-guards'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Globe, Flag } from 'lucide-react'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

function AdminPage() {
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
        </div>

        {/* Nested admin routes like /admin/sites and /admin/users render here */}
        <Outlet />
      </div>
    </RequireAdmin>
  )
}
