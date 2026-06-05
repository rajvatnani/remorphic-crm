'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveAppointmentConfig } from '@/app/actions/appointments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DAY_NAMES } from '@/types'
import { CheckCircle } from 'lucide-react'

const DEFAULT_CONFIG = {
  slot_duration: 30,
  max_per_slot: 1,
  start_time: '09:00',
  end_time: '17:00',
  open_days: [1, 2, 3, 4, 5],
}

export default function SettingsPage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [slotDuration, setSlotDuration] = useState('30')
  const [maxPerSlot, setMaxPerSlot] = useState('1')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [openDays, setOpenDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: biz } = await supabase.from('businesses').select('id').single()
      if (!biz) return
      const { data } = await supabase
        .from('appointment_config')
        .select('*')
        .eq('business_id', biz.id)
        .single()
      if (data) {
        setSlotDuration(String(data.slot_duration))
        setMaxPerSlot(String(data.max_per_slot))
        setStartTime(data.start_time.slice(0, 5))
        setEndTime(data.end_time.slice(0, 5))
        setOpenDays(data.open_days)
      }
    }
    load()
  }, [])

  function toggleDay(day: number) {
    setOpenDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setSaved(false)

    const fd = new FormData()
    fd.set('slot_duration', slotDuration)
    fd.set('max_per_slot', maxPerSlot)
    fd.set('start_time', startTime)
    fd.set('end_time', endTime)
    openDays.forEach(d => fd.append('open_days', String(d)))

    try {
      await saveAppointmentConfig(fd)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure your appointment slots</p>
      </div>

      <Card className="shadow-none border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Appointment Slot Configuration</CardTitle>
          <CardDescription>
            Define how your calendar is divided into bookable slots.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Slot Duration</Label>
                <Select
                  value={slotDuration}
                  onValueChange={(v) => { if (v !== null) setSlotDuration(v) }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
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
                <Input
                  id="start_time"
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">Closing Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  required
                />
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

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                className="text-white"
                style={{ backgroundColor: '#F15A24' }}
                disabled={pending}
              >
                {pending ? 'Saving…' : 'Save Settings'}
              </Button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <CheckCircle className="h-4 w-4" />
                  Saved!
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
