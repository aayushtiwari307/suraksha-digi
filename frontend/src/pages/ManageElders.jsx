import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';

function ManageElders() {
  const navigate = useNavigate();
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', age: '', language: 'hindi', relation: '' });
  const [pairing, setPairing] = useState(null);
  const [pairingLoading, setPairingLoading] = useState(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await API.get('/family/elders?includeInactive=true');
      setElders(res.data.elders || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load elders');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (elder) => {
    setEditingId(elder._id);
    setForm({ name: elder.name, age: String(elder.age), language: elder.language || 'hindi', relation: elder.relation || '' });
  };

  const saveEdit = async (elderId) => {
    setSavingId(elderId); setError('');
    try {
      const res = await API.patch(`/elders/${elderId}`, {
        name: form.name,
        age: Number(form.age),
        language: form.language,
        relation: form.relation,
      });
      setElders(prev => prev.map(e => e._id === elderId ? { ...e, ...res.data.elder } : e));
      setEditingId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update elder');
    } finally { setSavingId(null); }
  };


  const generatePairingCode = async (elder) => {
    setPairingLoading(elder._id); setError(''); setPairing(null);
    try {
      const res = await API.post(`/elders/${elder._id}/device-pair`);
      setPairing({ elderName: elder.name, code: res.data.pairingCode, expiresAt: res.data.expiresAt });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate pairing code');
    } finally { setPairingLoading(null); }
  };

  const toggleActive = async (elder) => {
    const action = elder.isActive ? 'deactivate' : 'reactivate';
    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${elder.name}?`)) return;
    setSavingId(elder._id); setError('');
    try {
      const res = await API.patch(`/elders/${elder._id}/status`, { isActive: !elder.isActive });
      setElders(prev => prev.map(e => e._id === elder._id ? { ...e, isActive: res.data.elder.isActive } : e));
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} elder`);
    } finally { setSavingId(null); }
  };

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <div style={s.brand}>🛡️ Suraksha<span style={{ color: '#d97706' }}>Digi</span></div>
        <button onClick={() => navigate('/dashboard')} style={s.back}>← Back to dashboard</button>
      </nav>
      <main style={s.body}>
        <div style={s.header}>
          <p style={s.kicker}>Family management</p>
          <h1 style={s.title}>Manage elders</h1>
          <p style={s.sub}>Update an elder's details or temporarily deactivate their account without deleting their history.</p>
        </div>
        {error && <div style={s.error}>{error}</div>}
        {pairing && (
          <div style={s.pairBox}>
            <div style={s.pairTitle}>Android pairing code for {pairing.elderName}</div>
            <div style={s.pairCode}>{pairing.code}</div>
            <p style={s.pairHint}>Enter this one-time code in the SurakshaDigi Android companion. It expires in 10 minutes.</p>
            <button style={s.secondary} onClick={() => setPairing(null)}>Close</button>
          </div>
        )}
        {loading ? <p style={s.muted}>Loading elders...</p> : elders.length === 0 ? <p style={s.muted}>No elders found.</p> : elders.map(elder => (
          <div key={elder._id} style={s.card}>
            {editingId === elder._id ? (
              <>
                <div style={s.grid}>
                  <label style={s.label}>Name<input style={s.input} value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label>
                  <label style={s.label}>Age<input style={s.input} type="number" value={form.age} onChange={e => setForm({...form, age: e.target.value})}/></label>
                  <label style={s.label}>Language<select style={s.input} value={form.language} onChange={e => setForm({...form, language: e.target.value})}><option value="hindi">Hindi</option><option value="english">English</option></select></label>
                  <label style={s.label}>Relation<input style={s.input} value={form.relation} onChange={e => setForm({...form, relation: e.target.value})}/></label>
                </div>
                <div style={s.actions}><button style={s.primary} onClick={() => saveEdit(elder._id)} disabled={savingId === elder._id}>{savingId === elder._id ? 'Saving...' : 'Save changes'}</button><button style={s.secondary} onClick={() => setEditingId(null)}>Cancel</button></div>
              </>
            ) : (
              <>
                <div style={s.top}><div><h2 style={s.name}>{elder.name}</h2><p style={s.details}>{elder.age} years · {elder.relation || 'family member'} · Safety score {elder.safetyScore}</p></div><span style={{...s.badge, ...(elder.isActive ? s.active : s.inactive)}}>{elder.isActive ? 'Active' : 'Inactive'}</span></div>
                <div style={s.actions}>
                  <button style={s.primary} onClick={() => startEdit(elder)}>Edit details</button>
                  {elder.isActive && (
                    <button style={s.secondary} onClick={() => generatePairingCode(elder)} disabled={pairingLoading === elder._id}>
                      {pairingLoading === elder._id ? 'Generating...' : 'Pair Android'}
                    </button>
                  )}
                  <button style={s.secondary} onClick={() => toggleActive(elder)} disabled={savingId === elder._id}>{elder.isActive ? 'Deactivate' : 'Reactivate'}</button>
                </div>
              </>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}

const s = {
  page:{minHeight:'100vh',background:'#f8fafc',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'},nav:{height:'56px',background:'#fff',borderBottom:'0.5px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 32px'},brand:{fontSize:'16px',fontWeight:700,color:'#0f172a'},back:{padding:'7px 14px',background:'transparent',border:'0.5px solid #e2e8f0',borderRadius:'8px',fontSize:'13px',color:'#64748b',cursor:'pointer'},body:{maxWidth:'760px',margin:'0 auto',padding:'36px 24px'},header:{marginBottom:'24px'},kicker:{fontSize:'11px',fontWeight:700,color:'#d97706',textTransform:'uppercase',letterSpacing:'0.5px',margin:'0 0 6px'},title:{fontSize:'24px',margin:'0 0 6px',color:'#0f172a'},sub:{fontSize:'14px',color:'#64748b',margin:0},error:{background:'#fef2f2',border:'0.5px solid #fca5a5',color:'#dc2626',padding:'12px 16px',borderRadius:'10px',fontSize:'13px',marginBottom:'16px'},muted:{color:'#94a3b8',fontSize:'13px'},card:{background:'#fff',border:'0.5px solid #e2e8f0',borderRadius:'14px',padding:'20px',marginBottom:'12px'},top:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px'},name:{fontSize:'16px',margin:'0 0 4px',color:'#0f172a'},details:{fontSize:'12px',color:'#64748b',margin:0},badge:{fontSize:'11px',fontWeight:700,padding:'4px 9px',borderRadius:'999px'},active:{background:'#f0fdf4',color:'#16a34a'},inactive:{background:'#f1f5f9',color:'#64748b'},grid:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'},label:{fontSize:'11px',fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.4px'},input:{display:'block',width:'100%',height:'40px',marginTop:'6px',padding:'0 12px',boxSizing:'border-box',borderRadius:'8px',border:'0.5px solid #e2e8f0',background:'#f8fafc',fontSize:'13px'},actions:{display:'flex',gap:'8px',marginTop:'16px'},primary:{padding:'7px 12px',background:'#0f172a',color:'#fff',border:0,borderRadius:'7px',fontSize:'12px',fontWeight:600,cursor:'pointer'},secondary:{padding:'7px 12px',background:'#fff',color:'#475569',border:'0.5px solid #cbd5e1',borderRadius:'7px',fontSize:'12px',fontWeight:600,cursor:'pointer'},pairBox:{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:'14px',padding:'18px',marginBottom:'16px',textAlign:'center'},pairTitle:{fontSize:'12px',fontWeight:700,color:'#9a3412',marginBottom:'8px'},pairCode:{fontSize:'28px',fontWeight:800,letterSpacing:'5px',color:'#0f172a',margin:'8px 0'},pairHint:{fontSize:'12px',color:'#7c2d12',margin:'0 0 12px'}
};

export default ManageElders;
