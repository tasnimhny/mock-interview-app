'use client'

import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SignOutButton() {
  const router = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button className="signout-btn" onClick={handleSignOut}>
      SIGN OUT
    </button>
  )
}
