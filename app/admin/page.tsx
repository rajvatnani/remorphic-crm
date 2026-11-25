import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { checkIsAdmin, enterBusinessAsAdmin } from '@/app/actions/admin'

const TYPE_EMOJI: Record<string, string> = {
  clinic: '🏥', salon: '✂️', gym: '💪', other: '🏢',
}

export default async function AdminHomePage() {
  // A layout is not re-rendered on every navigation, so it cannot be the only check
  if (!(await checkIsAdmin())) redirect('/dashboard')

  const admin = createAdminClient()

  const { data: businesses } = await admin
    .from('businesses')
    .select('id, name, type, phone, created_at, user_id, slug')
    .order('created_at', { ascending: false })

  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = Object.fromEntries(users.map(u => [u.id, u.email ?? '']))

  const businessIds = (businesses ?? []).map(b => b.id)

  const [{ data: customerCounts }, { data: appointmentCounts }] = await Promise.all([
    admin.from('customers').select('business_id').in('business_id', businessIds),
    admin.from('appointments').select('business_id').in('business_id', businessIds),
  ])

  const custMap: Record<string, number> = {}
  for (const row of customerCounts ?? []) custMap[row.business_id] = (custMap[row.business_id] ?? 0) + 1

  const apptMap: Record<string, number> = {}
  for (const row of appointmentCounts ?? []) apptMap[row.business_id] = (apptMap[row.business_id] ?? 0) + 1

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">All Businesses</h1>
        <p className="text-sm text-gray-500 mt-1">{(businesses ?? []).length} registered</p>
      </div>

      {(businesses ?? []).length === 0 && (
        <p className="text-gray-400 text-center py-20">No businesses yet.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(businesses ?? []).map(biz => {
          const enter = enterBusinessAsAdmin.bind(null, biz.id)
          return (
            <form key={biz.id} action={enter}>
              <button
                type="submit"
                className="w-full text-left bg-white rounded-2xl border border-gray-200 p-5 hover:border-[#F15A24] hover:shadow-md transition-all group"
              >
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-3xl">{TYPE_EMOJI[biz.type] ?? '🏢'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate group-hover:text-[#F15A24] transition-colors">
                      {biz.name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{emailMap[biz.user_id] ?? '—'}</p>
                  </div>
                </div>
                <div className="flex gap-4 text-sm text-gray-500 mb-4">
                  <span><span className="font-semibold text-gray-800">{custMap[biz.id] ?? 0}</span> customers</span>
                  <span><span className="font-semibold text-gray-800">{apptMap[biz.id] ?? 0}</span> appts</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {new Date(biz.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="text-xs font-medium text-[#F15A24] group-hover:underline">Open →</span>
                </div>
              </button>
            </form>
          )
        })}
      </div>
    </div>
  )
}
