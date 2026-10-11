import { useState, useEffect, useCallback } from 'react';
import API from '../api/axios';

export function useFamilyElders() {
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const res = await API.get('/family/elders');
      setElders(res.data.elders || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load elders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!active) return;
      await refresh(true);
    };
    load();
    return () => { active = false; };
  }, [refresh]);

  return { elders, loading, error, refresh };
}
