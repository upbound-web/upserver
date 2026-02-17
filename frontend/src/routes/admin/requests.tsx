import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RequireAdmin } from '@/lib/route-guards'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAdminReviews,
  quoteAdminReview,
  updateAdminReviewStatus,
  type AdminReview,
} from '@/lib/admin-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/admin/requests')({
  component: AdminRequestsPage,
})

function formatMoney(cents: number | null) {
  if (cents === null) return 'Not quoted'
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(cents / 100)
}

function AdminRequestsPage() {
  const queryClient = useQueryClient()
  const [selectedStatus, setSelectedStatus] = useState<'all' | AdminReview['status']>('all')
  const [quoting, setQuoting] = useState<AdminReview | null>(null)
  const [priceAud, setPriceAud] = useState('')
  const [note, setNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['adminReviews'],
    queryFn: getAdminReviews,
  })

  const quoteMutation = useMutation({
    mutationFn: (payload: { id: string; priceAud: number; note?: string }) =>
      quoteAdminReview(payload.id, { priceAud: payload.priceAud, note: payload.note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminReviews'] })
      setQuoting(null)
      setPriceAud('')
      setNote('')
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminReview['status'] }) =>
      updateAdminReviewStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminReviews'] })
    },
  })

  const reviews = data?.reviews || []
  const filtered = useMemo(
    () =>
      selectedStatus === 'all'
        ? reviews
        : reviews.filter((review) => review.status === selectedStatus),
    [reviews, selectedStatus]
  )

  return (
    <RequireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
        <div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Admin
          </Link>
          <h1 className="text-3xl font-bold">Flagged Requests</h1>
          <p className="text-stone-600 dark:text-stone-400">
            Pick up bigger jobs, set a single quote, and track customer approval.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['all', 'open', 'quoted', 'approved', 'rejected', 'completed'] as const).map((status) => (
            <Button
              key={status}
              variant={selectedStatus === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedStatus(status)}
            >
              {status}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <p>Loading flagged requests...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-stone-600 dark:text-stone-400">
              No requests in this bucket.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((review) => (
              <Card key={review.id}>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {review.customer?.name || 'Unknown customer'} • {review.user?.email || 'Unknown email'}
                  </CardTitle>
                  <CardDescription>
                    Status: <strong>{review.status}</strong> • Scope: {review.scope} • Confidence: {review.confidencePct}%
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm whitespace-pre-wrap">{review.requestContent}</p>
                  <p className="text-xs text-stone-500">{review.reason}</p>
                  <p className="text-sm">Quote: {formatMoney(review.quotedPriceCents)}</p>
                  {review.quoteNote && (
                    <p className="text-sm text-stone-600 dark:text-stone-300">Note: {review.quoteNote}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => {
                      setQuoting(review)
                      setPriceAud(review.quotedPriceCents ? (review.quotedPriceCents / 100).toString() : '')
                      setNote(review.quoteNote || '')
                    }}>
                      Set Quote
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => statusMutation.mutate({ id: review.id, status: 'completed' })}
                    >
                      Mark Completed
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => statusMutation.mutate({ id: review.id, status: 'rejected' })}
                    >
                      Mark Rejected
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!quoting} onOpenChange={(open) => !open && setQuoting(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set Single Quote</DialogTitle>
              <DialogDescription>
                This sends one fixed price to the customer for approval.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="quote-price">Price (AUD)</Label>
                <Input
                  id="quote-price"
                  type="number"
                  min="1"
                  step="1"
                  value={priceAud}
                  onChange={(e) => setPriceAud(e.target.value)}
                  placeholder="e.g. 350"
                />
              </div>
              <div>
                <Label htmlFor="quote-note">Note (optional)</Label>
                <Input
                  id="quote-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What’s included in this work"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setQuoting(null)}>
                Cancel
              </Button>
              <Button
                disabled={!quoting || !priceAud || quoteMutation.isPending}
                onClick={() => {
                  if (!quoting) return
                  quoteMutation.mutate({
                    id: quoting.id,
                    priceAud: Number(priceAud),
                    note,
                  })
                }}
              >
                {quoteMutation.isPending ? 'Saving...' : 'Send Quote'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequireAdmin>
  )
}
