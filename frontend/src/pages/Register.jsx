import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

function Register() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await API.post('/family/register', { name, phone, email, password });
      login(res.data.token, res.data.family);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* LEFT */}
        <div style={s.left}>
          <div style={s.logo}>
            <div style={s.logoIcon}>🛡️</div>
            <span style={s.logoText}>Suraksha<span style={{ color: '#f5a623' }}>Digi</span></span>
          </div>
          <div style={s.mid}>
            <h2 style={s.headline}>Join thousands<br />of <span style={{ color: '#f5a623' }}>caring families.</span></h2>
            <p style={s.desc}>Set up your elder care dashboard in under 2 minutes. Monitor, get alerted, and stay connected — all in one place.</p>
            <div style={s.features}>
              <div style={s.feat}><div style={s.featIcon}>⚡</div><span style={s.featText}>Set up in under 2 minutes</span></div>
              <div style={s.feat}><div style={s.featIcon}>📊</div><span style={s.featText}>Real-time health dashboards</span></div>
              <div style={s.feat}><div style={s.featIcon}>🤝</div><span style={s.featText}>Connect multiple family members</span></div>
            </div>
          </div>
          <div style={s.stats}>
            <div><div style={s.statNum}>3</div><div style={s.statLbl}>AI Endpoints</div></div>
            <div><div style={s.statNum}>24/7</div><div style={s.statLbl}>Monitoring</div></div>
            <div><div style={s.statNum}>100%</div><div style={s.statLbl}>Secure</div></div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={s.right}>
          <div style={s.badge}><span style={s.dot}></span> Free to get started</div>
          <h1 style={s.welcome}>Create your account</h1>
          <p style={s.sub}>Start protecting your family today</p>
          <div style={s.divider}></div>
          {error && <div style={s.error}>{error}</div>}
          <form onSubmit={handleSubmit} autoComplete="off">
            <div style={s.field}>
              <label style={s.label}>Full Name</label>
              <input style={s.input} type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Aayush Tiwari" autoComplete="off" required />
            </div>
            <div style={s.field}>
              <label style={s.label}>Phone Number</label>
              <input style={s.input} type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" autoComplete="off" required />
            </div>
            <div style={s.field}>
              <label style={s.label}>Email Address</label>
              <input
                style={s.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Password</label>
              <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a strong password" autoComplete="new-password" required />
            </div>
            <button style={s.btn} type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
          <p style={s.footerLink}>Already have an account? <Link to="/" style={{ color: '#1e88e5', fontWeight: 500 }}>Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4f8', padding: '20px' },
  card: { display: 'flex', width: '100%', maxWidth: '860px', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' },
  left: { flex: 1, background: '#0a1628', padding: '44px 40px', display: 'flex', flexDirection: 'column' },
  logo: { display: 'flex', alignItems: 'center', gap: '10px' },
  logoIcon: { fontSize: '22px' },
  logoText: { fontSize: '18px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' },
  mid: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '32px 0' },
  headline: { fontSize: '26px', fontWeight: 700, color: '#fff', lineHeight: 1.4, letterSpacing: '-0.5px' },
  desc: { fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '12px', lineHeight: 1.7 },
  features: { marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '12px' },
  feat: { display: 'flex', alignItems: 'center', gap: '10px' },
  featIcon: { width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 },
  featText: { fontSize: '13px', color: 'rgba(255,255,255,0.65)' },
  stats: { borderTop: '0.5px solid rgba(255,255,255,0.08)', paddingTop: '20px', display: 'flex', gap: '24px' },
  statNum: { fontSize: '18px', fontWeight: 700, color: '#fff' },
  statLbl: { fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.6px' },
  right: { flex: 1, background: '#fff', padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(30,136,229,0.1)', color: '#1e88e5', fontSize: '11px', fontWeight: 500, padding: '4px 12px', borderRadius: '100px', marginBottom: '20px', width: 'fit-content' },
  dot: { width: '6px', height: '6px', background: '#4caf50', borderRadius: '50%', display: 'inline-block' },
  welcome: { fontSize: '24px', fontWeight: 700, color: '#0a1628', letterSpacing: '-0.4px' },
  sub: { fontSize: '13px', color: '#888', marginTop: '5px' },
  divider: { height: '1px', background: '#f0f0f0', margin: '22px 0' },
  error: { background: '#fff0f0', color: '#e53935', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  field: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '11px', fontWeight: 600, color: '#888', marginBottom: '6px', letterSpacing: '0.4px', textTransform: 'uppercase' },
  input: { width: '100%', height: '42px', padding: '0 14px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fafafa', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#0a1628' },
  btn: { width: '100%', height: '42px', background: '#0a1628', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginTop: '6px', letterSpacing: '0.2px' },
  footerLink: { textAlign: 'center', fontSize: '13px', color: '#888', marginTop: '18px' }
};

export default Register;