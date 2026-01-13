'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { 
  RefreshCw, 
  CalendarDays, 
  ChevronDown, 
  Moon, 
  Sun,
  Sparkles,
  Zap
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

export default function Page() {
  const [allItems, setAllItems] = useState<ReleaseItem[]>([]);
  const [groupedWeeks, setGroupedWeeks] = useState<ReleaseGroup[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Default to Dark Mode (matches your screenshot)
  const [isDarkMode, setIsDarkMode] = useState(true);

  // --- AI STATE ---
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [lastSummarizedRange, setLastSummarizedRange] = useState<string>('');

  // Filters (Dates start EMPTY now)
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // --- 1. FETCH DATA ---
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
      // NOTE: Removed the auto-date selection logic here.
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // --- 2. AI GENERATION ---
  const generateAiSummary = useCallback(async (itemsToSummarize: ReleaseItem[]) => {
    if (itemsToSummarize.length === 0) return;

    setAiLoading(true);
    setAiSummary(null);

    // Format date nicely for the report header
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

  // Initial Fetch
  useEffect(() => { fetchData(); }, []);

  // Compute Connectors
  const connectors = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((item) => { if (item.connector) set.add(item.connector); });
    return Array.from(set).sort();
  }, [allItems]);

  // --- 3. FILTER & AUTO-TRIGGER ---
  useEffect(() => {
    // A. Filter Items
    const filteredItems = allItems.filter((item) => {
      const itemDate = parseISO(item.originalDate);
      if (connectorFilter !== 'All' && item.connector !== connectorFilter) return false;
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;
      if (fromDate && isBefore(itemDate, startOfDay(parseISO(fromDate)))) return false;
      if (toDate && isAfter(itemDate, endOfDay(parseISO(toDate)))) return false;
      return true;
    });

    // B. Group by Wednesday (For the list view)
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

    // C. AUTO-TRIGGER AI (Only if we have dates selected or specific filters)
    // This prevents it from running on empty "All Time" views which might be too huge
    const currentRange = fromDate && toDate ? `${fromDate}:${toDate}` : 'All';
    const hasActiveFilters = fromDate !== '' || toDate !== '' || connectorFilter !== 'All';

    if (hasActiveFilters && filteredItems.length > 0 && currentRange !== lastSummarizedRange && !loading) {
       const timer = setTimeout(() => {
         generateAiSummary(filteredItems);
       }, 800); // Slight delay to wait for user to finish typing date
       return () => clearTimeout(timer);
    }
    // If no filters, clear the summary so we don't show old data
    if (!hasActiveFilters) {
        setAiSummary(null);
        setLastSummarizedRange('');
    }

  }, [allItems, connectorFilter, typeFilter, fromDate, toDate, loading, lastSummarizedRange, generateAiSummary]);


  // --- RENDER ---
  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-purple-500/30">
        
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
          
          {/* HEADER */}
          <section className="mb-8 flex items-center justify-between border-b border-slate-800 pb-6">
              <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
                      Hyperswitch Release Notes
                  </h1>
                  <p className="text-sm text-slate-400">
                      Automated weekly summaries generated by AI.
                  </p>
              </div>
              
              <div className="flex gap-2">
                  <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full border border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-all">
                    {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                  </button>
                  <button onClick={() => { fetchData(); setAiSummary(null); }} className="p-2 rounded-full border border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-all">
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                  </button>
              </div>
          </section>

          {/* FILTERS BAR */}
          <section className="mb-8 p-4 rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="grid gap-4 md:grid-cols-[1fr_200px_auto]">
              
              {/* Connector */}
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

              {/* Type */}
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

              {/* Dates */}
              <div className="flex gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">FROM</label>
                  <div className="relative">
                    <input 
                        type="date" 
                        value={fromDate} 
                        onChange={(e) => setFromDate(e.target.value)} 
                        className="w-40 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none focus:border-purple-500 [color-scheme:dark]" 
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">TO</label>
                  <div className="relative">
                    <input 
                        type="date" 
                        value={toDate} 
                        onChange={(e) => setToDate(e.target.value)} 
                        className="w-40 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none focus:border-purple-500 [color-scheme:dark]" 
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* --- CONTENT AREA --- */}
          <section className="min-h-[400px]">
            
            {/* LOADING STATE */}
            {(aiLoading) && (
               <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
                  <Sparkles size={40} className="text-purple-500 animate-pulse" />
                  <p className="text-sm font-medium tracking-wide">GENERATING SUMMARY...</p>
               </div>
            )}

            {/* AI SUMMARY DISPLAY */}
            {!aiLoading && aiSummary && (
              <div className="relative rounded-2xl border border-slate-800 bg-slate-900/40 p-10 shadow-2xl">
                <div className="absolute top-6 right-6 opacity-20">
                   <Sparkles size={80} className="text-purple-500" />
                </div>
                
                {/* We render the AI HTML here. 
                    NOTE: We removed 'prose' and assume the backend sends classes (text-xl, etc.) 
                */}
                <div 
                  className="text-slate-300 leading-relaxed space-y-4"
                  dangerouslySetInnerHTML={{ __html: aiSummary }} 
                />
              </div>
            )}

            {/* EMPTY STATE */}
            {!aiLoading && !aiSummary && (
               <div className="flex flex-col items-center justify-center py-24 border border-dashed border-slate-800 rounded-2xl opacity-50">
                 <p className="text-slate-400">Select a date range to generate a summary.</p>
               </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
