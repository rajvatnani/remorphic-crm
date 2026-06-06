'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

function AcceptInviteForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<'verifying' | 'set-password' | 'error'>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function verify() {
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')

      if (tokenHash && type === 'invite') {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'invite',
        })
        if (error) {
          setError(error.message)
          setStep('error')
        } else {
          setStep('set-password')
        }
        return
      }

      // Fallback: check if already has a session (e.g. hash-based flow)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setStep('set-password')
      } else {
        setError('Invalid or expired invite link.')
        setStep('error')
      }
    }
    verify()
  }, [])

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F15A24' }}>
              <span className="text-white font-bold text-2xl">R</span>
            </div>
          </div>
          <CardTitle className="text-2xl font-semibold">You&apos;re invited!</CardTitle>
          <CardDescription>Set a password to access Remorphic CRM</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'verifying' && (
            <p className="text-center text-gray-500 text-sm py-4">Verifying your invite…</p>
          )}

          {step === 'error' && (
            <div className="text-center">
              <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-md">{error}</p>
              <p className="text-gray-500 text-sm mt-3">Ask your manager to send a new invite.</p>
            </div>
          )}

          {step === 'set-password' && (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full text-white"
                style={{ backgroundColor: '#F15A24' }}
                disabled={loading}
              >
                {loading ? 'Setting up…' : 'Set Password & Enter'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </div>
    }>
      <AcceptInviteForm />
    </Suspense>
  )
}
