
import { useState } from 'react'
import { supabase } from './lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setError('Login gagal: ' + error.message)
      }
    } catch (err) {
      setError('Tidak dapat terhubung ke Supabase. Periksa koneksi internet.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1 className="login-brand">THENARA</h1>
        <p className="login-subtitle">BOUTIQUE ADMIN</p>

        <h2>Login Admin</h2>
        <p className="login-description">
          Masuk untuk mengelola produk dan operasional butik.
        </p>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email admin"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            className="button button-primary"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Memeriksa...' : 'Masuk ke Dashboard'}
          </button>
        </form>
      </section>
    </main>
  )
}
