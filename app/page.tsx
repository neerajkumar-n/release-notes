'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, CalendarDays } from 'lucide-react';
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
  originalDate: string; // ISO String from backend
};

type ReleaseGroup = {
  id: string;
  date: string;     // The "Wednesday" date
  headline: string; // e.g. "Week of Jan 1 - Jan 7"
  items: ReleaseItem[];
};

export default function Page() {
  const [allItems, setAllItems] = useState<ReleaseItem[]>([]);
  const [groupedWeeks, setGroupedWeeks] = useState<ReleaseGroup[]>([]);
  const [loading, setLoading] = useState(false);

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
      
      // Flatten all weeks into a single list of items
      // This allows us to re-bucket them into our own Wednesday cycles
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

  // --- EXTRACT CONNECTORS FOR DROPDOWN ---
  const connectors = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((item) => {
      if (item.connector) set.add(item.connector);
    });
    return Array.from(set).sort();
  }, [allItems]);

  // --- MAIN LOGIC: FILTER & GROUP ---
  useEffect(() => {
    // 1. First, apply filters to the raw list of items
    const filteredItems = allItems.filter((item) => {
      const itemDate = parseISO(item.originalDate);

      // Connector Filter
      if (connectorFilter !== 'All' && item.connector !== connectorFilter) return false;
      
      // Type Filter
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;

      // Date Range Filter (Inclusive)
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

    // 2. Group items by their "Next Wednesday"
    // If a release was on Monday Jan 1st, it belongs to the cycle ending Wednesday Jan 3rd.
    const groups: Record<string, ReleaseItem[]> = {};

    filteredItems.forEach((item) => {
      const releaseDate = parseISO(item.originalDate);
      
      // Logic: If today is Wed, count it. If not, find the upcoming Wed.
      const cycleDate = isWednesday(releaseDate) 
        ? releaseDate 
        : nextWednesday(releaseDate);
      
      const key = format(cycleDate, 'yyyy-MM-dd'); // e.g. "2026-01-07"

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });

    // 3. Convert the Groups Object into an Array and Sort (Newest first)
    const result: ReleaseGroup[] = Object.keys(groups)
      .sort((a, b) => b.localeCompare(a)) 
      .map((dateKey) => {
        const dateObj = parseISO(dateKey);
        
        // Calculate "Previous Thursday" just for the display headline
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

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
        
        {/* HERO SECTION */}
        <section className="mb-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-sky-400">
            Release Notes
          </p>
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-white md:text-4xl">
            Hyperswitch Weekly Updates
          </h1>
          <p className="max-w-2xl text-sm text-slate-400 leading-relaxed">
            A single view of what changed in Hyperswitch. 
            Releases are automatically grouped into 
            <span className="text-slate-200 font-medium"> Wednesday Cycles</span>.
          </p>

          <button
            onClick={fetchData}
            disabled={loading}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/50 px-4 py-1.5 text-xs font-medium text-slate-300 transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Fetching...' : 'Refresh Data'}
          </button>
        </section>

        {/* FILTERS BAR */}
        <section className="mb-8 rounded-xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm">
          <div className="grid gap-5 md:grid-cols-[1fr_200px_auto]">
            
            {/* Connector Filter */}
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Connector
              </label>
              <div className="relative">
                <select
                  value={connectorFilter}
                  onChange={(e) => setConnectorFilter(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="All">All Connectors</option>
                  {connectors.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {/* Arrow Icon */}
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </div>

            {/* Type Filter */}
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Type
              </label>
              <div className="relative">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as any)}
                  className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="All">All Types</option>
                  <option value="Feature">Features</option>
                  <option value="Bug Fix">Bug Fixes</option>
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </div>

            {/* Date Range Inputs */}
            <div className="flex gap-2">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  From
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  To
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RESULTS LIST */}
        <section className="space-y-6">
          {groupedWeeks.map((week) => (
            <div
              key={week.id}
              className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 shadow-sm transition hover:border-slate-700"
            >
              <div className="border-b border-slate-800 bg-slate-900/50 px-5 py-3 flex justify-between items-center">
                <h2 className="text-base font-semibold text-slate-100">
                  {week.headline}
                </h2>
                <span className="text-xs font-mono text-slate-500">Week ending {week.date}</span>
              </div>
              
              <ul className="divide-y divide-slate-800/50 px-5">
                {week.items.map((item, idx) => (
                  <li key={idx} className="py-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
                      
                      {/* Badge */}
                      <span
                        className={`mt-0.5 inline-flex h-fit w-fit flex-shrink-0 items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          item.type === 'Feature'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {item.type === 'Feature' ? 'Feat' : 'Fix'}
                      </span>

                      <div className="flex-1 space-y-1.5">
                        <p className="text-sm leading-relaxed text-slate-300">
                          {item.connector && (
                            <span className="mr-2 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
                              {item.connector}
                            </span>
                          )}
                          {item.title}
                        </p>
                        
                        {item.prNumber && item.prUrl && (
                          <a
                            href={item.prUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="group inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-sky-400"
                          >
                            <span>PR #{item.prNumber}</span>
                            <span className="opacity-0 transition-opacity group-hover:opacity-100">↗</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {groupedWeeks.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 py-16 text-center">
              <p className="text-slate-400">No release notes found.</p>
              <p className="text-xs text-slate-600 mt-1">Try adjusting your filters.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
