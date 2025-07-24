'use client';

import { useState } from 'react';

export default function Home() {
  const [result, setResult] = useState(null);

  const callProxy = async () => {
    try {
      const res = await fetch('/api/proxy/User/checkmap');
      const data = await res.json();
      setResult(data);
    } catch (err) {
    }
  };

  return (
    <main style={{ padding: 40 }}>
      <h1>🧪 Test Proxy to HMS API</h1>
      <button onClick={callProxy}>Call API</button>

      <pre style={{ marginTop: 20 }}>
        {result ? JSON.stringify(result, null, 2) : 'Chưa gọi gì cả.'}
      </pre>
    </main>
  );
}
