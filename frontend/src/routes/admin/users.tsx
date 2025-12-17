import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { RequireAdmin } from '@/lib/route-guards'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getUsers,
  createUser,
  updateUser,
  getSites,
  addUserToSite,
  type User,
  type CreateUserData,
  type UpdateUserData,
} from '@/lib/admin-api'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Edit, ArrowLeft, UserPlus, Eye } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

export const Route = createFileRoute('/admin/users')({
  component: UsersPage,
})

const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['user', 'admin']).default('user'),
})

type UserFormData = z.infer<typeof userSchema>

function UsersPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [addingToSite, setAddingToSite] = useState<{ user: User; siteId: string } | null>(null)

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: getUsers,
  })

  const { data: sitesData } = useQuery({
    queryKey: ['adminSites'],
    queryFn: getSites,
  })

  const createForm = useForm<UserFormData>({
    resolver: zodResolver(userSchema) as any,
    defaultValues: {
      name: '',
      email: '',
      role: 'user',
    },
  })

  const updateForm = useForm<UserFormData>({
    resolver: zodResolver(userSchema) as any,
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateUserData) => createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
      setIsCreateOpen(false)
      createForm.reset()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserData }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
      setEditingUser(null)
      updateForm.reset()
    },
  })

  const addToSiteMutation = useMutation({
    mutationFn: ({ siteId, userId }: { siteId: string; userId: string }) =>
      addUserToSite(siteId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
      queryClient.invalidateQueries({ queryKey: ['adminSites'] })
      setAddingToSite(null)
    },
  })

  const handleEdit = (user: User) => {
    setEditingUser(user)
    updateForm.reset({
      name: user.name,
      email: user.email,
      role: user.role,
    })
  }

  const handleAddToSite = (user: User) => {
    setAddingToSite({ user, siteId: '' })
  }

  const handleViewAsUser = (user: User) => {
    // Only allow viewing as non-admin users
    if (user.role !== 'admin') {
      navigate({ to: '/chat', search: { userId: user.id } })
    }
  }

  return (
    <RequireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Admin
            </Link>
            <h1 className="text-3xl font-bold">Users Management</h1>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">Loading users...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {usersData?.users.map((user) => (
              <Card key={user.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{user.name}</CardTitle>
                    {user.role === 'admin' && (
                      <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                        Admin
                      </span>
                    )}
                  </div>
                  <CardDescription>{user.email}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm mb-4">
                    <div>
                      <span className="font-medium">Verified:</span>{' '}
                      <span className="text-stone-600 dark:text-stone-400">
                        {user.emailVerified ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(user)}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddToSite(user)}
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      Add to Site
                    </Button>
                    {user.role !== 'admin' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewAsUser(user)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View as User
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent>
            <form
              onSubmit={createForm.handleSubmit((data) =>
                createMutation.mutate(data)
              )}
            >
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Create a new user account
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="create-name">Name</Label>
                  <Input
                    id="create-name"
                    {...createForm.register('name')}
                    placeholder="User name"
                  />
                </div>
                <div>
                  <Label htmlFor="create-email">Email</Label>
                  <Input
                    id="create-email"
                    type="email"
                    {...createForm.register('email')}
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="create-role">Role</Label>
                  <Select
                    value={createForm.watch('role')}
                    onValueChange={(value: 'user' | 'admin') =>
                      createForm.setValue('role', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent>
            <form
              onSubmit={updateForm.handleSubmit((data) => {
                if (editingUser) {
                  updateMutation.mutate({ id: editingUser.id, data })
                }
              })}
            >
              <DialogHeader>
                <DialogTitle>Edit User</DialogTitle>
                <DialogDescription>Update user information</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    {...updateForm.register('name')}
                    placeholder="User name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    {...updateForm.register('email')}
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-role">Role</Label>
                  <Select
                    value={updateForm.watch('role')}
                    onValueChange={(value: 'user' | 'admin') =>
                      updateForm.setValue('role', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingUser(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Add to Site Dialog */}
        <Dialog open={!!addingToSite} onOpenChange={(open) => !open && setAddingToSite(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add User to Site</DialogTitle>
              <DialogDescription>
                Add {addingToSite?.user.name} to a site
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="add-site">Site</Label>
                <Select
                  value={addingToSite?.siteId || ''}
                  onValueChange={(value) =>
                    setAddingToSite((prev) =>
                      prev ? { ...prev, siteId: value } : null
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sitesData?.sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name} ({site.siteFolder})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddingToSite(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (addingToSite?.user.id && addingToSite?.siteId) {
                    addToSiteMutation.mutate({
                      userId: addingToSite.user.id,
                      siteId: addingToSite.siteId,
                    })
                  }
                }}
                disabled={!addingToSite?.siteId || addToSiteMutation.isPending}
              >
                {addToSiteMutation.isPending ? 'Adding...' : 'Add to Site'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequireAdmin>
  )
}
