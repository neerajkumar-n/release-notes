'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Moon,
  Sun,
  List,
  FileText,
  Loader2,
  Sparkles,
  Clock,
  Rocket,
  ArrowDownCircle,
  AlertCircle,
  RefreshCw,
  Info,
  ChevronDown,
  Hammer
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
  const [allParsedWeeks, setAllParsedWeeks] = useState<ReleaseWeek[]>([]);
  const [visibleWeeksCount, setVisibleWeeksCount] = useState(5); 
  const [groupedWeeks, setGroupedWeeks] = useState<ReleaseGroup[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>(staticCache); 
  
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [viewMode, setViewMode] = useState<'summary' | 'list'>('summary');
  
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const isFiltered = connectorFilter !== 'All' || typeFilter !== 'All' || fromDate !== '' || toDate !== '';

  useEffect(() => {
    if (isFiltered) {
        setViewMode('list');
    }
  }, [isFiltered]);

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

  const generateSummaryForWeek = useCallback(async (week: ReleaseGroup) => {
    setGeneratingIds(prev => { const n = new Set(prev); n.add(week.id); return n; });
    setFailedIds(prev => { const n = new Set(prev); n.delete(week.id); return n; });

    try {
        const CHUNK_SIZE = 10;
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
        
        const finalHtml = `
          <div class="space-y-4">
            <div class="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
              <ul class="space-y-3 pl-2 list-none">
                ${combinedFragments}
              </ul>
            </div>
          </div>
        `;

        setSummaries(prev => ({ ...prev, [week.id]: finalHtml }));
        
        const LOCAL_CACHE_KEY = 'hyperswitch_summary_browser_cache';
        const currentLocal = JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || '{}');
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ ...currentLocal, [week.id]: finalHtml }));

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

  // --- REVISED GROUPING LOGIC ---
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

    // 1. Sort ALL keys first
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    
    // 2. Map ALL groups to objects (applying filters immediately)
    const allGroupsMapped: ReleaseGroup[] = sortedKeys.map(key => {
        const items = groups[key];
        const cycleDateObj = parseISO(key);
        
        const startDate = new Date(cycleDateObj);
        startDate.setDate(cycleDateObj.getDate() - 7);
        const endDate = new Date(cycleDateObj);
        endDate.setDate(cycleDateObj.getDate() - 1);
        
        const isCurrent = isFuture(cycleDateObj) || (format(new Date(), 'yyyy-MM-dd') === key);
        const prodDate = addDays(cycleDateObj, 8);

        // Filter Items
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

    // 3. Filter Groups based on content
    // If filtering is active, we only want weeks that actually have items.
    // If no filter, we keep everything (so pagination works normally).
    let visibleGroups = allGroupsMapped;
    
    if (isFiltered) {
        // If filtered, show EVERYTHING that matches, ignore pagination count
        visibleGroups = allGroupsMapped.filter(g => g.items.length > 0);
    } else {
        // If not filtered, strictly obey pagination
        visibleGroups = allGroupsMapped.slice(0, visibleWeeksCount);
    }

    setGroupedWeeks(visibleGroups);

  }, [allParsedWeeks, visibleWeeksCount, summaries, generatingIds, failedIds, connectorFilter, typeFilter, fromDate, toDate, isFiltered]);

  // Adjust "Load More" logic: hide it if we are filtering (since we show all matches)
  const hasMore = !isFiltered && visibleWeeksCount < (allParsedWeeks.length + 5);

  const connectors = useMemo(() => {
    const uniqueConnectors = new Set<string>();
    allParsedWeeks.flatMap(w => w.items).forEach(i => {
        if (i.connector) uniqueConnectors.add(i.connector);
    });
    return Array.from(uniqueConnectors).sort();
  }, [allParsedWeeks]);

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 font-sans selection:bg-sky-500/30 transition-colors duration-300">
        <main className="mx-auto max-w-5xl px-4 pb-20 pt-12">
          
          <section className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-gray-200 dark:border-slate-800 pb-8">
              <div>
                  <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-3">
                      Hyperswitch Release Notes
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                      Weekly updates tracked from GitHub Changelog.
                  </p>
              </div>

              <div className="flex items-center gap-4">
                  <div className="flex bg-gray-200 dark:bg-slate-900 p-1 rounded-lg border border-gray-300 dark:border-slate-700">
                      <button
                          onClick={() => !isFiltered && setViewMode('summary')}
                          disabled={isFiltered}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all 
                            ${viewMode === 'summary' 
                                ? 'bg-white text-sky-700 shadow-sm dark:bg-sky-600 dark:text-white' 
                                : isFiltered 
                                    ? 'text-slate-400 cursor-not-allowed opacity-50' 
                                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
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

          {/* FILTERS */}
          <section className="mb-10 p-5 rounded-2xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/50 shadow-sm">
            <div className="grid gap-5 md:grid-cols-[1fr_200px_auto]">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">FILTER BY CONNECTOR</label>
                <div className="relative">
                  <select value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value)} className="w-full appearance-none rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-base text-slate-700 focus:border-sky-500 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <option value="All">All Connectors</option>
                    {connectors.map((c) => (<option key={c} value={c}>{c}</option>))}
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
            {isFiltered && (
                 <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg border border-amber-200 dark:border-amber-900/30">
                    <Info size={14} />
                    <span>Showing matching results from full history. Executive summary disabled.</span>
                 </div>
            )}
          </section>

          <section className="min-h-[400px]">
            {loading ? (
                 <div className="flex flex-col items-center justify-center py-20 opacity-50">
                    <Loader2 className="animate-spin mb-3" size={32} />
                    <p>Fetching release history...</p>
                 </div>
            ) : groupedWeeks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-50 text-slate-500">
                    <p>No updates match your filters.</p>
                </div>
            ) : groupedWeeks.map((week) => (
                <div key={week.id} className="mb-16 relative pl-8 md:pl-0">
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
                        {viewMode === 'summary' && !isFiltered ? (
                            <>
                                {week.aiSummary ? (
                                    <div 
                                      className="prose prose-slate dark:prose-invert max-w-none"
                                      dangerouslySetInnerHTML={{ __html: week.aiSummary }}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/20">
                                        <Hammer className="text-slate-400 mb-3" size={32} />
                                        <p className="text-slate-700 dark:text-slate-300 font-medium mb-1">
                                            Executive summary coming soon
                                        </p>
                                        <p className="text-xs text-slate-500 mb-6 max-w-sm">
                                            We are working on this data set. Please circle back after a few weeks for the summary, or view the released PRs in the List view.
                                        </p>
                                        
                                        <button 
                                            onClick={() => generateSummaryForWeek(week)}
                                            disabled={week.isGenerating}
                                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-sky-600 hover:border-sky-300 transition-all disabled:opacity-50"
                                        >
                                            {week.isGenerating ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Sparkles size={12} />
                                            )}
                                            {week.isGenerating ? 'Generating...' : 'Generate Summary'}
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <ul className="space-y-5">
                            {week.items.length === 0 ? <li className="text-slate-500 text-sm">No items match your filters.</li> : 
                                week.items.map((item, idx) => (
                                    <li key={idx} className="border-b border-gray-100 dark:border-slate-800 pb-4 last:border-0">
                                        <div className="flex items-start gap-3">
                                            <span className={`mt-0.5 inline-flex h-fit w-fit items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.type === 'Feature' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                                                {item.type === 'Feature' ? 'FEAT' : 'FIX'}
                                            </span>
                                            <div className="flex-1">
                                            <p className="font-medium text-slate-800 dark:text-slate-200">
                                                {item.connector && <span className="font-bold text-slate-900 dark:text-slate-100 mr-1">{item.connector}:</span>}
                                                {item.title}
                                            </p>
                                            <a href={item.prUrl} target="_blank" className="text-xs text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 mt-1 inline-block">
                                                #{item.prNumber}
                                            </a>
                                            </div>
                                        </div>
                                    </li>
                                ))
                            }
                            </ul>
                        )}
                    </div>
                </div>
            ))}
            
            {hasMore && (
                <div className="flex justify-center mt-8 mb-12">
                    <button onClick={() => setVisibleWeeksCount(prev => prev + 2)} className="group flex flex-col items-center gap-2 text-slate-500 hover:text-sky-600 transition-colors">
                        <span className="text-sm font-semibold tracking-widest uppercase">Load Previous Weeks</span>
                        <ArrowDownCircle size={32} className="group-hover:translate-y-1 transition-transform" />
                    </button>
                </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
