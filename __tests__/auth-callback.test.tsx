import { render, screen, waitFor } from '@testing-library/react'
import AuthCallback from '@/app/auth/callback/page'

const mockPush = jest.fn()
const mockGetSession = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}))

describe('AuthCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders signing in message', () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    render(<AuthCallback />)
    expect(screen.getByText('Signing you in...')).toBeInTheDocument()
  })

  it('redirects to /dashboard when session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: '123' } } } })
    render(<AuthCallback />)
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('redirects to /login when no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    render(<AuthCallback />)
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    })
  })
})
