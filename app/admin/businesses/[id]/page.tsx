import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { checkIsAdmin } from '@/app/actions/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { ChevronLeft } from 'lucide-react'

const TYPE_EMOJI: Record<string, string> = {
  clinic: '🏥', salon: '✂️', gym: '💪', other: '🏢',
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function AdminBusinessPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // A layout is not re-rendered on every navigation, so it cannot be the only check
  if (!(await checkIsAdmin())) redirect('/dashboard')

  const admin = createAdminClient()

  const { data: biz } = await admin
    .from('businesses')
    .select('*')
    .eq('id', id)
    .single()

  if (!biz) return notFound()

  const { data: { user } } = await admin.auth.admin.getUserById(biz.user_id)

  const [
    { data: customers },
    { count: visitCount },
    { data: appointments },
  ] = await Promise.all([
    admin.from('customers').select('id, name, phone, created_at').eq('business_id', id).order('created_at', { ascending: false }).limit(10),
    admin.from('visits').select('*', { count: 'exact', head: true }).eq('business_id', id),
    admin.from('appointments').select('id, appointment_date, slot_time, status, customers(name)').eq('business_id', id).order('appointment_date', { ascending: false }).limit(10),
  ])

  const { count: customerCount } = await admin
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', id)

  const stats = [
    { label: 'Customers', value: customerCount ?? 0 },
    { label: 'Visits', value: visitCount ?? 0 },
    { label: 'Appointments', value: (appointments ?? []).length },
  ]

  return (
    <div>
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" /> All Businesses
      </Link>

      {/* Business header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-4xl">{TYPE_EMOJI[biz.type] ?? '🏢'}</span>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">{biz.name}</h1>
            <p className="text-sm text-gray-400">{user?.email ?? '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><p className="text-gray-400 text-xs mb-0.5">Type</p><p className="font-medium text-gray-700 capitalize">{biz.type}</p></div>
          <div><p className="text-gray-400 text-xs mb-0.5">Phone</p><p className="font-medium text-gray-700">{biz.phone || '—'}</p></div>
          <div><p className="text-gray-400 text-xs mb-0.5">Address</p><p className="font-medium text-gray-700">{biz.address || '—'}</p></div>
          <div><p className="text-gray-400 text-xs mb-0.5">Registered</p><p className="font-medium text-gray-700">{fmt(biz.created_at)}</p></div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
            <p className="text-3xl font-extrabold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent customers */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">Recent Customers</h2>
          </div>
          {(customers ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No customers yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {(customers ?? []).map((c, i) => (
                  <tr key={c.id} className={i > 0 ? 'border-t border-gray-50' : ''}>
                    <td className="px-5 py-3 font-medium text-gray-800">{c.name}</td>
                    <td className="px-5 py-3 text-gray-400">{c.phone}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs text-right">{fmt(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent appointments */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">Recent Appointments</h2>
          </div>
          {(appointments ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No appointments yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {(appointments ?? []).map((a, i) => (
                  <tr key={a.id} className={i > 0 ? 'border-t border-gray-50' : ''}>
                    <td className="px-5 py-3 font-medium text-gray-800">
                      {(a.customers as any)?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-400">{fmt(a.appointment_date)} · {(a.slot_time as string).slice(0, 5)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        a.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                        a.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{a.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
