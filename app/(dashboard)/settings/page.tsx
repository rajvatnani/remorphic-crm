'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { saveAppointmentConfig } from '@/app/actions/appointments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { DAY_NAMES, CUSTOMER_LABELS } from '@/types'
import type { BusinessType } from '@/types'
import { CheckCircle } from 'lucide-react'

export default function SettingsPage() {
  // Business profile
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>('other')
  const [profilePending, setProfilePending] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Appointment config
  const [slotDuration, setSlotDuration] = useState('30')
  const [maxPerSlot, setMaxPerSlot] = useState('1')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [openDays, setOpenDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [apptPending, setApptPending] = useState(false)
  const [apptSaved, setApptSaved] = useState(false)
  const [apptError, setApptError] = useState<string | null>(null)

  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: biz } = await supabase.from('businesses').select('*').single()
      if (!biz) return
      setBusinessName(biz.name)
      setBusinessType(biz.type as BusinessType)

      const { data: cfg } = await supabase
        .from('appointment_config')
        .select('*')
        .eq('business_id', biz.id)
        .single()
      if (cfg) {
        setSlotDuration(String(cfg.slot_duration))
        setMaxPerSlot(String(cfg.max_per_slot))
        setStartTime(cfg.start_time.slice(0, 5))
        setEndTime(cfg.end_time.slice(0, 5))
        setOpenDays(cfg.open_days)
      }
    }
    load()
  }, [])

  function toggleDay(day: number) {
    setOpenDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    setProfilePending(true)
    setProfileError(null)
    setProfileSaved(false)
    const supabase = createClient()
    const { error } = await supabase
      .from('businesses')
      .update({ name: businessName.trim(), type: businessType })
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
    if (error) {
      setProfileError(error.message)
    } else {
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
      router.refresh()
    }
    setProfilePending(false)
  }

  async function handleApptSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setApptPending(true)
    setApptError(null)
    setApptSaved(false)
    const fd = new FormData()
    fd.set('slot_duration', slotDuration)
    fd.set('max_per_slot', maxPerSlot)
    fd.set('start_time', startTime)
    fd.set('end_time', endTime)
    openDays.forEach(d => fd.append('open_days', String(d)))
    try {
      await saveAppointmentConfig(fd)
      setApptSaved(true)
      setTimeout(() => setApptSaved(false), 3000)
    } catch (err) {
      setApptError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setApptPending(false)
    }
  }

  const currentLabel = CUSTOMER_LABELS[businessType]

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="mb-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your business profile and appointment configuration</p>
      </div>

      {/* Business Profile */}
      <Card className="shadow-none border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Business Profile</CardTitle>
          <CardDescription>
            The business type controls what your customers are called throughout the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="business_name">Business Name</Label>
              <Input
                id="business_name"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Business Type</Label>
              <Select
                value={businessType}
                onValueChange={(v) => { if (v !== null) setBusinessType(v as BusinessType) }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinic">Clinic — customers called "Patients"</SelectItem>
                  <SelectItem value="salon">Salon — customers called "Clients"</SelectItem>
                  <SelectItem value="gym">Gym — customers called "Members"</SelectItem>
                  <SelectItem value="other">Other — customers called "Customers"</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">
                Currently: your customers are called <span className="font-medium text-gray-600">"{currentLabel}s"</span> everywhere in the app
              </p>
            </div>

            {profileError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{profileError}</p>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" className="text-white" style={{ backgroundColor: '#F15A24' }} disabled={profilePending}>
                {profilePending ? 'Saving…' : 'Save Profile'}
              </Button>
              {profileSaved && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <CheckCircle className="h-4 w-4" /> Saved!
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Appointment Config */}
      <Card className="shadow-none border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Appointment Slots</CardTitle>
          <CardDescription>Define how your calendar is divided into bookable slots.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApptSave} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Slot Duration</Label>
                <Select value={slotDuration} onValueChange={(v) => { if (v !== null) setSlotDuration(v) }}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                    <SelectItem value="90">90 minutes</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_per_slot">Max Bookings Per Slot</Label>
                <Input
                  id="max_per_slot"
                  type="number"
                  min={1}
                  max={50}
                  value={maxPerSlot}
                  onChange={e => setMaxPerSlot(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-400">e.g. 2 for 2 pickleball courts</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_time">Opening Time</Label>
                <Input id="start_time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">Closing Time</Label>
                <Input id="end_time" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Open Days</Label>
              <div className="flex gap-2 flex-wrap">
                {DAY_NAMES.map((name, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className="w-12 h-10 rounded-lg text-sm font-medium border transition-colors"
                    style={
                      openDays.includes(i)
                        ? { backgroundColor: '#F15A24', color: '#fff', borderColor: '#F15A24' }
                        : { backgroundColor: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {apptError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{apptError}</p>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" className="text-white" style={{ backgroundColor: '#F15A24' }} disabled={apptPending}>
                {apptPending ? 'Saving…' : 'Save Slot Config'}
              </Button>
              {apptSaved && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <CheckCircle className="h-4 w-4" /> Saved!
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
