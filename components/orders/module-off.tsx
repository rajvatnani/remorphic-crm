import Link from 'next/link'

export default function ModuleOff({ title }: { title: string }) {
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="font-heading text-4xl font-extrabold text-gray-900 tracking-tight mb-4">{title}</h1>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <p className="font-medium text-amber-800">Orders and items are turned off for this business</p>
        <p className="text-sm text-amber-700 mt-1">
          Turn them on under <Link href="/settings" className="underline font-medium">Settings → Features</Link>.
        </p>
      </div>
    </div>
  )
}
