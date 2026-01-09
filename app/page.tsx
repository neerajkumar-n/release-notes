'use client';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function Page() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
        const res = await fetch('/api/release-notes');
        const json = await res.json();
        setData(json);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-900">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">Hyperswitch Releases</h1>
            <button 
                onClick={fetchData}
                className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded hover:opacity-80"
            >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                {loading ? "Fetching..." : "Refresh"}
            </button>
        </div>

        {data.map((week: any, i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow-sm mb-6 border">
                <h2 className="text-xl font-bold mb-4 text-blue-600">{week.headline}</h2>
                <ul className="space-y-3">
                    {week.items.map((item: any, j: number) => (
                        <li key={j} className="flex gap-3">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded h-fit mt-1 ${
                                item.type === 'Feature' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                                {item.type.toUpperCase()}
                            </span>
                            <span className="text-sm">
                                {item.connector && <strong>{item.connector}: </strong>}
                                {item.title}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        ))}
        {data.length === 0 && !loading && <p>No data found.</p>}
      </div>
    </div>
  );
}
