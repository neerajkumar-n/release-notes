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
  endOfDay,
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
  
  // Default to Dark Mode
  const [isDarkMode, setIsDarkMode] = useState(true);

  // --- AI STATE ---
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [last summarizedRange, setLastSummarizedRange] = useState<string>('');

  // Filters
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // --- 1. FETCH DATA & AUTO-SELECT LATEST WEEK ---
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

      // AUTO-SETUP: If this is the first load, set the date range to the latest week
      if (!fromDate && !toDate && flatItems.length > 0) {
        // Sort items by date descending to find the newest
        const sorted = [...flatItems].sort((a, b) => b.originalDate.localeCompare(a.originalDate));
        const newestDate = parseISO(sorted[0].originalDate);
        
        // Default View: Last 14 Days (Gives enough context for a good summary)
        const start = subDays(newestDate, 13); // 2 weeks window
        setFromDate(format(start, 'yyyy-MM-dd'));
        setToDate(format(newestDate, 'yyyy-MM-dd'));
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // --- 2. AI GENERATION (Wrapped in Callback to use in Effects) ---
  const generateAiSummary = useCallback(async (itemsToSummarize: ReleaseItem[]) => {
    if (itemsToSummarize.length === 0) return;

    setAiLoading(true);
    setAiSummary(null); // Clear previous summary while loading

    const rangeStr = fromDate && toDate ? `${fromDate} to ${toDate}` : 'Recent Updates';

    try {
      const res = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSummarize, weekRange: rangeStr }),
      });
      
      const data = await res.json();
      if (data.summary) {
        setAiSummary(data.summary);
        setLastSummarizedRange(rangeStr); // Remember what we summarized
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  }, [fromDate, toDate]);

  // Initial Fetch
  useEffect(() => { fetchData(); }, []);

  // Compute Connectors for Dropdown
  const connectors = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((item) => { if (item.connector) set.add(item.connector); });
    return Array.from(set).sort();
  }, [allItems]);

  // --- 3. FILTERING LOGIC ---
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

    // B. Group by Wednesday
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

    // C. AUTO-TRIGGER AI 
    // Trigger ONLY if: 
    // 1. We have filtered items
    // 2. We haven't already summarized this exact range (prevents infinite loops)
    // 3. We are not currently loading
    const currentRange = fromDate && toDate ? `${fromDate} to ${toDate}` : 'All';
    if (filteredItems.length > 0 && filteredItems.length < 100 && currentRange !== last summarizedRange && !loading) {
       // We use a small timeout to let the UI settle before blasting the API
       const timer = setTimeout(() => {
         generateAiSummary(filteredItems);
       }, 500);
       return () => clearTimeout(timer);
    }

  }, [allItems, connectorFilter, typeFilter, fromDate, toDate, loading, last summarizedRange, generateAiSummary]);


  // --- RENDER ---
  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 font-sans selection:bg-purple-500/30 transition-colors duration-300">
        
        <main className="mx-auto max-w-5xl px-4 pb-16 pt-10">
          
          {/* HEADER */}
          <section className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-gray-200 dark:border-slate-800 pb-8">
              <div>
                  <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700 ring-1 ring-inset ring-purple-700/10 dark:bg-purple-500/10 dark:text-purple-400 dark:ring-purple-500/20">
                          <Zap size={12} className="mr-1 fill-current" /> AI ENABLED
                      </span>
                  </div>
                  <h1 className="mb-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      Hyperswitch Release Notes
                  </h1>
                  <p className="max-w-xl text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      Automated weekly summaries generated by AI.
                  </p>
              </div>
              
              <div className="flex items-center gap-3">
                  <button onClick={() => setIsDarkMode(!isDarkMode)} className="flex items-center gap-2 rounded-full bg-white border border-gray-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-all">
                    {isDarkMode ? <Sun size={14} /> : <Moon size={14} />} {isDarkMode ? 'Light' : 'Dark'}
                  </button>
                  
                  {/* Manual Refresh Button */}
                  <button onClick={() => { setLastSummarizedRange(''); fetchData(); }} className="flex items-center justify-center h-8 w-8 rounded-full border border-gray-200 bg-white text-slate-500 hover:text-purple-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-purple-400">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  </button>
              </div>
          </section>

          {/* FILTERS */}
          <section className="mb-8 p-1">
            <div className="grid gap-4 md:grid-cols-[1fr_200px_auto]">
              {/* Connector */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Connector</label>
                <div className="relative">
                  <select value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value)} className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                    <option value="All">All Connectors</option>
                    {connectors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><ChevronDown size={14} /></div>
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</label>
                <div className="relative">
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                    <option value="All">All Types</option>
                    <option value="Feature">Features</option>
                    <option value="Bug Fix">Bug Fixes</option>
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><ChevronDown size={14} /></div>
                </div>
              </div>

              {/* Dates */}
              <div className="flex gap-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">From</label>
                  <div className="relative">
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-purple-500 [color-scheme:light] dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200 dark:[color-scheme:dark]" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">To</label>
                  <div className="relative">
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-purple-500 [color-scheme:light] dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200 dark:[color-scheme:dark]" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* --- CONTENT AREA --- */}
          <section className="min-h-[400px]">
            
            {/* LOADING STATE */}
            {(loading || aiLoading) && (
               <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500 animate-pulse">
                  <Sparkles size={32} className="text-purple-500 animate-bounce" />
                  <p className="text-sm font-medium">Analyzing Release Notes with AI...</p>
               </div>
            )}

            {/* AI SUMMARY DISPLAY (The Default View) */}
            {!loading && !aiLoading && aiSummary && (
              <div className="relative rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-900/40 dark:ring-slate-800">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                   <Sparkles size={100} />
                </div>
                
                {/* We render the AI HTML here directly */}
                <div 
                  className="prose prose-sm md:prose-base dark:prose-invert max-w-none 
                             prose-headings:text-slate-900 dark:prose-headings:text-white prose-headings:font-bold prose-headings:mt-6 prose-headings:mb-3
                             prose-a:text-purple-600 dark:prose-a:text-purple-400 prose-a:no-underline hover:prose-a:underline
                             prose-ul:space-y-2 prose-li:marker:text-slate-300"
                  dangerouslySetInnerHTML={{ __html: aiSummary }} 
                />
              </div>
            )}

            {/* FALLBACK: If AI fails or no data, show raw list */}
            {!loading && !aiLoading && !aiSummary && groupedWeeks.length > 0 && (
               <div className="text-center py-10">
                 <p className="text-slate-500 mb-2">AI Summary not available for this selection.</p>
                 <button onClick={() => setLastSummarizedRange('')} className="text-sm text-purple-500 underline">Try Again</button>
               </div>
            )}

            {!loading && !aiLoading && groupedWeeks.length === 0 && (
               <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl dark:border-slate-800">
                 <p className="text-slate-500">No release notes found for these filters.</p>
               </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
