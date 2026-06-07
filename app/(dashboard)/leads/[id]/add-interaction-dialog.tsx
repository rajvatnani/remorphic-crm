'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { addInteraction } from '@/app/actions/leads'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

function localDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function AddInteractionDialog({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [type, setType] = useState<InteractionType>('call')
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await addInteraction(leadId, new FormData(e.currentTarget))
      setOpen(false)
      formRef.current?.reset()
      setType('call')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="bg-[#F15A24] hover:bg-[#d44d1b] text-white gap-2" />}>
        <Plus className="h-4 w-4" />
        Add Interaction
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Interaction</DialogTitle>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
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
              <Label htmlFor="occurred_at">Date</Label>
              <Input id="occurred_at" name="occurred_at" type="date" defaultValue={localDateStr(new Date())} required />
            </div>
          </div>

          {type === 'call' && (
            <div className="space-y-2">
              <Label htmlFor="duration_minutes">Duration (minutes)</Label>
              <Input id="duration_minutes" name="duration_minutes" type="number" min="0" placeholder="15" />
            </div>
          )}
          {(type === 'meeting' || type === 'site_visit') && (
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" name="location" placeholder="Office, customer site, …" />
            </div>
          )}
          {type === 'offer' && (
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" name="amount" type="number" min="0" step="0.01" placeholder="50000" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" placeholder="What was discussed…" rows={3} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="follow_up_date">Next Follow-up Date (optional)</Label>
            <Input id="follow_up_date" name="follow_up_date" type="date" />
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
              {pending ? 'Adding…' : 'Add Interaction'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
