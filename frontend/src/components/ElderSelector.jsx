// Presentational elder selector. Data fetching lives in useFamilyElders —
// this component just renders whatever it's given, so it can be reused
// on both the Dashboard and Add Medication pages without duplicating
// loading/error/empty logic.
function ElderSelector({ elders, loading, error, value, onChange, onAddElderClick }) {
  if (loading) {
    return <p style={s.hint}>Loading elders...</p>;
  }

  if (error) {
    return <div style={s.errorBox}>{error}</div>;
  }

  if (elders.length === 0) {
    return (
      <div style={s.empty}>
        <p style={s.emptySub}>No elders have been added yet.</p>
        {onAddElderClick && (
          <button onClick={onAddElderClick} style={s.addBtn}>+ Add elder</button>
        )}
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={s.select}
    >
      {elders.map(elder => (
        <option key={elder._id} value={elder._id}>
          {elder.name}
        </option>
      ))}
    </select>
  );
}

const s = {
  select: { width: '100%', height: '40px', padding: '0 14px', borderRadius: '8px', border: '0.5px solid #e2e8f0', background: '#f8fafc', fontSize: '13px', color: '#0f172a', outline: 'none', cursor: 'pointer' },
  hint: { fontSize: '12px', color: '#94a3b8', margin: 0 },
  errorBox: { background: '#fef2f2', border: '0.5px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' },
  empty: { fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '10px' },
  emptySub: { margin: 0 },
  addBtn: { padding: '6px 12px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
};

export default ElderSelector;
