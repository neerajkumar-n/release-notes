'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Moon,
  Sun,
  List,
  LayoutGrid,
  Loader2,
  Sparkles,
  Clock,
  Rocket,
  ArrowDownCircle,
  Info,
  ChevronDown,
  Hammer,
  Hourglass,
  GitPullRequest,
  CheckCircle2,
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
} from 'date-fns';

import staticCache from './data/summary-cache.json';

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

type ReleaseWeek = {
  id: string; 
  date: string;
  headline: string;
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
  aiSummary?: string;
  isGenerating?: boolean;
  hasFailed?: boolean;
};

export default function Page() {
  // --- STATE ---
  const [allParsedWeeks, setAllParsedWeeks] = useState<ReleaseWeek[]>([]);
  const [visibleWeeksCount, setVisibleWeeksCount] = useState(5); 
  const [groupedWeeks, setGroupedWeeks] = useState<ReleaseGroup[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>(staticCache); 
  
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [viewMode, setViewMode] = useState<'summary' | 'list'>('summary');
  
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  // Filters
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // --- LOGIC: FILTERING ---
  const isContentFiltered = connectorFilter !== 'All' || typeFilter !== 'All';
  const isAnyFiltered = isContentFiltered || fromDate !== '' || toDate !== '';

  // Force List View if specific content filters are active
  useEffect(() => {
    if (isContentFiltered) {
        setViewMode('list');
    }
  }, [isContentFiltered]);

  // --- LOGIC: FETCH DATA ---
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch('/api/release-notes');
        const rawWeeks: ReleaseWeek[] = await res.json();
        setAllParsedWeeks(rawWeeks);
      } catch (e) {
        console.error('Fetch error:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // --- LOGIC: AI GENERATION ---
  const generateSummaryForWeek = useCallback(async (week: ReleaseGroup) => {
    setGeneratingIds(prev => { const n = new Set(prev); n.add(week.id); return n; });
    setFailedIds(prev => { const n = new Set(prev); n.delete(week.id); return n; });

    try {
        // Chunk items
        const CHUNK_SIZE = 35; 
        const chunks = [];
        for (let i = 0; i < week.items.length; i += CHUNK_SIZE) {
            chunks.push(week.items.slice(i, i + CHUNK_SIZE));
        }

        const chunkPromises = chunks.map(chunkItems => 
            fetch('/api/generate-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: chunkItems, weekDate: week.date })
            }).then(r => r.json())
        );

        const results = await Promise.all(chunkPromises);
        const combinedFragments = results.map(r => r.summaryFragment || '').join('');
        const finalHtml = combinedFragments; 

        setSummaries(prev => ({ ...prev, [week.id]: finalHtml }));
        
        // Update Local Storage
        const LOCAL_CACHE_KEY = 'hyperswitch_summary_browser_cache';
        const currentLocal = JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || '{}');
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ ...currentLocal, [week.id]: finalHtml }));

        // Update Server (Optional)
        await fetch('/api/save-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: week.id, summary: finalHtml })
        });

    } catch (e) {
        console.error(`Error summarizing week ${week.id}`, e);
        setFailedIds(prev => { const n = new Set(prev); n.add(week.id); return n; });
    } finally {
        setGeneratingIds(prev => { const n = new Set(prev); n.delete(week.id); return n; });
    }
  }, []);

  // --- LOGIC: GROUPING (Wednesday Cycles) ---
  useEffect(() => {
    if (allParsedWeeks.length === 0) return;

    const getCycleId = (dateStr: string) => {
        const date = parseISO(dateStr);
        const cycle = isWednesday(date) ? date : nextWednesday(date);
        return format(cycle, 'yyyy-MM-dd');
    };

    const allItemsFlat = allParsedWeeks.flatMap(w => w.items);
    
    const groups: Record<string, ReleaseItem[]> = {};
    const versions: Record<string, string> = {};

    allItemsFlat.forEach(item => {
        const cycleId = getCycleId(item.originalDate);
        if (!groups[cycleId]) groups[cycleId] = [];
        groups[cycleId].push(item);
        
        if (item.version && (!versions[cycleId] || item.version > versions[cycleId])) {
            versions[cycleId] = item.version;
        }
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    
    const allGroupsMapped: ReleaseGroup[] = sortedKeys.map(key => {
        const items = groups[key];
        const cycleDateObj = parseISO(key);
        
        const startDate = new Date(cycleDateObj);
        startDate.setDate(cycleDateObj.getDate() - 7);
        const endDate = new Date(cycleDateObj);
        endDate.setDate(cycleDateObj.getDate() - 1);
        
        const isCurrent = isFuture(cycleDateObj) || (format(new Date(), 'yyyy-MM-dd') === key);
        const prodDate = addDays(cycleDateObj, 8);

        const filteredItems = items.filter(item => {
           if (connectorFilter !== 'All' && item.connector !== connectorFilter) return false;
           if (typeFilter !== 'All' && item.type !== typeFilter) return false;
           
           const itemDate = parseISO(item.originalDate);
           if (fromDate && isBefore(itemDate, startOfDay(parseISO(fromDate)))) return false;
           if (toDate && isAfter(itemDate, endOfDay(parseISO(toDate)))) return false;
           return true;
        });

        return {
            id: key,
            date: key,
            headline: `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d')}`,
            releaseVersion: versions[key] || null,
            items: filteredItems,
            isCurrentWeek: isCurrent,
            productionDate: format(prodDate, 'EEE, MMM d'),
            aiSummary: summaries[key],
            isGenerating: generatingIds.has(key),
            hasFailed: failedIds.has(key)
        };
    });

    let visibleGroups = [];
    if (isAnyFiltered) {
        visibleGroups = allGroupsMapped.filter(g => g.items.length > 0);
    } else {
        visibleGroups = allGroupsMapped.slice(0, visibleWeeksCount);
    }

    setGroupedWeeks(visibleGroups);

  }, [allParsedWeeks, visibleWeeksCount, summaries, generatingIds, failedIds, connectorFilter, typeFilter, fromDate, toDate, isAnyFiltered]);

  const hasMore = !isAnyFiltered && visibleWeeksCount < (allParsedWeeks.length + 5);

  const connectors = useMemo(() => {
    const uniqueConnectors = new Set<string>();
    allParsedWeeks.flatMap(w => w.items).forEach(i => {
        if (i.connector) uniqueConnectors.add(i.connector);
    });
    return Array.from(uniqueConnectors).sort();
  }, [allParsedWeeks]);

  // === RENDER ===
  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-[#FDFDFD] text-slate-900 dark:bg-[#0B1120] dark:text-slate-50 font-sans selection:bg-indigo-500/30 transition-colors duration-300">
        
        {/* HEADER */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-[#0B1120]/90 border-b border-slate-200/60 dark:border-slate-800/60 support-backdrop-blur:bg-white/60">
            <div className="mx-auto max-w-5xl px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                        <Rocket size={20} fill="currentColor" className="text-white/90" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                            Hyperswitch <span className="text-slate-400 font-medium">Releases</span>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-lg border border-slate-200 dark:border-slate-700/50">
                        <button
                            onClick={() => !isContentFiltered && setViewMode('summary')}
                            disabled={isContentFiltered}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all 
                            ${viewMode === 'summary' 
                                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-white ring-1 ring-black/5 dark:ring-white/10' 
                                : isContentFiltered 
                                    ? 'text-slate-400 cursor-not-allowed opacity-50' 
                                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <LayoutGrid size={14} /> EXECUTIVE
                        </button>

                        <button
                            onClick={() => setViewMode('list')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all 
                            ${viewMode === 'list' 
                                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-white ring-1 ring-black/5 dark:ring-white/10' 
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                        >
                            <List size={14} /> LIST VIEW
                        </button>
                    </div>

                    <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:text-white transition-all">
                        {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                </div>
            </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 pb-24 pt-10">
          
          {/* FILTERS */}
          <section className="mb-16 p-1 rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800">
             <div className="p-5 grid gap-5 md:grid-cols-[1fr_200px_auto]">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Connector</label>
                  <div className="relative group">
                    <select 
                        value={connectorFilter} 
                        onChange={(e) => setConnectorFilter(e.target.value)} 
                        className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                        <option value="All">All Connectors</option>
                        {connectors.map((c) => (<option key={c} value={c}>{c}</option>))}
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-slate-600 transition-colors"><ChevronDown size={14} /></div>
                  </div>
                </div>
                
                <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Type</label>
                    <div className="relative group">
                      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                        <option value="All">All Types</option>
                        <option value="Feature">Features</option>
                        <option value="Bug Fix">Bug Fixes</option>
                      </select>
                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><ChevronDown size={14} /></div>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">From</label>
                        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:[color-scheme:dark]" />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">To</label>
                        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:[color-scheme:dark]" />
                    </div>
                </div>
             </div>
             {isContentFiltered && (
                 <div className="mx-5 mb-5 mt-0 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg border border-amber-100 dark:border-amber-900/30">
                    <Info size={14} />
                    <span>Executive Summaries disabled when filtering by Connector or Type.</span>
                 </div>
            )}
          </section>

          {/* MAIN TIMELINE */}
          <section className="relative">
            {/* Timeline Line */}
            <div className="absolute left-[19px] top-2 bottom-0 w-px bg-slate-200 dark:bg-slate-800 hidden md:block"></div>

            {loading ? (
                 <div className="flex flex-col items-center justify-center py-20 opacity-50">
                    <Loader2 className="animate-spin mb-3 text-indigo-500" size={32} />
                    <p className="text-sm font-medium">Fetching release history...</p>
                 </div>
            ) : groupedWeeks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-50 text-slate-500">
                    <p>No updates match your filters.</p>
                </div>
            ) : groupedWeeks.map((week, index) => (
                <div key={week.id} className="group relative mb-16 pl-0 md:pl-16">
                    
                    {/* Stepper Dot */}
                    <div className="hidden md:flex absolute left-0 top-1 h-10 w-10 items-center justify-center rounded-full border-[3px] border-slate-50 bg-white dark:border-[#0B1120] dark:bg-slate-900 z-10 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10">
                         {week.isCurrentWeek ? (
                            <div className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse"></div>
                         ) : index === 0 ? (
                            <div className="h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                         ) : (
                            <div className="h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                         )}
                    </div>

                    {/* Headline */}
                    <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-6 gap-2">
                        <div>
                             <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                                    {week.headline}
                                </h2>
                                {week.isCurrentWeek && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-[10px] font-bold uppercase text-amber-600 border border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                                        <Clock size={10} /> In Progress
                                    </span>
                                )}
                             </div>
                             <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                                <span className="font-mono text-xs">{week.date}</span>
                                {week.releaseVersion && (
                                    <>
                                        <span className="text-slate-300">•</span>
                                        <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                                            v{week.releaseVersion}
                                        </span>
                                    </>
                                )}
                             </div>
                        </div>
                        {week.productionDate && !week.isCurrentWeek && (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-900/10 px-3 py-1.5 rounded-full border border-emerald-100/80 dark:border-emerald-800/30">
                                <CheckCircle2 size={12} /> Live {week.productionDate}
                            </span>
                        )}
                    </div>

                    <div className="transition-all duration-300">
                        {viewMode === 'summary' && !isContentFiltered ? (
                            <div className="relative">
                                {week.aiSummary ? (
                                    // RENDER SUMMARY (AI HTML)
                                    <div 
                                      className="w-full"
                                      dangerouslySetInnerHTML={{ __html: week.aiSummary }}
                                    />
                                ) : (
                                    // EMPTY STATE (Fixed Dark Mode)
                                    <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-slate-700/60 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 backdrop-blur-sm">
                                        {week.isCurrentWeek ? (
                                            <>
                                                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-full mb-3">
                                                    <Hourglass className="text-amber-500" size={24} />
                                                </div>
                                                <p className="text-slate-900 dark:text-white font-bold">Active Development Cycle</p>
                                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                                                    Check back next Wednesday for the Executive Summary.
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-full mb-3">
                                                    <Sparkles className="text-indigo-500" size={24} />
                                                </div>
                                                <p className="text-slate-900 dark:text-white font-bold mb-2">Summary Not Generated</p>
                                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
                                                    We are working on this data set. Please circle back later or generate it now.
                                                </p>
                                                <button 
                                                    onClick={() => generateSummaryForWeek(week)}
                                                    disabled={week.isGenerating}
                                                    className="group relative inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white transition-all duration-200 bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-indigo-500/20"
                                                >
                                                    {week.isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                    {week.isGenerating ? 'Analyzing PRs...' : 'Generate with AI'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            // LIST VIEW (Unified Card Style - Fixed Dark Mode)
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 overflow-hidden shadow-sm backdrop-blur-sm">
                                {week.items.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">No items match filters.</div>
                                ) : (
                                    <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                                        {week.items.map((item, idx) => (
                                            <div key={idx} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors flex items-start gap-4 group relative z-10">
                                                <div className={`mt-1 shrink-0`}>
                                                    {item.type === 'Feature' ? (
                                                        <div className="h-6 w-6 rounded-md bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-200 dark:border-emerald-500/20">
                                                            <Sparkles size={12} className="text-emerald-600 dark:text-emerald-400" />
                                                        </div>
                                                    ) : (
                                                        <div className="h-6 w-6 rounded-md bg-rose-100 dark:bg-rose-500/10 flex items-center justify-center border border-rose-200 dark:border-rose-500/20">
                                                            <Hammer size={12} className="text-rose-600 dark:text-rose-400" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {item.connector && (
                                                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                                {item.connector}
                                                            </span>
                                                        )}
                                                        <a href={item.prUrl} target="_blank" className="text-xs font-mono font-medium text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors flex items-center gap-0.5">
                                                            <GitPullRequest size={10} /> #{item.prNumber}
                                                        </a>
                                                    </div>
                                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-snug group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                                        {item.title}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ))}
            
            {hasMore && (
                <div className="flex justify-center mt-8 pb-12 ml-0 md:ml-16">
                    <button onClick={() => setVisibleWeeksCount(prev => prev + 2)} className="px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-semibold text-slate-600 dark:text-slate-300 shadow-sm hover:shadow hover:border-indigo-300 dark:hover:border-indigo-700 transition-all flex items-center gap-2">
                        <ArrowDownCircle size={16} /> Load Previous Weeks
                    </button>
                </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
