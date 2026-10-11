import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useFamilyElders } from '../hooks/useFamilyElders';
import ElderSelector from '../components/ElderSelector';

const SAMPLE_SMS = 'Dear Customer, Rs. 15,000 debited from your account to ABC STORE at 11:42 PM. KYC verification required.';

const riskStyle = {
  high: { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
  medium: { bg: '#fffbeb', color: '#d97706', border: '#fcd34d' },
  low: { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
};

function SimulateSms() {
  const navigate = useNavigate();
  const { elders, loading: eldersLoading, error: eldersError } = useFamilyElders();
  const [elderId, setElderId] = useState('');
  const [rawMessage, setRawMessage] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedElderId = elderId || elders[0]?._id || '';

  const fetchHistory = async (id = selectedElderId) => {
    if (!id) return;
    setHistoryLoading(true);
    try {
      const res = await API.get(`/transactions/elder/${id}?limit=10`);
      setHistory(res.data.transactions || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load transaction history');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (selectedElderId) fetchHistory(selectedElderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElderId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedElderId || !rawMessage.trim()) {
      setError('Select an elder and enter the SMS message.');
      return;
    }

    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await API.post('/transactions/ingest-sms', {
        elderId: selectedElderId,
        rawMessage: rawMessage.trim(),
      });
      setResult(res.data);
      setRawMessage('');
      fetchHistory(selectedElderId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process SMS');
    } finally {
      setLoading(false);
    }
  };

  const analysis = result?.transaction;
  const risk = analysis?.riskLevel;
  const style = riskStyle[risk] || riskStyle.low;

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <div style={s.brand}>🛡️ Suraksha<span style={{ color: '#d97706' }}>Digi</span></div>
        <button onClick={() => navigate('/dashboard')} style={s.backBtn}>← Back to dashboard</button>
      </nav>

      <div style={s.body}>
        <div style={s.header}>
          <p style={s.kicker}>Fraud monitoring</p>
          <h1 style={s.title}>Simulate incoming SMS</h1>
          <p style={s.sub}>Paste a sample bank SMS to run the real transaction and fraud-analysis workflow.</p>
        </div>

        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={s.card}>
          <label style={s.label}>Elder</label>
          <ElderSelector
            elders={elders}
            loading={eldersLoading}
            error={eldersError}
            value={selectedElderId}
            onChange={setElderId}
            onAddElderClick={() => navigate('/add-elder')}
          />

          <label style={{ ...s.label, marginTop: '18px' }}>Bank SMS</label>
          <textarea
            value={rawMessage}
            onChange={(e) => setRawMessage(e.target.value)}
            placeholder="Paste the transaction SMS here..."
            rows={6}
            maxLength={2000}
            style={s.textarea}
          />

          <div style={s.sampleRow}>
            <button type="button" onClick={() => setRawMessage(SAMPLE_SMS)} style={s.sampleBtn}>
              Use sample SMS
            </button>
            <span style={s.hint}>Demo input only — the SMS is processed by the real fraud pipeline.</span>
          </div>

          <button type="submit" disabled={loading} style={{ ...s.submit, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Analyzing SMS...' : 'Analyze transaction →'}
          </button>
        </form>

        {result && (
          <div style={s.card}>
            <div style={s.resultHeader}>
              <div>
                <p style={s.kicker}>Analysis result</p>
                <h2 style={s.resultTitle}>{result.duplicate ? 'Already processed' : 'Transaction processed'}</h2>
              </div>
              <span style={{ ...s.riskPill, background: style.bg, color: style.color, borderColor: style.border }}>
                {(risk || 'unknown').toUpperCase()} · {analysis?.riskScore ?? '—'}/100
              </span>
            </div>

            <div style={s.grid}>
              <div><p style={s.metaLabel}>Amount</p><p style={s.metaValue}>₹{Number(analysis?.amount || 0).toLocaleString('en-IN')}</p></div>
              <div><p style={s.metaLabel}>Recipient</p><p style={s.metaValue}>{analysis?.recipient}</p></div>
              <div><p style={s.metaLabel}>Type</p><p style={s.metaValue}>{analysis?.transactionType}</p></div>
              <div><p style={s.metaLabel}>New recipient</p><p style={s.metaValue}>{analysis?.signals?.newRecipient ? 'Yes' : 'No'}</p></div>
              <div><p style={s.metaLabel}>Unusual amount</p><p style={s.metaValue}>{analysis?.signals?.unusualAmount ? 'Yes' : 'No'}</p></div>
              <div><p style={s.metaLabel}>Unusual time</p><p style={s.metaValue}>{analysis?.signals?.unusualTime ? 'Yes' : 'No'}</p></div>
              <div><p style={s.metaLabel}>Velocity</p><p style={s.metaValue}>{analysis?.signals?.highVelocity ? 'Yes' : 'No'}</p></div>
              <div><p style={s.metaLabel}>Scam wording</p><p style={s.metaValue}>{analysis?.signals?.scamKeyword ? analysis.signals.matchedKeywords.join(', ') : 'No'}</p></div>
            </div>

            <div style={s.explanationBox}>
              <p style={s.metaLabel}>AI explanation</p>
              <p style={s.explanation}>{analysis?.aiReason || 'No explanation available.'}</p>
            </div>

            {result.alert && (
              <div style={s.alertBox}>
                <strong>🚨 Fraud alert created</strong>
                <p>{result.alert.message}</p>
                {result.alert.messageHindi && <p>{result.alert.messageHindi}</p>}
              </div>
            )}
          </div>
        )}

        <div style={s.card}>
          <div style={s.resultHeader}>
            <div>
              <p style={s.kicker}>History</p>
              <h2 style={s.resultTitle}>Recent transactions</h2>
            </div>
            <button type="button" onClick={() => fetchHistory()} style={s.sampleBtn} disabled={historyLoading}>
              {historyLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {history.length === 0 ? (
            <p style={s.hint}>No transactions have been processed for this elder yet.</p>
          ) : (
            history.map(tx => (
              <div key={tx._id} style={s.historyRow}>
                <div>
                  <p style={s.metaValue}>₹{Number(tx.amount).toLocaleString('en-IN')} → {tx.recipient}</p>
                  <p style={s.historyTime}>{new Date(tx.transactionTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <span style={{ ...s.riskMini, color: riskStyle[tx.riskLevel]?.color || '#64748b' }}>{tx.riskLevel}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  nav: { background: '#fff', borderBottom: '0.5px solid #e2e8f0', padding: '0 32px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: '16px', fontWeight: 700, color: '#0f172a' },
  backBtn: { padding: '7px 14px', background: 'transparent', border: '0.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' },
  body: { maxWidth: '800px', margin: '0 auto', padding: '36px 24px' },
  header: { marginBottom: '22px' },
  kicker: { fontSize: '11px', color: '#d97706', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' },
  title: { fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' },
  resultTitle: { fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 },
  sub: { fontSize: '14px', color: '#64748b', margin: 0 },
  card: { background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '14px', padding: '22px', marginBottom: '16px' },
  label: { display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' },
  textarea: { width: '100%', minHeight: '140px', resize: 'vertical', padding: '12px 14px', borderRadius: '9px', border: '0.5px solid #e2e8f0', background: '#f8fafc', fontSize: '14px', lineHeight: 1.6, color: '#0f172a', outline: 'none', boxSizing: 'border-box' },
  sampleRow: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' },
  sampleBtn: { padding: '7px 12px', background: '#fff', border: '0.5px solid #cbd5e1', borderRadius: '7px', fontSize: '12px', color: '#334155', cursor: 'pointer' },
  hint: { fontSize: '12px', color: '#94a3b8', margin: 0 },
  submit: { marginTop: '18px', width: '100%', height: '44px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
  error: { background: '#fef2f2', border: '0.5px solid #fca5a5', color: '#dc2626', padding: '12px 14px', borderRadius: '9px', fontSize: '13px', marginBottom: '16px' },
  resultHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '18px' },
  riskPill: { padding: '7px 10px', border: '0.5px solid', borderRadius: '999px', fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' },
  metaLabel: { fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' },
  metaValue: { fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0 },
  explanationBox: { background: '#f8fafc', borderRadius: '9px', padding: '14px', marginTop: '4px' },
  explanation: { fontSize: '13px', lineHeight: 1.6, color: '#334155', margin: 0 },
  alertBox: { background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: '9px', padding: '14px', marginTop: '14px', color: '#991b1b' },
  historyRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px 0', borderTop: '0.5px solid #eef2f7' },
  historyTime: { fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' },
  riskMini: { fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' },
};

export default SimulateSms;
