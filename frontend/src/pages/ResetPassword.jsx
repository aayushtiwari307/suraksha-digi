import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../api/axios';

function ResetPassword() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (!token) {
      setError('This password reset link is missing its token.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await API.post('/auth/reset-password', { token, password });
      setMessage(res.data.message || 'Password reset successfully. You can now sign in.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to reset the password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>🛡️ <span>Suraksha<span style={{ color: '#f5a623' }}>Digi</span></span></div>
        <h1 style={s.title}>Set a new password</h1>
        <p style={s.sub}>Choose a new password for your family account.</p>
        <div style={s.divider}></div>

        {error && <div style={s.error}>{error}</div>}
        {message && <div style={s.success}>{message}</div>}

        {!message && (
          <form onSubmit={handleSubmit} autoComplete="off">
            <div style={s.field}>
              <label style={s.label}>New Password</label>
              <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required />
            </div>
            <div style={s.field}>
              <label style={s.label}>Confirm Password</label>
              <input style={s.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
            </div>
            <button style={s.btn} type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Reset password'}
            </button>
          </form>
        )}

        <p style={s.footer}>
          <Link to="/" style={{ color: '#1e88e5', fontWeight: 500 }}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4f8', padding: '20px' },
  card: { width: '100%', maxWidth: '430px', background: '#fff', borderRadius: '20px', padding: '44px 40px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' },
  logo: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', fontWeight: 700, color: '#0a1628', marginBottom: '34px' },
  title: { fontSize: '24px', fontWeight: 700, color: '#0a1628', margin: 0 },
  sub: { fontSize: '13px', color: '#888', marginTop: '7px', lineHeight: 1.6 },
  divider: { height: '1px', background: '#f0f0f0', margin: '22px 0' },
  field: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '11px', fontWeight: 600, color: '#888', marginBottom: '6px', letterSpacing: '0.4px', textTransform: 'uppercase' },
  input: { width: '100%', height: '42px', padding: '0 14px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fafafa', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#0a1628' },
  btn: { width: '100%', height: '42px', background: '#0a1628', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginTop: '6px' },
  error: { background: '#fff0f0', color: '#e53935', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  success: { background: '#f0fdf4', color: '#15803d', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.5, marginBottom: '14px' },
  footer: { textAlign: 'center', fontSize: '13px', color: '#888', marginTop: '18px' },
};

export default ResetPassword;
