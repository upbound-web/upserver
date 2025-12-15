import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RequireAdmin } from '@/lib/route-guards'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSites,
  createSite,
  updateSite,
  deleteSite,
  getUsers,
  type Site,
  type CreateSiteData,
  type UpdateSiteData,
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
import { Plus, Edit, Trash2, ArrowLeft } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

export const Route = createFileRoute('/admin/sites')({
  component: SitesPage,
})

const siteSchema = z.object({
  userId: z.string().min(1, 'User is required'),
  name: z.string().min(1, 'Name is required'),
  siteFolder: z.string().min(1, 'Site folder is required'),
  stagingUrl: z.string().optional(),
  githubRepo: z.string().optional(),
  stagingPort: z.coerce.number().optional(),
})

type SiteFormData = z.infer<typeof siteSchema>

function SitesPage() {
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [deletingSite, setDeletingSite] = useState<Site | null>(null)

  const { data: sitesData, isLoading } = useQuery({
    queryKey: ['adminSites'],
    queryFn: getSites,
  })

  const { data: usersData } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: getUsers,
  })

  const createForm = useForm<SiteFormData>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      userId: '',
      name: '',
      siteFolder: '',
      stagingUrl: '',
      githubRepo: '',
      stagingPort: undefined,
    },
  })

  const updateForm = useForm<SiteFormData>({
    resolver: zodResolver(siteSchema),
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateSiteData) => createSite(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSites'] })
      setIsCreateOpen(false)
      createForm.reset()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSiteData }) =>
      updateSite(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSites'] })
      setEditingSite(null)
      updateForm.reset()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSites'] })
      setDeletingSite(null)
    },
  })

  const handleEdit = (site: Site) => {
    setEditingSite(site)
    updateForm.reset({
      userId: site.userId,
      name: site.name,
      siteFolder: site.siteFolder,
      stagingUrl: site.stagingUrl || '',
      githubRepo: site.githubRepo || '',
      stagingPort: site.stagingPort || undefined,
    })
  }

  const handleDelete = (site: Site) => {
    if (confirm(`Are you sure you want to delete site "${site.name}"?`)) {
      deleteMutation.mutate(site.id)
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
            <h1 className="text-3xl font-bold">Sites Management</h1>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Site
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">Loading sites...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sitesData?.sites.map((site) => (
              <Card key={site.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{site.name}</CardTitle>
                  <CardDescription>
                    {site.user.email} • {site.siteFolder}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm mb-4">
                    {site.stagingUrl && (
                      <div>
                        <span className="font-medium">Staging:</span>{' '}
                        <span className="text-stone-600 dark:text-stone-400">
                          {site.stagingUrl}
                        </span>
                      </div>
                    )}
                    {site.githubRepo && (
                      <div>
                        <span className="font-medium">GitHub:</span>{' '}
                        <span className="text-stone-600 dark:text-stone-400">
                          {site.githubRepo}
                        </span>
                      </div>
                    )}
                    {site.stagingPort && (
                      <div>
                        <span className="font-medium">Port:</span>{' '}
                        <span className="text-stone-600 dark:text-stone-400">
                          {site.stagingPort}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(site)}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(site)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
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
                <DialogTitle>Create New Site</DialogTitle>
                <DialogDescription>
                  Create a new customer site configuration
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="create-userId">User</Label>
                  <Select
                    value={createForm.watch('userId')}
                    onValueChange={(value) =>
                      createForm.setValue('userId', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {usersData?.users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="create-name">Name</Label>
                  <Input
                    id="create-name"
                    {...createForm.register('name')}
                    placeholder="Site name"
                  />
                </div>
                <div>
                  <Label htmlFor="create-siteFolder">Site Folder</Label>
                  <Input
                    id="create-siteFolder"
                    {...createForm.register('siteFolder')}
                    placeholder="site-folder-name"
                  />
                </div>
                <div>
                  <Label htmlFor="create-stagingUrl">Staging URL</Label>
                  <Input
                    id="create-stagingUrl"
                    {...createForm.register('stagingUrl')}
                    placeholder="staging.example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="create-githubRepo">GitHub Repo</Label>
                  <Input
                    id="create-githubRepo"
                    {...createForm.register('githubRepo')}
                    placeholder="user/repo"
                  />
                </div>
                <div>
                  <Label htmlFor="create-stagingPort">Staging Port</Label>
                  <Input
                    id="create-stagingPort"
                    type="number"
                    {...createForm.register('stagingPort', {
                      valueAsNumber: true,
                    })}
                    placeholder="3000"
                  />
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
        <Dialog open={!!editingSite} onOpenChange={(open) => !open && setEditingSite(null)}>
          <DialogContent>
            <form
              onSubmit={updateForm.handleSubmit((data) => {
                if (editingSite) {
                  updateMutation.mutate({ id: editingSite.id, data })
                }
              })}
            >
              <DialogHeader>
                <DialogTitle>Edit Site</DialogTitle>
                <DialogDescription>Update site configuration</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="edit-userId">User</Label>
                  <Select
                    value={updateForm.watch('userId')}
                    onValueChange={(value) =>
                      updateForm.setValue('userId', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {usersData?.users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    {...updateForm.register('name')}
                    placeholder="Site name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-siteFolder">Site Folder</Label>
                  <Input
                    id="edit-siteFolder"
                    {...updateForm.register('siteFolder')}
                    placeholder="site-folder-name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-stagingUrl">Staging URL</Label>
                  <Input
                    id="edit-stagingUrl"
                    {...updateForm.register('stagingUrl')}
                    placeholder="staging.example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-githubRepo">GitHub Repo</Label>
                  <Input
                    id="edit-githubRepo"
                    {...updateForm.register('githubRepo')}
                    placeholder="user/repo"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-stagingPort">Staging Port</Label>
                  <Input
                    id="edit-stagingPort"
                    type="number"
                    {...updateForm.register('stagingPort', {
                      valueAsNumber: true,
                    })}
                    placeholder="3000"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingSite(null)}
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
      </div>
    </RequireAdmin>
  )
}
