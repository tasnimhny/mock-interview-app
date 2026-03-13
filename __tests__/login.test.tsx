import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '@/app/login/page'

const mockSignInWithOAuth = jest.fn()
const mockSignInWithPassword = jest.fn()
const mockSignUp = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: any[]) => mockSignInWithOAuth(...args),
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
      signUp: (...args: any[]) => mockSignUp(...args),
    },
  },
}))

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders all login elements', () => {
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument()
    expect(screen.getByText('Sign in with Discord')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

  it('calls signInWithOAuth with google provider', async () => {
    mockSignInWithOAuth.mockResolvedValue({})
    render(<LoginPage />)
    fireEvent.click(screen.getByText('Sign in with Google'))
    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: expect.stringContaining('/auth/callback') },
      })
    })
  })

  it('calls signInWithOAuth with discord provider', async () => {
    mockSignInWithOAuth.mockResolvedValue({})
    render(<LoginPage />)
    fireEvent.click(screen.getByText('Sign in with Discord'))
    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'discord',
        options: { redirectTo: expect.stringContaining('/auth/callback') },
      })
    })
  })

  it('calls signInWithPassword with email and password', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'test@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    })
  })

  it('shows error alert when email login fails', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid credentials' } })
    window.alert = jest.fn()
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Invalid credentials')
    })
  })

  it('calls signUp with email and password', async () => {
    mockSignUp.mockResolvedValue({ error: null })
    window.alert = jest.fn()
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByText('Sign Up'))
    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
      })
    })
  })
})
