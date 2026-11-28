'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { updateInteraction } from '@/app/actions/leads'
import { INTERACTION_TYPES, type InteractionType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Pencil } from 'lucide-react'

export interface EditableInteraction {
  id: string
  type: InteractionType
  notes: string | null
  occurredAt: string
  durationMinutes: number | null
  location: string | null
  amount: number | null
  followUpDate: string | null
}

export default function EditInteractionDialog({
  leadId,
  interaction,
}: {
  leadId: string
  interaction: EditableInteraction
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [type, setType] = useState<InteractionType>(interaction.type)
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await updateInteraction(interaction.id, leadId, new FormData(e.currentTarget))
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Edit interaction"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Interaction</DialogTitle>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-type">Type</Label>
              <select
                id="edit-type"
                name="type"
                value={type}
                onChange={e => setType(e.target.value as InteractionType)}
                className="w-full h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {INTERACTION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-occurred_at">Date</Label>
              <Input id="edit-occurred_at" name="occurred_at" type="date" defaultValue={interaction.occurredAt} required />
            </div>
          </div>

          {type === 'call' && (
            <div className="space-y-2">
              <Label htmlFor="edit-duration_minutes">Duration (minutes)</Label>
              <Input id="edit-duration_minutes" name="duration_minutes" type="number" min="0" placeholder="15" defaultValue={interaction.durationMinutes ?? ''} />
            </div>
          )}
          {(type === 'meeting' || type === 'site_visit') && (
            <div className="space-y-2">
              <Label htmlFor="edit-location">Location</Label>
              <Input id="edit-location" name="location" placeholder="Office, customer site, …" defaultValue={interaction.location ?? ''} />
            </div>
          )}
          {type === 'offer' && (
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount</Label>
              <Input id="edit-amount" name="amount" type="number" min="0" step="0.01" placeholder="50000" defaultValue={interaction.amount ?? ''} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes (optional)</Label>
            <Textarea id="edit-notes" name="notes" placeholder="What was discussed…" rows={3} defaultValue={interaction.notes ?? ''} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-follow_up_date">Next Follow-up Date (optional)</Label>
            <Input id="edit-follow_up_date" name="follow_up_date" type="date" defaultValue={interaction.followUpDate ?? ''} />
            <p className="text-xs text-gray-400">Set this to be reminded to touch base with this lead.</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#F15A24] hover:bg-[#d44d1b] text-white"
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
