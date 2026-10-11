import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useFamilyElders } from '../hooks/useFamilyElders';
import ElderSelector from '../components/ElderSelector';
import { formatTimeAMPM } from '../utils/formatTime';

const getGreeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const getDate = () => new Date().toLocaleDateString('en-IN', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata'
});

const ALERT_LABELS = {
  fraud: 'Fraud attempt',
  confusion: 'Confusion detected',
  inactivity: 'Inactivity',
  unusual_transaction: 'Unusual transaction',
  suspicious_link: 'Suspicious link',
  medication_missed: 'Medication missed'
};

const STATUS_STYLES = {
  pending:  { bg: '#fffbeb', color: '#d97706', border: '#fcd34d', label: 'Pending' },
  taken:    { bg: '#f0fdf4', color: '#16a34a', border: '#86efac', label: 'Taken' },
  missed:   { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5', label: 'Missed' },
};

function Dashboard() {
  const { family, elder, logout } = useAuth();
  const navigate = useNavigate();
  const currentName = family?.name || elder?.name;

  // Shared elder selection (family only) — one selected elder now drives
  // both the alerts and medications sections instead of two separate
  // pasted IDs. useFamilyElders re-fetches fresh on every mount (no
  // caching/localStorage), so nothing can leak across logout/login.
  const { elders, loading: eldersLoading, error: eldersError } = useFamilyElders();
  const [selectedElderId, setSelectedElderId] = useState('');

  // Pre-selection is computed directly during render (no effect needed) —
  // falls back to the first/only elder until the user picks one explicitly.
  const effectiveElderId = family
    ? (selectedElderId || elders[0]?._id || '')
    : elder?.id;

  // Alerts state
  const [alerts, setAlerts] = useState([]);
  const [alertError, setAlertError] = useState('');
  const [alertFetched, setAlertFetched] = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);

  // Medications state
  const [medications, setMedications] = useState([]);
  const [medError, setMedError] = useState('');
  const [medFetched, setMedFetched] = useState(false);
  const [medLoading, setMedLoading] = useState(false);
  const [markingId, setMarkingId] = useState(null);

  const handleLogout = () => { logout(); navigate('/'); };

  const fetchAlerts = async (idOverride, silent = false) => {
    const id = idOverride || effectiveElderId;
    if (!id) return;
    setAlertError('');
    if (!silent) { setAlertFetched(false); setAlertLoading(true); }
    try {
      const res = await API.get(`/alerts/elder/${id}`);
      setAlerts(res.data.alerts || []);
      setAlertFetched(true);
    } catch (err) {
      setAlertError(err.response?.data?.message || 'Failed to fetch alerts');
    } finally {
      if (!silent) setAlertLoading(false);
    }
  };

  const resolveAlert = async (alertId) => {
    try {
      await API.put(`/alerts/resolve/${alertId}`);
      setAlerts(prev => prev.map(a => a._id === alertId ? { ...a, isResolved: true } : a));
    } catch {
      setAlertError('Failed to resolve alert');
    }
  };

  const recordFraudOutcome = async (alertId, outcome) => {
    try {
      await API.put(`/alerts/feedback/${effectiveElderId}/${alertId}`, { outcome });
      setAlerts(prev => prev.map(a => a._id === alertId ? {
        ...a,
        isResolved: true,
        reviewOutcome: outcome,
        reviewedBy: family?.id,
        reviewedAt: new Date().toISOString(),
      } : a));
    } catch (err) {
      setAlertError(err.response?.data?.message || 'Failed to record alert outcome');
    }
  };

  const fetchMedications = async (idOverride, silent = false) => {
    const id = idOverride || effectiveElderId;
    if (!id) return;
    setMedError('');
    if (!silent) { setMedFetched(false); setMedLoading(true); }
    try {
      const res = await API.get(`/medications/elder/${id}`);
      setMedications(res.data.medications || []);
      setMedFetched(true);
    } catch (err) {
      setMedError(err.response?.data?.message || 'Failed to fetch medications');
    } finally {
      if (!silent) setMedLoading(false);
    }
  };

  // Auto-load both sections whenever the effective elder changes — covers
  // pre-selection on first load and switching elders in the selector.
  // Alerts are family-only (elder role has no alerts card). This is the
  // standard data-fetching-on-mount/dependency-change pattern; the setState
  // calls inside fetchAlerts/fetchMedications run before their `await`,
  // which the newer set-state-in-effect lint rule flags, but this is the
  // correct way to show a loading state for an in-flight fetch.
  useEffect(() => {
    if (!effectiveElderId) return;
    // Initial load.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: shows loading state for the fetch
    if (family) fetchAlerts(effectiveElderId);
    fetchMedications(effectiveElderId);

    // Keep the family dashboard reasonably fresh so a scheduler-created alert
    // becomes visible without requiring the user to click Refresh. This is
    // polling, not a claim of push notifications.
    if (!family) return;
    const interval = setInterval(() => {
      fetchAlerts(effectiveElderId, true);
      fetchMedications(effectiveElderId, true);
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveElderId, family]);

  const handleElderChange = (id) => setSelectedElderId(id);

  const markTaken = async (medicationId) => {
    setMarkingId(medicationId);
    try {
      await API.put(`/medications/mark-taken/${medicationId}`);
      setMedications(prev =>
        prev.map(m => m.medicationId === medicationId
          ? { ...m, status: 'taken', takenAt: new Date().toISOString() }
          : m
        )
      );
    } catch {
      setMedError('Failed to mark as taken');
    } finally {
      setMarkingId(null);
    }
  };

  const unresolved = alerts.filter(a => !a.isResolved).length;
  const resolved = alerts.filter(a => a.isResolved).length;
  const takenCount = medications.filter(m => m.status === 'taken').length;
  const missedCount = medications.filter(m => m.status === 'missed').length;

  return (
    <div style={s.page}>

      {/* NAV */}
      <nav style={s.nav}>
        <div style={s.navLeft}>
          <i style={s.navIcon}>🛡️</i>
          <span style={s.navBrand}>Suraksha<span style={{ color: '#d97706' }}>Digi</span></span>
        </div>
        <div style={s.navRight}>
          <div style={s.userPill}>
            <div style={s.avatar}>{currentName?.[0]?.toUpperCase()}</div>
            <span style={s.userName}>{currentName}</span>
          </div>
          {family && (
            <button onClick={() => navigate('/add-medication')} style={s.medBtn}>
              + Add medication
            </button>
          )}
          {family && (
            <button onClick={() => navigate('/simulate-sms')} style={s.fraudBtn}>
              Fraud check
            </button>
          )}
          {family && (
            <button onClick={() => navigate('/manage-elders')} style={s.manageBtn}>
              Manage elders
            </button>
          )}
          {family && (
            <button onClick={() => navigate('/add-elder')} style={s.addBtn}>
              + Add elder
            </button>
          )}
          <button onClick={handleLogout} style={s.logoutBtn}>Logout</button>
        </div>
      </nav>

      <div style={s.body}>

        {/* HERO */}
        <div style={s.hero}>
          <div>
            <p style={s.dateText}>{getDate()}</p>
            <h1 style={s.greeting}>{getGreeting()}, {currentName?.split(' ')[0]} 👋</h1>
            <p style={s.heroSub}>
              {family
                ? "Monitor your elders' digital safety and stay informed in real time."
                : "View your medication schedule and stay on top of your health."}
            </p>
          </div>
          <div style={s.activeBadge}>
            <span style={s.activeDot}></span>
            System active
          </div>
        </div>

        {/* ALERT STATS */}
        {alertFetched && (
          <div style={s.statsRow}>
            <div style={s.statCard}>
              <p style={s.statLabel}>Total alerts</p>
              <p style={s.statNum}>{alerts.length}</p>
            </div>
            <div style={{ ...s.statCard, background: unresolved > 0 ? '#fff7ed' : undefined }}>
              <p style={s.statLabel}>Active alerts</p>
              <p style={{ ...s.statNum, color: unresolved > 0 ? '#c2410c' : '#16a34a' }}>{unresolved}</p>
            </div>
            <div style={s.statCard}>
              <p style={s.statLabel}>Resolved</p>
              <p style={{ ...s.statNum, color: '#16a34a' }}>{resolved}</p>
            </div>
          </div>
        )}

        {/* ALERTS CARD — family only */}
        {family && (
          <div style={s.searchCard}>
            <div style={s.searchTop}>
              <div>
                <p style={s.searchTitle}>View elder alerts</p>
                <p style={s.searchSub}>Select an elder to see their safety alerts</p>
              </div>
            </div>
            <div style={s.searchRow}>
              <div style={{ flex: 1 }}>
                <ElderSelector
                  elders={elders}
                  loading={eldersLoading}
                  error={eldersError}
                  value={effectiveElderId}
                  onChange={handleElderChange}
                  onAddElderClick={() => navigate('/add-elder')}
                />
              </div>
              <button onClick={() => fetchAlerts()} style={s.fetchBtn} disabled={alertLoading || !effectiveElderId}>
                {alertLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        )}

        {alertError && <div style={s.errorBox}>{alertError}</div>}

        {alertFetched && alerts.length === 0 && (
          <div style={s.empty}>
            <p style={s.emptyIcon}>✅</p>
            <p style={s.emptyTitle}>No alerts found</p>
            <p style={s.emptySub}>This elder has no recorded safety alerts.</p>
          </div>
        )}

        {alerts.map(alert => (
          <div key={alert._id} style={{
            ...s.alertCard,
            borderLeftColor: alert.severity === 'high' ? '#dc2626' : alert.severity === 'medium' ? '#d97706' : '#16a34a'
          }}>
            <div style={s.alertTop}>
              <div style={s.alertLeft}>
                <span style={{
                  ...s.severityPill,
                  background: alert.severity === 'high' ? '#fef2f2' : alert.severity === 'medium' ? '#fffbeb' : '#f0fdf4',
                  color: alert.severity === 'high' ? '#dc2626' : alert.severity === 'medium' ? '#d97706' : '#16a34a',
                  border: `0.5px solid ${alert.severity === 'high' ? '#fca5a5' : alert.severity === 'medium' ? '#fcd34d' : '#86efac'}`
                }}>
                  {alert.severity} severity
                </span>
                <span style={s.alertTypeTag}>
                  {ALERT_LABELS[alert.type] || alert.type}
                </span>
              </div>
              {alert.type === 'fraud' && alert.reviewOutcome && alert.reviewOutcome !== 'unreviewed'
                ? <span style={{
                    ...s.outcomeTag,
                    color: alert.reviewOutcome === 'confirmed_fraud' ? '#dc2626' : '#16a34a'
                  }}>
                    {alert.reviewOutcome === 'confirmed_fraud' ? '🚨 Confirmed fraud' : '✅ False positive'}
                  </span>
                : alert.type === 'fraud' && !alert.isResolved
                  ? <div style={s.feedbackRow}>
                      <button onClick={() => recordFraudOutcome(alert._id, 'confirmed_fraud')} style={s.fraudFeedbackBtn}>Confirm fraud</button>
                      <button onClick={() => recordFraudOutcome(alert._id, 'false_positive')} style={s.falsePositiveBtn}>False positive</button>
                    </div>
                  : alert.isResolved
                    ? <span style={s.resolvedTag}>✅ Resolved</span>
                    : <button onClick={() => resolveAlert(alert._id)} style={s.resolveBtn}>Mark resolved</button>
              }
            </div>
            <p style={s.alertMsg}>{alert.message}</p>
            {alert.source?.type === 'transaction' && alert.source.transaction && (
              <div style={s.sourceBox}>
                <strong>Transaction</strong>
                <span>₹{Number(alert.source.transaction.amount).toLocaleString('en-IN')} → {alert.source.transaction.recipient}</span>
                <span>Risk: {alert.source.transaction.riskLevel?.toUpperCase()} · Score {alert.source.transaction.riskScore}/100</span>
              </div>
            )}
            {alert.source?.type === 'medication' && alert.source.medication && (
              <div style={s.sourceBox}>
                <strong>Missed dose</strong>
                <span>{alert.source.medication.medicineName} · {alert.source.medication.dosage} · {alert.source.medication.scheduledTime}</span>
                <span>Date: {alert.source.log?.date}</span>
              </div>
            )}
            {alert.messageHindi && <p style={s.alertHindi}>{alert.messageHindi}</p>}
            <p style={s.alertTime}>{new Date(alert.createdAt).toLocaleString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
            })}</p>
          </div>
        ))}

        {/* DIVIDER */}
        <div style={s.divider} />

        {/* MEDICATION STATS */}
        {medFetched && (
          <div style={s.statsRow}>
            <div style={s.statCard}>
              <p style={s.statLabel}>Total today</p>
              <p style={s.statNum}>{medications.length}</p>
            </div>
            <div style={{ ...s.statCard, background: missedCount > 0 ? '#fef2f2' : undefined }}>
              <p style={s.statLabel}>Missed</p>
              <p style={{ ...s.statNum, color: missedCount > 0 ? '#dc2626' : '#0f172a' }}>{missedCount}</p>
            </div>
            <div style={s.statCard}>
              <p style={s.statLabel}>Taken</p>
              <p style={{ ...s.statNum, color: '#16a34a' }}>{takenCount}</p>
            </div>
          </div>
        )}

        {/* MEDICATIONS CARD */}
        <div style={s.searchCard}>
          <div style={s.searchTop}>
            <div>
              <p style={s.searchTitle}>Today's medications</p>
              <p style={s.searchSub}>
                {family ? "Select an elder to view and manage today's medicine schedule" : "Your medicine schedule for today"}
              </p>
            </div>
          </div>
          {family && (
            <div style={s.searchRow}>
              <div style={{ flex: 1 }}>
                <ElderSelector
                  elders={elders}
                  loading={eldersLoading}
                  error={eldersError}
                  value={effectiveElderId}
                  onChange={handleElderChange}
                  onAddElderClick={() => navigate('/add-elder')}
                />
              </div>
              <button onClick={() => fetchMedications()} style={s.fetchBtn} disabled={medLoading || !effectiveElderId}>
                {medLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          )}
        </div>

        {medError && <div style={s.errorBox}>{medError}</div>}

        {medFetched && medications.length === 0 && (
          <div style={s.empty}>
            <p style={s.emptyIcon}>💊</p>
            <p style={s.emptyTitle}>No medications scheduled</p>
            <p style={s.emptySub}>No medications found for this elder today.</p>
          </div>
        )}

        {medFetched && medications.map(med => {
          const st = STATUS_STYLES[med.status] || STATUS_STYLES.pending;
          return (
            <div key={med.medicationId} style={s.medCard}>
              <div style={s.medTop}>
                <div style={s.medLeft}>
                  <div style={s.medIcon}>💊</div>
                  <div>
                    <p style={s.medName}>{med.medicineName}</p>
                    <p style={s.medDosage}>{med.dosage} · {formatTimeAMPM(med.scheduledTime)} · {med.frequency}</p>
                  </div>
                </div>
                <div style={s.medRight}>
                  <span style={{
                    ...s.statusPill,
                    background: st.bg,
                    color: st.color,
                    border: `0.5px solid ${st.border}`
                  }}>
                    {st.label}
                  </span>
                  {med.status !== 'taken' && (
                    <button
                      onClick={() => markTaken(med.medicationId)}
                      style={s.takenBtn}
                      disabled={markingId === med.medicationId}
                    >
                      {markingId === med.medicationId ? 'Marking...' : 'Mark as taken'}
                    </button>
                  )}
                </div>
              </div>
              {med.takenAt && (
                <p style={s.takenAt}>
                  ✅ Taken at {new Date(med.takenAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          );
        })}

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
  navRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  userPill: { display: 'flex', alignItems: 'center', gap: '7px', background: '#f1f5f9', padding: '5px 12px 5px 5px', borderRadius: '100px', border: '0.5px solid #e2e8f0' },
  avatar: { width: '24px', height: '24px', background: '#0f172a', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 },
  userName: { fontSize: '13px', fontWeight: 500, color: '#0f172a' },
  fraudBtn: { padding: '7px 14px', background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.1px' },
  medBtn: { padding: '7px 14px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.1px' },
  manageBtn: { padding: '7px 14px', background: '#fff', color: '#475569', border: '0.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.1px' },
  addBtn: { padding: '7px 14px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.1px' },
  logoutBtn: { padding: '7px 14px', background: 'transparent', border: '0.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' },
  body: { maxWidth: '800px', margin: '0 auto', padding: '32px 24px' },
  hero: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  dateText: { fontSize: '12px', color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  greeting: { fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', margin: '0 0 6px' },
  heroSub: { fontSize: '14px', color: '#64748b', margin: 0 },
  activeBadge: { display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: '100px', padding: '6px 14px', fontSize: '12px', color: '#16a34a', fontWeight: 500, whiteSpace: 'nowrap' },
  activeDot: { width: '6px', height: '6px', background: '#16a34a', borderRadius: '50%', display: 'inline-block' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' },
  statCard: { background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px' },
  statLabel: { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' },
  statNum: { fontSize: '28px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' },
  searchCard: { background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  searchTop: { marginBottom: '14px' },
  searchTitle: { fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: '0 0 3px' },
  searchSub: { fontSize: '12px', color: '#94a3b8', margin: 0 },
  searchRow: { display: 'flex', gap: '8px' },
  input: { flex: 1, height: '40px', padding: '0 14px', borderRadius: '8px', border: '0.5px solid #e2e8f0', background: '#f8fafc', fontSize: '13px', color: '#0f172a', outline: 'none', fontFamily: 'monospace' },
  fetchBtn: { height: '40px', padding: '0 18px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  errorBox: { background: '#fef2f2', border: '0.5px solid #fca5a5', color: '#dc2626', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' },
  empty: { textAlign: 'center', padding: '48px 0' },
  emptyIcon: { fontSize: '36px', margin: '0 0 12px' },
  emptyTitle: { fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: '0 0 4px' },
  emptySub: { fontSize: '13px', color: '#94a3b8', margin: 0 },
  alertCard: { background: '#fff', border: '0.5px solid #e2e8f0', borderLeft: '3px solid', borderRadius: '0 12px 12px 0', padding: '16px 20px', marginBottom: '10px' },
  alertTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  alertLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  severityPill: { fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '100px', textTransform: 'capitalize' },
  alertTypeTag: { fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' },
  resolvedTag: { fontSize: '12px', color: '#16a34a', fontWeight: 600 },
  outcomeTag: { fontSize: '12px', fontWeight: 600 },
  feedbackRow: { display: 'flex', gap: '6px' },
  fraudFeedbackBtn: { padding: '6px 10px', background: '#fff1f2', color: '#be123c', border: '0.5px solid #fda4af', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' },
  falsePositiveBtn: { padding: '6px 10px', background: '#f0fdf4', color: '#15803d', border: '0.5px solid #86efac', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' },
  resolveBtn: { padding: '6px 14px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  alertMsg: { fontSize: '14px', color: '#0f172a', lineHeight: 1.6, margin: '0 0 6px' },
  alertHindi: { fontSize: '13px', color: '#64748b', lineHeight: 1.7, margin: '0 0 8px' },
  sourceBox: { display: 'flex', flexDirection: 'column', gap: '3px', background: '#f8fafc', border: '0.5px solid #e2e8f0', borderRadius: '8px', padding: '9px 12px', margin: '8px 0' },
  alertTime: { fontSize: '11px', color: '#cbd5e1', margin: 0 },
  divider: { height: '0.5px', background: '#e2e8f0', margin: '32px 0' },
  medCard: { background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', marginBottom: '10px' },
  medTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  medLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  medIcon: { fontSize: '22px' },
  medName: { fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: '0 0 3px' },
  medDosage: { fontSize: '12px', color: '#94a3b8', margin: 0 },
  medRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  statusPill: { fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '100px' },
  takenBtn: { padding: '6px 14px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  takenAt: { fontSize: '11px', color: '#16a34a', margin: '10px 0 0', fontWeight: 500 },
};

export default Dashboard;