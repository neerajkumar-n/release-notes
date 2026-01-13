'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, CalendarDays, LayoutList, FileText } from 'lucide-react';
import { 
  parseISO, 
  isBefore, 
  isAfter, 
  nextWednesday, 
  isWednesday, 
  format, 
  startOfDay, 
  endOfDay 
} from 'date-fns';

// --- TYPES ---
type ReleaseItem = {
  title: string;
  type: 'Feature' | 'Bug Fix';
  connector: string | null;
  prNumber?: string;
  prUrl?: string;
  originalDate: string; 
};

type ReleaseGroup = {
  id: string;
  date: string;     
  headline: string; 
  items: ReleaseItem[];
};

// --- CATEGORIES FOR EXECUTIVE SUMMARY ---
type SummaryCategory = 'Connectors' | 'Customer & Access' | 'Routing & Core' | 'Other';

export default function Page() {
  const [allItems, setAllItems] = useState<ReleaseItem[]>([]);
  const [groupedWeeks, setGroupedWeeks] = useState<ReleaseGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'summary'>('summary'); // Default to Summary

  // --- FILTERS STATE ---
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // --- FETCH DATA ---
  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/release-notes');
      const weeksData = await res.json();
      const flatItems: ReleaseItem[] = [];
      weeksData.forEach((week: any) => {
        week.items.forEach((item: ReleaseItem) => {
          flatItems.push(item);
        });
      });
      setAllItems(flatItems);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const connectors = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((item) => {
      if (item.connector) set.add(item.connector);
    });
    return Array.from(set).sort();
  }, [allItems]);

  // --- HELPER: CATEGORIZE ITEM ---
  function getCategory(item: ReleaseItem): SummaryCategory {
    // 1. If it has a connector, it goes to Connectors
    if (item.connector) return 'Connectors';

    const text = item.title.toLowerCase();

    // 2. Customer & Access Keywords
    const customerKeywords = ['auth', 'user', 'role', 'permission', 'locker', 'payout', 'merchant', 'dashboard', 'oidc', 'login', 'signup', 'invite', 'api key', 'jwt'];
    if (customerKeywords.some(k => text.includes(k))) return 'Customer & Access';

    // 3. Routing & Core Keywords
    const coreKeywords = ['routing', 'router', 'gsm', 'tunnel', 'infra', 'database', 'db', 'rust', 'wasm', 'kafka', 'redis', 'webhook', 'analytics', 'monitoring', 'alert', 'scheduler', 'batch'];
    if (coreKeywords.some(k => text.includes(k))) return 'Routing & Core';

    // 4. Fallback
    return 'Other';
  }

  // --- MAIN LOGIC ---
  useEffect(() => {
    const filteredItems = allItems.filter((item) => {
      const itemDate = parseISO(item.originalDate);
      if (connectorFilter !== 'All' && item.connector !== connectorFilter) return false;
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;
      if (fromDate) {
        const start = startOfDay(parseISO(fromDate));
        if (isBefore(itemDate, start)) return false;
      }
      if (toDate) {
        const end = endOfDay(parseISO(toDate));
        if (isAfter(itemDate, end)) return false;
      }
      return true;
    });

    const groups: Record<string, ReleaseItem[]> = {};

    filteredItems.forEach((item) => {
      const releaseDate = parseISO(item.originalDate);
      const cycleDate = isWednesday(releaseDate) ? releaseDate : nextWednesday(releaseDate);
      const key = format(cycleDate, 'yyyy-MM-dd');

      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const result: ReleaseGroup[] = Object.keys(groups)
      .sort((a, b) => b.localeCompare(a)) 
      .map((dateKey) => {
        const dateObj = parseISO(dateKey);
        const prevThurs = new Date(dateObj);
        prevThurs.setDate(dateObj.getDate() - 6);
        return {
          id: dateKey,
          date: dateKey,
          headline: `${format(prevThurs, 'MMM d')} – ${format(dateObj, 'MMM d')}`,
          items: groups[dateKey],
        };
      });

    setGroupedWeeks(result);
  }, [allItems, connectorFilter, typeFilter, fromDate, toDate]);

  // --- RENDER HELPERS FOR SUMMARY VIEW ---
  const renderSummarySection = (title: string, items: ReleaseItem[]) => {
    if (items.length === 0) return null;

    // If section is "Connectors", group by Connector Name
    if (title === 'Connector expansions and enhancements') {
        const byConnector: Record<string, ReleaseItem[]> = {};
        items.forEach(item => {
            const name = item.connector || 'Other';
            if (!byConnector[name]) byConnector[name] = [];
            byConnector[name].push(item);
        });

        return (
            <div className="mb-6 last:mb-0">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-sky-400 border-b border-sky-500/20 pb-1 w-fit">
                    {title}
                </h3>
                <ul className="space-y-3">
                    {Object.entries(byConnector).sort().map(([name, connectorItems]) => (
                        <li key={name} className="text-sm text-slate-300">
                            <span className="font-bold text-slate-100">{name}: </span>
                            {connectorItems.map((c, i) => (
                                <span key={i}>
                                    {c.title}
                                    {c.prNumber && (
                                        <a href={c.prUrl} target="_blank" className="ml-1 text-xs text-slate-500 hover:text-sky-400 no-underline">
                                            [#{c.prNumber}]
                                        </a>
                                    )}
                                    {i < connectorItems.length - 1 ? '; ' : ''}
                                </span>
                            ))}
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    // Standard Render for other sections
    return (
      <div className="mb-6 last:mb-0">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-sky-400 border-b border-sky-500/20 pb-1 w-fit">
            {title}
        </h3>
        <ul className="space-y-2">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm text-slate-300 leading-relaxed">
              <span className="text-slate-100 font-medium">{item.title}</span>
              {item.prNumber && (
                <a href={item.prUrl} target="_blank" className="ml-2 text-xs text-slate-500 hover:text-sky-400">
                    [#{item.prNumber}]
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans">
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-10">
        
        {/* HEADER */}
        <section className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-sky-400">
                    Release Notes
                </p>
                <h1 className="mb-3 text-3xl font-bold tracking-tight text-white">
                    Hyperswitch Weekly
                </h1>
                <p className="max-w-xl text-sm text-slate-400">
                    {viewMode === 'summary' 
                        ? "Executive summary grouped by business domain (Wednesday cycles)."
                        : "Detailed list of all changelog items (Wednesday cycles)."
                    }
                </p>
            </div>
            
            <div className="flex items-center gap-3">
                 {/* VIEW TOGGLE */}
                <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button 
                        onClick={() => setViewMode('summary')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'summary' ? 'bg-sky-500/10 text-sky-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <FileText size={14} /> Summary
                    </button>
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-sky-500/10 text-sky-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <LayoutList size={14} /> List
                    </button>
                </div>

                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="flex items-center justify-center h-9 w-9 rounded-full border border-slate-700 bg-slate-900/50 text-slate-400 hover:border-sky-500 hover:text-sky-400"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>
        </section>

        {/* FILTERS */}
        <section className="mb-8 rounded-xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm">
          <div className="grid gap-5 md:grid-cols-[1fr_200px_auto]">
            {/* Connector */}
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Connector</label>
              <div className="relative">
                <select value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value)} className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none">
                  <option value="All">All Connectors</option>
                  {connectors.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</label>
              <div className="relative">
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none">
                  <option value="All">All Types</option>
                  <option value="Feature">Features</option>
                  <option value="Bug Fix">Bug Fixes</option>
                </select>
              </div>
            </div>

            {/* Date Range */}
            <div className="flex gap-2">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">From</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500" />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">To</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500" />
              </div>
            </div>
          </div>
        </section>

        {/* CONTENT */}
        <section className="space-y-8">
          {groupedWeeks.map((week) => {
            // Categorize items for Summary Mode
            const catConnectors = week.items.filter(i => getCategory(i) === 'Connectors');
            const catCustomer = week.items.filter(i => getCategory(i) === 'Customer & Access');
            const catCore = week.items.filter(i => getCategory(i) === 'Routing & Core');
            const catOther = week.items.filter(i => getCategory(i) === 'Other');

            return (
                <div key={week.id} className="rounded-xl border border-slate-800 bg-slate-900/20 overflow-hidden">
                    <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4 flex justify-between items-center">
                        <h2 className="text-lg font-semibold text-slate-100">{week.headline}</h2>
                        <span className="text-xs font-mono text-slate-500">{week.date}</span>
                    </div>
                
                    <div className="p-6">
                        {viewMode === 'summary' ? (
                            // EXECUTIVE SUMMARY VIEW
                            <div>
                                {renderSummarySection('Connector expansions and enhancements', catConnectors)}
                                {renderSummarySection('Customer and access management', catCustomer)}
                                {renderSummarySection('Routing and core improvements', catCore)}
                                {renderSummarySection('General Improvements', catOther)}
                                
                                {week.items.length === 0 && <p className="text-slate-500 text-sm">No items in this range.</p>}
                            </div>
                        ) : (
                            // DETAILED LIST VIEW (Original)
                            <ul className="space-y-4">
                                {week.items.map((item, idx) => (
                                    <li key={idx} className="flex flex-col gap-1 md:flex-row md:items-start md:gap-3 text-sm">
                                         <span className={`mt-0.5 inline-flex h-fit w-fit items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.type === 'Feature' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                            {item.type === 'Feature' ? 'FEAT' : 'FIX'}
                                        </span>
                                        <div className="flex-1">
                                            <p className="text-slate-300">
                                                {item.connector && <strong className="text-slate-100 mr-1">{item.connector}:</strong>}
                                                {item.title}
                                            </p>
                                            {item.prNumber && <a href={item.prUrl} target="_blank" className="text-xs text-slate-500 hover:text-sky-400">PR #{item.prNumber}</a>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            );
          })}

          {groupedWeeks.length === 0 && !loading && (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-400">No data found for this period.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
