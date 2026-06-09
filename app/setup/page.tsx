'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { INACTIVE_THRESHOLDS } from '@/types'
import type { BusinessType } from '@/types'

export default function SetupPage() {
  const [name, setName] = useState('')
  const [type, setType] = useState<BusinessType>('other')
  const [ownerName, setOwnerName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const rawSlug = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-').substring(0, 40)
    const slug = rawSlug + '-' + Math.random().toString(36).substring(2, 8)

    const { data: business, error } = await supabase
      .from('businesses')
      .insert({
        name,
        type,
        owner_name: ownerName,
        phone,
        user_id: user.id,
        inactive_threshold_days: INACTIVE_THRESHOLDS[type],
        slug,
      })
      .select('id')
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Add creator to business_users so all members share one table
    await supabase.from('business_users').insert({
      business_id: business.id,
      user_id: user.id,
      email: user.email ?? '',
    })

    if (true) {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-lg shadow-sm">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#F15A24] flex items-center justify-center">
              <span className="text-white font-bold text-2xl">R</span>
            </div>
          </div>
          <CardTitle className="font-heading text-3xl font-bold tracking-tight">Set up your business</CardTitle>
          <CardDescription>Tell us about your business to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Business Name</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. City Dental Clinic"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Business Type</Label>
              <Select value={type} onValueChange={(v) => { if (v !== null) setType(v as BusinessType) }}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinic">Clinic / Healthcare</SelectItem>
                  <SelectItem value="salon">Salon / Beauty</SelectItem>
                  <SelectItem value="gym">Gym / Fitness</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerName">Owner Name</Label>
              <Input
                id="ownerName"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                placeholder="Your full name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Business Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-[#F15A24] hover:bg-[#d44d1b] text-white"
              disabled={loading}
            >
              {loading ? 'Creating…' : 'Create Business'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
