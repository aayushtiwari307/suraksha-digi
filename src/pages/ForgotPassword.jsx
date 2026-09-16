import { useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../api/axios';

function ForgotPassword() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);

    try {
      const res = await API.post('/auth/forgot-password', { phone });
      setMessage(res.data.message || 'If that number is registered, a password reset email has been sent.');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to process the request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>🛡️ <span>Suraksha<span style={{ color: '#f5a623' }}>Digi</span></span></div>
        <h1 style={s.title}>Forgot your password?</h1>
        <p style={s.sub}>Enter the phone number linked to your family account.</p>
        <div style={s.divider}></div>

        {error && <div style={s.error}>{error}</div>}
        {message && <div style={s.success}>{message}</div>}

        <form onSubmit={handleSubmit} autoComplete="off">
          <div style={s.field}>
            <label style={s.label}>Phone Number</label>
            <input
              style={s.input}
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="9876543210"
              inputMode="numeric"
              autoComplete="off"
              required
            />
          </div>
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

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

export default ForgotPassword;
