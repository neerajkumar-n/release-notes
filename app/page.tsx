'use client';

import { useEffect, useMemo, useState } from 'react';
import { 
  ChevronDown, 
  Moon, 
  Sun,
  List,
  FileText,
  Clock,
  Rocket
} from 'lucide-react';
import { 
  parseISO, 
  isBefore, 
  isAfter, 
  nextWednesday, 
  isWednesday, 
  format, 
  startOfDay, 
  endOfDay,
  addDays,
  isFuture,
  isSameDay,
  subDays
} from 'date-fns';

// --- TYPES ---
type ReleaseItem = {
  title: string;
  type: 'Feature' | 'Bug Fix';
  connector: string | null;
  prNumber?: string;
  prUrl?: string;
  originalDate: string; 
  version: string | null;
};

// A "Chunk" represents 2 weeks of data + the AI summary for that period
type DataChunk = {
  id: number;
  start: string;
  end: string;
  summaryHtml: string;
  items: ReleaseItem[];
};

type ReleaseGroup = {
  id: string;
  date: string;     
  headline: string; 
  releaseVersion: string | null;
  items: ReleaseItem[];
  isCurrentWeek: boolean;
  productionDate: string;
};

export default function Page() {
  // State for Chunks (AI View)
  const [chunks, setChunks] = useState<DataChunk[]>([]);
  
  // State for List View (Aggregated items from all chunks)
  const [allItems, setAllItems] = useState<ReleaseItem[]>([]);
  const [groupedWeeks, setGroupedWeeks] = useState<ReleaseGroup[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [viewMode, setViewMode] = useState<'summary' | 'list'>('summary');

  // Filters
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // --- 1. CHUNKING LOGIC (The New Brain) ---
  const getChunkDates = (chunkIndex: number) => {
    const today = new Date();
    // End date moves back 14 days for every "Load More" click
    const endDate = subDays(today, chunkIndex * 14); 
    // Start date is 14 days before the end date
    const startDate = subDays(endDate, 14);

    return {
      start: startDate.toISOString().split('T')[0], 
      end: endDate.toISOString().split('T')[0]
    };
  };

  const loadNextChunk = async () => {
    setLoading(true);
    setError(null);
    
    const nextIndex = chunks.length;
    const { start, end } = getChunkDates(nextIndex);
    const cacheKey = `chunk_${start}_${end}`;

    try {
      let chunkData: DataChunk;

      // A. Check Local Storage
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        chunkData = JSON.parse(cached);
      } else {
        // B. Fetch from API (GitHub + AI)
        const res = await fetch(`/api/generate-summary?startDate=${start}&endDate=${end}`);
        if (!res.ok) throw new Error('Failed to fetch summary');
        
        const data = await res.json();
        
        chunkData = {
          id: nextIndex,
          start,
          end,
          summaryHtml: data.summary, // The HTML from AI
          items: data.items || []    // The raw PRs for List View
        };
        
        // Save to cache
        localStorage.setItem(cacheKey, JSON.stringify(chunkData));
      }

      // Update State
      setChunks(prev => [...prev, chunkData]);
      setAllItems(prev => [...prev, ...chunkData.items]); // Append new items to the main list

    } catch (e: any) {
      console.error(e);
      setError("Failed to load updates. " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial Load
  useEffect(() => { loadNextChunk(); }, []);

  // --- 2. LIST VIEW LOGIC (Preserving your existing Grouping) ---
  const connectors = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((item) => { if (item.connector) set.add(item.connector); });
    return Array.from(set).sort();
  }, [allItems]);

  // Re-run grouping whenever `allItems` (data) or filters change
  useEffect(() => {
    // A. Filter
    const filteredItems = allItems.filter((item) => {
      const itemDate = parseISO(item.originalDate);
      if (connectorFilter !== 'All' && item.connector !== connectorFilter) return false;
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;
      if (fromDate && isBefore(itemDate, startOfDay(parseISO(fromDate)))) return false;
      if (toDate && isAfter(itemDate, endOfDay(parseISO(toDate)))) return false;
      return true;
    });

    // B. Group by Wednesday
    const groups: Record<string, {items: ReleaseItem[], version: string | null}> = {};
    
    filteredItems.forEach((item) => {
      const releaseDate = parseISO(item.originalDate);
      const cycleDate = isWednesday(releaseDate) ? releaseDate : nextWednesday(releaseDate);
      const key = format(cycleDate, 'yyyy-MM-dd');
      
      if (!groups[key]) groups[key] = { items: [], version: null };
      
      groups[key].items.push(item);

      if (item.version && isSameDay(releaseDate, cycleDate)) {
        groups[key].version = item.version;
      }
    });

    const result: ReleaseGroup[] = Object.keys(groups)
      .sort((a, b) => b.localeCompare(a)) 
      .map((dateKey) => {
        const cycleDateObj = parseISO(dateKey);
        const prevThurs = new Date(cycleDateObj);
        prevThurs.setDate(cycleDateObj.getDate() - 6);

        const isCurrent = isFuture(cycleDateObj) || (format(new Date(), 'yyyy-MM-dd') === dateKey);
        const prodDate = addDays(cycleDateObj, 8);

        return {
          id: dateKey,
          date: dateKey,
          headline: `${format(prevThurs, 'MMM d')} – ${format(cycleDateObj, 'MMM d')}`,
          releaseVersion: groups[dateKey].version,
          items: groups[dateKey].items,
          isCurrentWeek: isCurrent,
          productionDate: format(prodDate, 'EEE, MMM d'),
        };
      });
    setGroupedWeeks(result);
  }, [allItems, connectorFilter, typeFilter, fromDate, toDate]);

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 font-sans selection:bg-sky-500/30 transition-colors duration-300">
        <main className="mx-auto max-w-6xl px-4 pb-20 pt-12">
          
          {/* HEADER */}
          <section className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-gray-200 dark:border-slate-800 pb-8">
              <div>
                  <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-3">
                      Hyperswitch Release Notes
                  </h1>
                  <p className="text-base text-slate-500 dark:text-slate-400">
                      Weekly updates tracked from GitHub Changelog.
                  </p>
              </div>
              
              <div className="flex items-center gap-4">
                  <div className="flex bg-gray-200 dark:bg-slate-900 p-1.5 rounded-xl border border-gray-300 dark:border-slate-700">
                      <button 
                          onClick={() => setViewMode('summary')}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'summary' ? 'bg-white text-sky-700 shadow-sm dark:bg-sky-600 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                      >
                          <FileText size={16} /> EXECUTIVE
                      </button>
                      <button 
                          onClick={() => setViewMode('list')}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-white text-sky-700 shadow-sm dark:bg-sky-600 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                      >
                          <List size={16} /> LIST VIEW
                      </button>
                  </div>

                  <div className="h-8 w-px bg-gray-300 dark:bg-slate-800 mx-1"></div>

                  <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-3 rounded-full border border-gray-300 bg-white text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white transition-all">
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                  </button>
              </div>
          </section>

          {/* FILTERS (Only show in List Mode or if you want them to apply globally) */}
          <section className="mb-10 p-5 rounded-2xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/50 shadow-sm">
            <div className="grid gap-5 md:grid-cols-[1fr_200px_auto]">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">FILTER BY CONNECTOR</label>
                <div className="relative">
                  <select value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value)} className="w-full appearance-none rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-base text-slate-700 focus:border-sky-500 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <option value="All">All Connectors</option>
                    {connectors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"><ChevronDown size={18} /></div>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">TYPE</label>
                <div className="relative">
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="w-full appearance-none rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-base text-slate-700 focus:border-sky-500 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <option value="All">All Types</option>
                    <option value="Feature">Features</option>
                    <option value="Bug Fix">Bug Fixes</option>
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"><ChevronDown size={18} /></div>
                </div>
              </div>
              <div className="flex gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">FROM</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-44 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-base text-slate-700 outline-none focus:border-sky-500 [color-scheme:light] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:[color-scheme:dark]" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">TO</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-44 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-base text-slate-700 outline-none focus:border-sky-500 [color-scheme:light] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:[color-scheme:dark]" />
                </div>
              </div>
            </div>
          </section>

          {/* --- CONTENT AREA --- */}
          <section className="min-h-[400px]">

            {/* ERROR STATE */}
            {error && (
               <div className="p-4 mb-8 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-800">
                 {error}
                 <button onClick={() => loadNextChunk()} className="ml-4 underline font-bold">Try Again</button>
               </div>
            )}

            {/* VIEW MODE: EXECUTIVE (AI CHUNKS) */}
            {viewMode === 'summary' && (
              <div className="space-y-12">
                {chunks.map((chunk) => (
                   <div key={chunk.id} className="relative pl-8 md:pl-0 fade-in">
                      {/* Timeline Decoration */}
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-sky-500/50 via-gray-300 to-transparent md:hidden dark:via-slate-800"></div>

                      <div className="mb-6">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
                           Period: {chunk.start} — {chunk.end}
                        </span>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                          Bi-Weekly Recap
                        </h2>
                      </div>

                      <div className="rounded-2xl border border-gray-200 bg-white p-8 md:p-10 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
                         {/* THE AI HTML IS RENDERED HERE */}
                         <div dangerouslySetInnerHTML={{ __html: chunk.summaryHtml }} />
                      </div>
                   </div>
                ))}
              </div>
            )}

            {/* VIEW MODE: LIST (RAW ITEMS) */}
            {viewMode === 'list' && (
               <div>
                  {groupedWeeks.length === 0 && !loading && (
                    <div className="text-center py-20 border border-dashed border-gray-300 rounded-2xl dark:border-slate-800 opacity-60">
                      <p className="text-lg text-slate-500">No release notes found for these filters.</p>
                    </div>
                  )}

                  {groupedWeeks.map((week) => (
                    <div key={week.id} className="mb-12 relative pl-8 md:pl-0">
                      {/* Timeline line */}
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-sky-500/50 via-gray-300 to-transparent md:hidden dark:via-slate-800"></div>

                      <div className="mb-6">
                          <div className="flex items-baseline gap-4 mb-3">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{week.headline}</h2>
                            <span className="text-base font-mono text-slate-500">{week.date}</span>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-4">
                              {week.isCurrentWeek && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 ring-1 ring-amber-500/20">
                                    <Clock size={12} /> In Progress
                                </span>
                              )}
                              {week.releaseVersion && (
                                <span className="inline-block rounded-md bg-slate-100 px-2.5 py-1 text-sm font-mono font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                                    {week.releaseVersion}
                                </span>
                              )}
                              <span className="flex items-center gap-2 text-sm text-slate-500 ml-1">
                                  <Rocket size={14} />
                                  Live in Production: <span className="font-semibold text-sky-600 dark:text-sky-400">{week.productionDate}</span>
                              </span>
                          </div>
                      </div>

                      <div className="rounded-2xl border border-gray-200 bg-white p-8 md:p-10 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
                         <ul className="space-y-5">
                            {week.items.map((item, idx) => (
                               <li key={idx} className="flex flex-col gap-1 md:flex-row md:items-start md:gap-4 text-base">
                                  <span className={`mt-0.5 inline-flex h-fit w-fit items-center rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${item.type === 'Feature' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                                     {item.type === 'Feature' ? 'FEAT' : 'FIX'}
                                  </span>
                                  <div className="flex-1">
                                     <p className="text-slate-700 dark:text-slate-300 leading-snug">
                                        {item.connector && <strong className="text-slate-900 dark:text-slate-100 mr-1.5">{item.connector}:</strong>}
                                        {item.title}
                                     </p>
                                     {item.prNumber && <a href={item.prUrl} target="_blank" className="text-xs text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400">#{item.prNumber}</a>}
                                  </div>
                               </li>
                            ))}
                         </ul>
                      </div>
                    </div>
                  ))}
               </div>
            )}

            {/* LOAD MORE BUTTON */}
            <div className="mt-12 text-center pb-20">
               <button 
                 onClick={loadNextChunk}
                 disabled={loading}
                 className="px-8 py-3 bg-black text-white text-sm font-bold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg dark:bg-white dark:text-black dark:hover:bg-gray-200"
               >
                 {loading ? "Analyzing next 2 weeks..." : "Load Older Updates"}
               </button>
            </div>
            
          </section>
        </main>
      </div>
    </div>
  );
}
