import { useState, useEffect } from 'react';
import { onSnapshot } from 'firebase/firestore';

// Generic real-time listener hook
export function useCollection(queryRef) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!queryRef) return;
    const unsub = onSnapshot(
      queryRef,
      (snap) => {
        setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { setError(err); setLoading(false); },
    );
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error };
}
