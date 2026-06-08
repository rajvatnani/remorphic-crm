'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { saveAppointmentConfig } from '@/app/actions/appointments'
import { inviteStaff, removeUser } from '@/app/actions/staff'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { DAY_NAMES, CUSTOMER_LABELS, INACTIVE_THRESHOLDS } from '@/types'
import type { BusinessType } from '@/types'
import { CheckCircle, Trash2, UserPlus } from 'lucide-react'

export default function SettingsPage() {
  // Business profile
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>('other')
  const [inactiveThresholdDays, setInactiveThresholdDays] = useState('60')
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

  // Staff
  const [staffList, setStaffList] = useState<{ id: string; email: string; created_at: string }[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePending, setInvitePending] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSent, setInviteSent] = useState(false)

  const router = useRouter()

  async function loadStaff(businessId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('staff')
      .select('id, email, created_at')
      .eq('business_id', businessId)
      .order('created_at')
    setStaffList(data ?? [])
  }

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: biz } = await supabase.from('businesses').select('*').single()
      if (!biz) return
      setBusinessName(biz.name)
      setBusinessType(biz.type as BusinessType)
      setInactiveThresholdDays(String(biz.inactive_threshold_days))

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

      await loadStaff(biz.id)
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
    const threshold = parseInt(inactiveThresholdDays, 10)
    if (!Number.isFinite(threshold) || threshold < 1) {
      setProfileError('Inactivity threshold must be a positive number of days')
      return
    }
    setProfilePending(true)
    setProfileError(null)
    setProfileSaved(false)
    const supabase = createClient()
    const { error } = await supabase
      .from('businesses')
      .update({ name: businessName.trim(), type: businessType, inactive_threshold_days: threshold })
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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInvitePending(true)
    setInviteError(null)
    setInviteSent(false)
    try {
      await inviteStaff(inviteEmail.trim())
      setInviteSent(true)
      setInviteEmail('')
      setTimeout(() => setInviteSent(false), 4000)
      const supabase = createClient()
      const { data: biz } = await supabase.from('businesses').select('id').single()
      if (biz) await loadStaff(biz.id)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setInvitePending(false)
    }
  }

  async function handleRemoveStaff(staffId: string) {
    try {
      await removeUser(staffId)
      setStaffList(prev => prev.filter(s => s.id !== staffId))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove staff')
    }
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

            <div className="space-y-2">
              <Label htmlFor="inactive_threshold_days">Inactivity Threshold (days)</Label>
              <Input
                id="inactive_threshold_days"
                type="number"
                min={1}
                value={inactiveThresholdDays}
                onChange={e => setInactiveThresholdDays(e.target.value)}
                required
                className="max-w-32"
              />
              <p className="text-xs text-gray-400">
                A {currentLabel.toLowerCase()} is marked inactive after this many days without a visit.
                Suggested for {currentLabel.toLowerCase()}s: {INACTIVE_THRESHOLDS[businessType]} days.
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

      {/* Staff Members */}
      <Card className="shadow-none border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Staff Members</CardTitle>
          <CardDescription>
            Invite team members to access this business. They&apos;ll get a link to set their password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Invite form */}
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
              className="flex-1"
            />
            <Button type="submit" className="text-white gap-2" style={{ backgroundColor: '#F15A24' }} disabled={invitePending}>
              <UserPlus className="h-4 w-4" />
              {invitePending ? 'Sending…' : 'Invite'}
            </Button>
          </form>

          {inviteError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{inviteError}</p>
          )}
          {inviteSent && (
            <p className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <CheckCircle className="h-4 w-4" /> Invite sent! They&apos;ll receive an email with a link.
            </p>
          )}

          {/* Staff list */}
          {staffList.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden mt-2">
              {staffList.map((s, i) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.email}</p>
                    <p className="text-xs text-gray-400">
                      Added {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveStaff(s.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Remove staff member"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {staffList.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No staff members yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
