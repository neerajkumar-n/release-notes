'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { 
  RefreshCw, 
  ChevronDown, 
  Moon, 
  Sun,
  Sparkles,
  List,
  FileText
} from 'lucide-react';
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

export default function Page() {
  const [allItems, setAllItems] = useState<ReleaseItem[]>([]);
  const [groupedWeeks, setGroupedWeeks] = useState<ReleaseGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // --- VIEW STATE (Toggle) ---
  const [viewMode, setViewMode] = useState<'summary' | 'list'>('summary');

  // --- AI STATE ---
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [lastSummarizedRange, setLastSummarizedRange] = useState<string>('');

  // Filters
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
        week.items.forEach((item: ReleaseItem) => flatItems.push(item));
      });
      setAllItems(flatItems);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // --- AI GENERATION ---
  const generateAiSummary = useCallback(async (itemsToSummarize: ReleaseItem[]) => {
    if (itemsToSummarize.length === 0) return;
    setAiLoading(true);
    setAiSummary(null);

    let rangeStr = 'All Recent Updates';
    if (fromDate && toDate) {
        rangeStr = `${format(parseISO(fromDate), 'MMM d')} - ${format(parseISO(toDate), 'MMM d, yyyy')}`;
    }

    try {
      const res = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSummarize, weekRange: rangeStr }),
      });
      const data = await res.json();
      if (data.summary) {
        setAiSummary(data.summary);
        setLastSummarizedRange(rangeStr);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, []);

  const connectors = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((item) => { if (item.connector) set.add(item.connector); });
    return Array.from(set).sort();
  }, [allItems]);

  // --- FILTER & LOGIC ---
  useEffect(() => {
    // 1. Filter
    const filteredItems = allItems.filter((item) => {
      const itemDate = parseISO(item.originalDate);
      if (connectorFilter !== 'All' && item.connector !== connectorFilter) return false;
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;
      if (fromDate && isBefore(itemDate, startOfDay(parseISO(fromDate)))) return false;
      if (toDate && isAfter(itemDate, endOfDay(parseISO(toDate)))) return false;
      return true;
    });

    // 2. Group for List View
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

    // 3. Auto-Trigger AI (Only in Summary Mode)
    const currentRange = fromDate && toDate ? `${fromDate}:${toDate}` : 'All';
    const hasActiveFilters = fromDate !== '' || toDate !== '' || connectorFilter !== 'All';

    if (viewMode === 'summary' && hasActiveFilters && filteredItems.length > 0 && currentRange !== lastSummarizedRange && !loading) {
       const timer = setTimeout(() => generateAiSummary(filteredItems), 800);
       return () => clearTimeout(timer);
    }
    
    // Clear summary if filters are cleared
    if (!hasActiveFilters && viewMode === 'summary') {
        setAiSummary(null);
        setLastSummarizedRange('');
    }

  }, [allItems, connectorFilter, typeFilter, fromDate, toDate, loading, lastSummarizedRange, generateAiSummary, viewMode]);

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-purple-500/30">
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
          
          {/* HEADER */}
          <section className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-6">
              <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
                      Hyperswitch Release Notes
                  </h1>
                  <p className="text-sm text-slate-400">
                      Weekly updates tracked from GitHub Changelog.
                  </p>
              </div>
              
              <div className="flex items-center gap-4">
                  {/* VIEW TOGGLE */}
                  <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700">
                      <button 
                          onClick={() => setViewMode('summary')}
                          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'summary' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-slate-400 hover:text-white'}`}
                      >
                          <Sparkles size={14} /> SUMMARY
                      </button>
                      <button 
                          onClick={() => setViewMode('list')}
                          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                          <List size={14} /> LIST VIEW
                      </button>
                  </div>

                  <div className="h-6 w-px bg-slate-800 mx-1"></div>

                  <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full border border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-all">
                    {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                  </button>
              </div>
          </section>

          {/* FILTERS */}
          <section className="mb-8 p-4 rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="grid gap-4 md:grid-cols-[1fr_200px_auto]">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">FILTER BY CONNECTOR</label>
                <div className="relative">
                  <select value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value)} className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 focus:border-purple-500 outline-none transition-all">
                    <option value="All">All Connectors</option>
                    {connectors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"><ChevronDown size={16} /></div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">TYPE</label>
                <div className="relative">
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 focus:border-purple-500 outline-none transition-all">
                    <option value="All">All Types</option>
                    <option value="Feature">Features</option>
                    <option value="Bug Fix">Bug Fixes</option>
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"><ChevronDown size={16} /></div>
                </div>
              </div>
              <div className="flex gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">FROM</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none focus:border-purple-500 [color-scheme:dark]" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">TO</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none focus:border-purple-500 [color-scheme:dark]" />
                </div>
              </div>
            </div>
          </section>

          {/* --- CONTENT AREA --- */}
          <section className="min-h-[400px]">
            
            {/* VIEW 1: SUMMARY MODE */}
            {viewMode === 'summary' && (
              <>
                {(aiLoading) && (
                   <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
                      <Sparkles size={40} className="text-purple-500 animate-pulse" />
                      <p className="text-sm font-medium tracking-wide">GENERATING SUMMARY...</p>
                   </div>
                )}

                {!aiLoading && aiSummary && (
                  <div className="relative rounded-2xl border border-slate-800 bg-slate-900/40 p-10 shadow-2xl">
                    <div 
                      className="text-slate-300 leading-relaxed space-y-4"
                      dangerouslySetInnerHTML={{ __html: aiSummary }} 
                    />
                  </div>
                )}

                {!aiLoading && !aiSummary && (
                   <div className="flex flex-col items-center justify-center py-24 border border-dashed border-slate-800 rounded-2xl opacity-50">
                     <p className="text-slate-400">Select a date range to generate a summary.</p>
                   </div>
                )}
              </>
            )}

            {/* VIEW 2: LIST MODE (Raw PRs) */}
            {viewMode === 'list' && (
              <div className="space-y-6">
                {groupedWeeks.map((week) => (
                    <div key={week.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
                        <div className="mb-4 flex items-baseline justify-between border-b border-slate-800 pb-3">
                            <h2 className="text-lg font-semibold text-white">{week.headline}</h2>
                            <span className="text-xs font-mono text-slate-500">{week.date}</span>
                        </div>
                        <ul className="space-y-3">
                            {week.items.map((item, idx) => (
                                <li key={idx} className="flex gap-3 text-sm">
                                    <span className={`mt-0.5 h-fit rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.type === 'Feature' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                        {item.type === 'Feature' ? 'FEAT' : 'FIX'}
                                    </span>
                                    <div className="flex-1 text-slate-300">
                                        {item.connector && <strong className="text-white mr-1">{item.connector}:</strong>}
                                        {item.title}
                                        {item.prNumber && <a href={item.prUrl} target="_blank" className="ml-2 text-xs text-slate-500 hover:text-sky-400">#{item.prNumber}</a>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
                {groupedWeeks.length === 0 && (
                   <div className="text-center py-20 text-slate-500">No items found for this filter.</div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
