import { type NextRequest, NextResponse } from 'next/server'

// Public routes that never need auth
const PUBLIC_PREFIXES = ['/book/', '/login', '/accept-invite', '/setup']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) || pathname === '/'
  if (isPublic) return NextResponse.next()
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
