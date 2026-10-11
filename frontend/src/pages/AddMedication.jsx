import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useFamilyElders } from '../hooks/useFamilyElders';
import ElderSelector from '../components/ElderSelector';

function AddMedication() {
  const navigate = useNavigate();
  const { elders, loading: eldersLoading, error: eldersError } = useFamilyElders();
  const [form, setForm] = useState({
    elderId: '',
    medicineName: '',
    dosage: '',
    scheduledTime: '',
    frequency: 'daily'
  });
  // Explicit 12-hour input — three controls instead of the native
  // <input type="time">, which rendered with no AM/PM affordance under
  // some locale/browser combinations. These stay in sync with
  // form.scheduledTime, which keeps the existing "HH:MM" (24hr) storage
  // format the backend already expects — no schema/API change needed.
  const [timeHour, setTimeHour] = useState('');
  const [timeMinute, setTimeMinute] = useState('');
  const [timePeriod, setTimePeriod] = useState('AM');
  // Duration: 'indefinite' (until stopped, default) | a preset day count
  // (as a string, from the select) | 'custom' (paired with customEndDate).
  const [duration, setDuration] = useState('indefinite');
  const [customEndDate, setCustomEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Pre-selection computed directly during render — falls back to the
  // first/only elder until the user explicitly picks one.
  const selectedElderId = form.elderId || elders[0]?._id || '';

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Converts whatever's currently selected across the three time
  // controls into "HH:MM" (24hr) and writes it to form.scheduledTime —
  // called after any of hour/minute/period changes.
  const syncScheduledTime = (hour, minute, period) => {
    if (!hour || minute === '') return;
    let h24 = parseInt(hour, 10) % 12;
    if (period === 'PM') h24 += 12;
    const hh = String(h24).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    setForm(prev => ({ ...prev, scheduledTime: `${hh}:${mm}` }));
  };

  const handleHourChange = (e) => {
    setTimeHour(e.target.value);
    syncScheduledTime(e.target.value, timeMinute, timePeriod);
  };
  const handleMinuteChange = (e) => {
    setTimeMinute(e.target.value);
    syncScheduledTime(timeHour, e.target.value, timePeriod);
  };
  const handlePeriodChange = (e) => {
    setTimePeriod(e.target.value);
    syncScheduledTime(timeHour, timeMinute, e.target.value);
  };

  const handleSubmit = async () => {
    if (!selectedElderId || !form.medicineName || !form.dosage || !form.scheduledTime) {
      setError('All fields are required.');
      return;
    }
    if (duration === 'custom' && !customEndDate) {
      setError('Please pick an end date, or choose a preset duration.');
      return;
    }
    setError(''); setLoading(true);

    // Indefinite ("until stopped") sends neither field — backend leaves
    // endDate as null. A preset sends durationDays; custom sends the
    // explicit endDate. Never both — matches validateMedication's rule.
    const durationPayload = {};
    if (duration === 'custom') {
      durationPayload.endDate = customEndDate;
    } else if (duration !== 'indefinite') {
      durationPayload.durationDays = parseInt(duration, 10);
    }

    try {
      await API.post('/medications/add', { ...form, ...durationPayload, elderId: selectedElderId });
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add medication');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>

      {/* NAV */}
      <nav style={s.nav}>
        <div style={s.navLeft}>
          <i style={s.navIcon}>🛡️</i>
          <span style={s.navBrand}>Suraksha<span style={{ color: '#d97706' }}>Digi</span></span>
        </div>
        <button onClick={() => navigate('/dashboard')} style={s.backBtn}>
          ← Back to dashboard
        </button>
      </nav>

      <div style={s.body}>

        {/* HEADER */}
        <div style={s.header}>
          <p style={s.headerSub}>Medication schedule</p>
          <h1 style={s.headerTitle}>Add a new medication</h1>
          <p style={s.headerDesc}>Schedule a daily medicine reminder for your elder.</p>
        </div>

        {/* FORM CARD */}
        <div style={s.card}>

          {success && (
            <div style={s.successBox}>
              ✅ Medication added successfully! Redirecting...
            </div>
          )}

          {error && (
            <div style={s.errorBox}>{error}</div>
          )}

          <div style={s.field}>
            <label style={s.label}>Elder</label>
            <ElderSelector
              elders={elders}
              loading={eldersLoading}
              error={eldersError}
              value={selectedElderId}
              onChange={id => setForm(prev => ({ ...prev, elderId: id }))}
              onAddElderClick={() => navigate('/add-elder')}
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Medicine name</label>
            <input
              name="medicineName"
              value={form.medicineName}
              onChange={handleChange}
              placeholder="e.g. Paracetamol, Metformin"
              style={s.input}
              autoComplete="off"
            />
          </div>

          <div style={s.row}>
            <div style={{ ...s.field, flex: 1 }}>
              <label style={s.label}>Dosage</label>
              <input
                name="dosage"
                value={form.dosage}
                onChange={handleChange}
                placeholder="e.g. 500mg, 1 tablet"
                style={s.input}
                autoComplete="off"
              />
            </div>
            <div style={{ ...s.field, flex: 1 }}>
              <label style={s.label}>Scheduled time</label>
              <div style={s.timeRow}>
                <select value={timeHour} onChange={handleHourChange} style={s.timeSelect}>
                  <option value="" disabled>HH</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span style={s.timeColon}>:</span>
                <select value={timeMinute} onChange={handleMinuteChange} style={s.timeSelect}>
                  <option value="" disabled>MM</option>
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select value={timePeriod} onChange={handlePeriodChange} style={s.timePeriodSelect}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Frequency</label>
            <select
              name="frequency"
              value={form.frequency}
              onChange={handleChange}
              style={s.select}
            >
              <option value="daily">Daily</option>
            </select>
          </div>

          <div style={s.field}>
            <label style={s.label}>Duration</label>
            <select
              value={duration}
              onChange={e => setDuration(e.target.value)}
              style={s.select}
            >
              <option value="indefinite">Until stopped</option>
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="custom">Custom end date</option>
            </select>
            {duration === 'custom' && (
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                style={{ ...s.input, marginTop: '10px' }}
              />
            )}
          </div>

          <button
            onClick={handleSubmit}
            style={{ ...s.submitBtn, opacity: loading ? 0.7 : 1 }}
            disabled={loading}
          >
            {loading ? 'Adding medication...' : 'Add medication →'}
          </button>

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
  body: { maxWidth: '560px', margin: '0 auto', padding: '40px 24px' },
  header: { marginBottom: '28px' },
  headerSub: { fontSize: '12px', color: '#d97706', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' },
  headerTitle: { fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', margin: '0 0 6px' },
  headerDesc: { fontSize: '14px', color: '#64748b', margin: 0 },
  card: { background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '16px', padding: '28px' },
  successBox: { background: '#f0fdf4', border: '0.5px solid #86efac', color: '#16a34a', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, marginBottom: '20px' },
  errorBox: { background: '#fef2f2', border: '0.5px solid #fca5a5', color: '#dc2626', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', marginBottom: '20px' },
  field: { marginBottom: '18px' },
  row: { display: 'flex', gap: '16px' },
  label: { display: 'block', fontSize: '12px', fontWeight: 600, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '7px' },
  input: { width: '100%', height: '42px', padding: '0 14px', borderRadius: '8px', border: '0.5px solid #e2e8f0', background: '#f8fafc', fontSize: '13px', color: '#0f172a', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', height: '42px', padding: '0 14px', borderRadius: '8px', border: '0.5px solid #e2e8f0', background: '#f8fafc', fontSize: '13px', color: '#0f172a', outline: 'none', cursor: 'pointer' },
  timeRow: { display: 'flex', alignItems: 'center', gap: '4px' },
  timeSelect: { flex: 1, height: '42px', padding: '0 8px', borderRadius: '8px', border: '0.5px solid #e2e8f0', background: '#f8fafc', fontSize: '13px', color: '#0f172a', outline: 'none', cursor: 'pointer' },
  timeColon: { fontSize: '14px', color: '#64748b', fontWeight: 600 },
  timePeriodSelect: { flex: 1, height: '42px', padding: '0 8px', borderRadius: '8px', border: '0.5px solid #e2e8f0', background: '#f8fafc', fontSize: '13px', color: '#0f172a', outline: 'none', cursor: 'pointer' },
  hint: { fontSize: '11px', color: '#94a3b8', margin: '6px 0 0' },
  submitBtn: { width: '100%', height: '44px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.2px', marginTop: '8px' },
};

export default AddMedication;