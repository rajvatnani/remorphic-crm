'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Business } from '@/types'
import { CUSTOMER_LABELS } from '@/types'
import { Copy, Check } from 'lucide-react'

interface InactiveCustomer {
  id: string
  name: string
  phone: string
  lastVisit: string | null
  daysInactive: number
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function CopyButton({ customer, businessName }: { customer: InactiveCustomer; businessName: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const msg = `Hi ${customer.name}, we noticed it's been a while since your last visit at ${businessName}. We'd love to see you again! Reply to book your next appointment.`
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-1.5 text-xs"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-600" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy WhatsApp
        </>
      )}
    </Button>
  )
}

function InactiveTable({
  customers,
  businessName,
  label,
  loading,
}: {
  customers: InactiveCustomer[]
  businessName: string
  label: string
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            <TableHead className="font-medium">Name</TableHead>
            <TableHead className="font-medium">Phone</TableHead>
            <TableHead className="font-medium">Last Visit</TableHead>
            <TableHead className="font-medium">Days Inactive</TableHead>
            <TableHead className="font-medium text-right">Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12 text-gray-400">
                No inactive {label.toLowerCase()}s in this period.
              </TableCell>
            </TableRow>
          )}
          {customers.map(customer => (
            <TableRow key={customer.id}>
              <TableCell className="font-medium text-gray-900">{customer.name}</TableCell>
              <TableCell className="text-gray-600">{customer.phone}</TableCell>
              <TableCell className="text-gray-600">{formatDate(customer.lastVisit)}</TableCell>
              <TableCell>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                  {customer.daysInactive} days
                </span>
              </TableCell>
              <TableCell className="text-right">
                <CopyButton customer={customer} businessName={businessName} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function CampaignsPage() {
  const [business, setBusiness] = useState<Business | null>(null)
  const [allInactive, setAllInactive] = useState<InactiveCustomer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: biz } = await supabase.from('businesses').select('*').single()
      if (!biz) return
      setBusiness(biz)

      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, phone, visits(visited_at)')
        .eq('business_id', biz.id)

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const inactive: InactiveCustomer[] = []

      for (const c of customers ?? []) {
        const visits = c.visits as { visited_at: string }[]
        const lastVisitStr = visits.length
          ? visits.reduce((latest, v) =>
              v.visited_at > latest ? v.visited_at : latest,
              visits[0].visited_at
            )
          : null

        const lastVisitDate = lastVisitStr ? new Date(lastVisitStr) : null
        const daysInactive = lastVisitDate
          ? Math.floor((today.getTime() - lastVisitDate.getTime()) / 86400000)
          : 9999

        if (daysInactive >= 30) {
          inactive.push({
            id: c.id,
            name: c.name,
            phone: c.phone,
            lastVisit: lastVisitStr,
            daysInactive,
          })
        }
      }

      inactive.sort((a, b) => b.daysInactive - a.daysInactive)
      setAllInactive(inactive)
      setLoading(false)
    }
    load()
  }, [])

  const label = business ? CUSTOMER_LABELS[business.type] : 'Customer'

  const tab30 = allInactive.filter(c => c.daysInactive >= 30)
  const tab60 = allInactive.filter(c => c.daysInactive >= 60)
  const tab90 = allInactive.filter(c => c.daysInactive >= 90)

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
        <p className="text-sm text-gray-500 mt-1">
          Re-engage inactive {label.toLowerCase()}s with a personal message
        </p>
      </div>

      <Tabs defaultValue="30">
        <TabsList className="mb-4">
          <TabsTrigger value="30">
            30+ days
            {!loading && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                {tab30.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="60">
            60+ days
            {!loading && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                {tab60.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="90">
            90+ days
            {!loading && (
              <span className="ml-1.5 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                {tab90.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="30">
          <InactiveTable
            customers={tab30}
            businessName={business?.name ?? ''}
            label={label}
            loading={loading}
          />
        </TabsContent>
        <TabsContent value="60">
          <InactiveTable
            customers={tab60}
            businessName={business?.name ?? ''}
            label={label}
            loading={loading}
          />
        </TabsContent>
        <TabsContent value="90">
          <InactiveTable
            customers={tab90}
            businessName={business?.name ?? ''}
            label={label}
            loading={loading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
