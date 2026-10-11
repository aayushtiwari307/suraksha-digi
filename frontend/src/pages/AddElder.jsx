import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';

function AddElder() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [language, setLanguage] = useState('hindi');
  const [password, setPassword] = useState('');
  const [relation, setRelation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      await API.post('/elders/register', { name, phone, age: Number(age), language, password, relation: relation.trim() || undefined });
      setSuccess('Elder registered successfully!');
      setName(''); setPhone(''); setAge(''); setPassword(''); setRelation('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to register elder');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>

      {/* NAV */}
      <nav style={s.nav}>
        <div style={s.navLeft}>
          <span style={s.navIcon}>🛡️</span>
          <span style={s.navBrand}>Suraksha<span style={{ color: '#d97706' }}>Digi</span></span>
        </div>
        <button onClick={() => navigate('/dashboard')} style={s.backBtn}>
          ← Back to dashboard
        </button>
      </nav>

      <div style={s.body}>

        {/* HEADER */}
        <div style={s.header}>
          <h1 style={s.title}>Add a new elder</h1>
          <p style={s.sub}>Register an elder under your care to start monitoring their digital safety.</p>
        </div>

        <div style={s.card}>

          {/* SUCCESS */}
          {success && (
            <div style={s.successBox}>
              <div style={s.successHeader}>
                <span style={s.successIcon}>✅</span>
                <span style={s.successTitle}>{success}</span>
              </div>
              <p style={s.successSub}>They'll now appear in your elder selector on the dashboard.</p>
            </div>
          )}

          {error && <div style={s.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit} autoComplete="off">

            <div style={s.field}>
              <label style={s.label}>Full name</label>
              <input
                style={s.input}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Suresh Sharma"
                autoComplete="off"
                required
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Phone number</label>
              <input
                style={s.input}
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                autoComplete="off"
                required
              />
            </div>

            <div style={s.row}>
              <div style={{ flex: 1, ...s.field }}>
                <label style={s.label}>Age</label>
                <input
                  style={s.input}
                  type="number"
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  placeholder="e.g. 68"
                  required
                />
              </div>
              <div style={{ flex: 1, ...s.field }}>
                <label style={s.label}>Preferred language</label>
                <select
                  style={s.input}
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                >
                  <option value="hindi">Hindi</option>
                  <option value="english">English</option>
                </select>
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Relation to elder</label>
              <input
                style={s.input}
                type="text"
                value={relation}
                onChange={e => setRelation(e.target.value)}
                placeholder="e.g. Son, Daughter, Spouse"
                autoComplete="off"
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Set a password</label>
              <p style={s.hint}>Elder will use this password to log in and confirm medication.</p>
              <input
                style={s.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a strong password"
                autoComplete="new-password"
                required
              />
            </div>

            <button style={s.btn} type="submit" disabled={loading}>
              {loading ? 'Registering...' : 'Register elder'}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  nav: { background: '#fff', borderBottom: '0.5px solid #e2e8f0', padding: '0 32px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 },
  navLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  navIcon: { fontSize: '18px' },
  navBrand: { fontSize: '16px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' },
  backBtn: { padding: '7px 14px', background: 'transparent', border: '0.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' },
  body: { maxWidth: '560px', margin: '0 auto', padding: '36px 24px' },
  header: { marginBottom: '24px' },
  title: { fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.4px', margin: '0 0 6px' },
  sub: { fontSize: '14px', color: '#64748b', margin: 0 },
  card: { background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '16px', padding: '28px' },
  successBox: { background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: '10px', padding: '16px', marginBottom: '24px' },
  successHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' },
  successIcon: { fontSize: '16px' },
  successTitle: { fontSize: '14px', fontWeight: 600, color: '#15803d' },
  successSub: { fontSize: '12px', color: '#16a34a', margin: '0 0 12px' },
  errorBox: { background: '#fef2f2', border: '0.5px solid #fca5a5', color: '#dc2626', padding: '12px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' },
  field: { marginBottom: '16px' },
  row: { display: 'flex', gap: '16px' },
  label: { display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  hint: { fontSize: '12px', color: '#94a3b8', margin: '0 0 6px' },
  input: { width: '100%', height: '40px', padding: '0 14px', borderRadius: '8px', border: '0.5px solid #e2e8f0', background: '#f8fafc', fontSize: '14px', color: '#0f172a', outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', height: '42px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginTop: '8px', letterSpacing: '-0.1px' },
};

export default AddElder;