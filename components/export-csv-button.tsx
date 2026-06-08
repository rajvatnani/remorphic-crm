'use client'

import { Download } from 'lucide-react'

function localDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function escapeCsvField(value: string | number) {
  const str = String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export default function ExportCsvButton({
  filenamePrefix,
  headers,
  rows,
}: {
  filenamePrefix: string
  headers: string[]
  rows: (string | number)[][]
}) {
  function handleExport() {
    const lines = [headers, ...rows].map(row => row.map(escapeCsvField).join(','))
    const csv = lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filenamePrefix}-${localDateStr(new Date())}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      title="Export CSV"
      className="inline-flex items-center gap-2 h-9 px-2.5 sm:px-3.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Export CSV</span>
    </button>
  )
}
