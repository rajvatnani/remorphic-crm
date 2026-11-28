'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MODULES, enabledModules, type ModuleKey } from '@/lib/modules'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

/** Switches each part of the app on or off for this business. Saves on each change. */
export default function FeaturesCard() {
  const router = useRouter()
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [on, setOn] = useState<Record<ModuleKey, boolean> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    createClient().from('businesses').select('*').single().then(({ data }) => {
      if (!data) return
      setBusinessId(data.id)
      setOn(enabledModules(data))
    })
  }, [])

  function toggle(key: ModuleKey, column: string, value: boolean) {
    if (!businessId || !on) return
    const before = on
    setOn({ ...on, [key]: value })
    setError(null)
    startTransition(async () => {
      const { error } = await createClient().from('businesses').update({ [column]: value }).eq('id', businessId)
      if (error) {
        setOn(before)
        setError(error.message.includes('column')
          ? 'Features cannot be saved until the database update for orders has been run.'
          : error.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <Card className="shadow-none border border-gray-200">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Features</CardTitle>
        <CardDescription>Turn on the parts your business uses. Everything is linked through your customers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!on && <p className="text-sm text-gray-400">Loading…</p>}
        {on && MODULES.map(m => (
          <label key={m.key} className="flex items-start justify-between gap-4 cursor-pointer">
            <span>
              <span className="block text-sm font-medium text-gray-900">{m.label}</span>
              <span className="block text-xs text-gray-500">{m.description}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={on[m.key]}
              disabled={pending}
              onChange={e => toggle(m.key, m.column, e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#F15A24]"
            />
          </label>
        ))}
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
      </CardContent>
    </Card>
  )
}
