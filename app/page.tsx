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
  ChevronDown
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

type Classification = {
  prNumber: string;
  // Updated keys to match new logic
  category: 'connectivity' | 'experience' | 'core';
  subGroup: string;
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

// --- COMPONENTS ---

const CategoryBlock = ({ 
  title, 
  items, 
  onSummarize 
}: { 
  title: string, 
  items: ReleaseItem[], 
  onSummarize: (items: ReleaseItem[], title: string) => Promise<string> 
}) => {
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!summary && items.length > 0) {
      onSummarize(items, title).then(res => {
        if (mounted) setSummary(res);
      });
    }
    return () => { mounted = false; };
  }, [items, title, onSummarize]);

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
            <strong className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</strong>
            {summary ? (
            <span className="text-sm text-slate-600 dark:text-slate-400 leading-snug">{summary}</span>
            ) : (
            <span className="inline-flex gap-2 items-center text-xs text-sky-500 animate-pulse">
                <Sparkles size={10} /> Analyzing...
            </span>
            )}
        </div>
        
        {/* Tiny PR pills for transparency */}
        <div className="flex flex-wrap gap-1.5 mt-1">
            {items.map(i => (
            <a key={i.prNumber} href={i.prUrl} target="_blank" className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 rounded hover:bg-sky-50 dark:hover:bg-sky-900 hover:text-sky-600 transition-colors">
                #{i.prNumber}
            </a>
            ))}
        </div>
      </div>
    </div>
  );
};

export default function Page() {
  const [allParsedWeeks, setAllParsedWeeks] = useState<ReleaseGroup[]>([]);
  const [visibleWeeksCount, setVisibleWeeksCount] = useState(2); 
  const [classifications, setClassifications] = useState<Record<string, Classification>>({});
  
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [viewMode, setViewMode] = useState<'summary' | 'list'>('summary');

  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // --- 1. FETCH & INITIAL GROUPING ---
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch('/api/release-notes');
        const rawWeeks: {items: ReleaseItem[]}[] = await res.json();
        
        const allItems = rawWeeks.flatMap(w => w.items);
        const groups = new Map<string, ReleaseItem[]>();
        const versionMap = new Map<string, string>();

        const getCycleId = (dateStr: string) => {
            const date = parseISO(dateStr);
            const cycle = isWednesday(date) ? date : nextWednesday(date);
            return format(cycle, 'yyyy-MM-dd');
        };

        allItems.forEach(item => {
            const cycleId = getCycleId(item.originalDate);
            if (!groups.has(cycleId)) groups.set(cycleId, []);
            groups.get(cycleId)?.push(item);
            if (item.version && (!versionMap.has(cycleId) || item.version > versionMap.get(cycleId)!)) {
                versionMap.set(cycleId, item.version);
            }
        });

        const sortedKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
        
        const masterWeeks = sortedKeys.map(key => {
            const cycleDateObj = parseISO(key);
            const prevThurs = new Date(cycleDateObj);
            prevThurs.setDate(cycleDateObj.getDate() - 6);
            const prodDate = addDays(cycleDateObj, 8);

            return {
                id: key,
                date: key,
                headline: `${format(prevThurs, 'MMM d')} – ${format(cycleDateObj, 'MMM d')}`,
                releaseVersion: versionMap.get(key) || null,
                items: groups.get(key) || [],
                isCurrentWeek: isFuture(cycleDateObj) || format(new Date(), 'yyyy-MM-dd') === key,
                productionDate: format(prodDate, 'EEE, MMM d'),
            };
        });

        setAllParsedWeeks(masterWeeks);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // --- 2. ORCHESTRATOR: CLASSIFY VISIBLE ITEMS ---
  useEffect(() => {
    const visibleWeeks = allParsedWeeks.slice(0, visibleWeeksCount);
    const unclassifiedItems = visibleWeeks.flatMap(w => w.items).filter(i => !classifications[i.prNumber || '']);

    if (unclassifiedItems.length === 0) return;

    const classifyBatch = async () => {
        const chunk = unclassifiedItems.slice(0, 50); 
        try {
            const res = await fetch('/api/categorize-items', {
                method: 'POST',
                body: JSON.stringify({ items: chunk })
            });
            const data = await res.json();
            
            if (data.classifications) {
                setClassifications(prev => {
                    const next = { ...prev };
                    data.classifications.forEach((c: Classification) => {
                        next[c.prNumber] = c;
                    });
                    return next;
                });
            }
        } catch (e) {
            console.error('Classification failed', e);
        }
    };

    const timer = setTimeout(classifyBatch, 500);
    return () => clearTimeout(timer);

  }, [allParsedWeeks, visibleWeeksCount, classifications]);


  // --- 3. HELPER: SUMMARIZE A GROUP ---
  const fetchGroupSummary = useCallback(async (items: ReleaseItem[], subGroup: string) => {
     try {
        const res = await fetch('/api/summarize-category', {
            method: 'POST',
            body: JSON.stringify({ items, subGroup, category: 'mixed' })
        });
        const data = await res.json();
        return data.summary;
     } catch (e) {
        return "Updates included.";
     }
  }, []);


  // --- RENDER LOGIC ---
  const renderWeekSummary = (week: ReleaseGroup) => {
    const groups: Record<string, Record<string, ReleaseItem[]>> = {
        connectivity: {}, experience: {}, core: {}, unclassified: {}
    };

    week.items.forEach(item => {
        const cls = classifications[item.prNumber || ''];
        const cat = cls?.category || 'unclassified';
        const sub = cls?.subGroup || 'General';
        
        if (!groups[cat]) groups[cat] = {}; 
        if (!groups[cat][sub]) groups[cat][sub] = [];
        groups[cat][sub].push(item);
    });

    const hasContent = (cat: string) => Object.keys(groups[cat]).length > 0;

    return (
        <div className="space-y-10">
            
            {/* LOADER FOR CLASSIFICATION */}
            {hasContent('unclassified') && (
                <div className="p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg opacity-60">
                    <p className="text-sm text-center flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin" size={14} /> 
                        Categorizing {week.items.filter(i => !classifications[i.prNumber||'']).length} updates...
                    </p>
                </div>
            )}

            {/* 1. CONNECTIVITY (Green) */}
            {hasContent('connectivity') && (
                <div>
                    <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20 pb-3 mb-5">
                        Global Connectivity
                    </h4>
                    <div className="space-y-6">
                        {Object.keys(groups.connectivity).sort().map(sub => (
                            <CategoryBlock key={sub} title={sub} items={groups.connectivity[sub]} onSummarize={fetchGroupSummary} />
                        ))}
                    </div>
                </div>
            )}

            {/* 2. EXPERIENCE (Purple) */}
            {hasContent('experience') && (
                <div>
                    <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-purple-600 dark:text-purple-400 border-b border-purple-500/20 pb-3 mb-5">
                        Merchant Experience & Operations
                    </h4>
                    <div className="space-y-6">
                        {Object.keys(groups.experience).sort().map(sub => (
                            <CategoryBlock key={sub} title={sub} items={groups.experience[sub]} onSummarize={fetchGroupSummary} />
                        ))}
                    </div>
                </div>
            )}

            {/* 3. CORE (Blue) */}
            {hasContent('core') && (
                <div>
                    <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400 border-b border-sky-500/20 pb-3 mb-5">
                        Platform Core & Components
                    </h4>
                    <div className="space-y-6">
                        {Object.keys(groups.core).sort().map(sub => (
                            <CategoryBlock key={sub} title={sub} items={groups.core[sub]} onSummarize={fetchGroupSummary} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
  };

  const hasMore = visibleWeeksCount < allParsedWeeks.length;

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
                      <button onClick={() => setViewMode('summary')} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'summary' ? 'bg-white text-sky-700 shadow-sm dark:bg-sky-600 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
                          <FileText size={16} /> EXECUTIVE
                      </button>
                      <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-white text-sky-700 shadow-sm dark:bg-sky-600 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
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
                    {Array.from(new Set(allParsedWeeks.flatMap(w => w.items).map(i => i.connector).filter(Boolean))).sort().map((c) => (
                        <option key={c as string} value={c as string}>{c}</option>
                    ))}
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

          {/* CONTENT */}
          <section className="min-h-[400px]">
            {loading ? (
                 <div className="flex flex-col items-center justify-center py-20 opacity-50">
                    <Loader2 className="animate-spin mb-3" size={32} />
                    <p>Fetching release history...</p>
                 </div>
            ) : allParsedWeeks.slice(0, visibleWeeksCount).map((week) => (
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
                        {viewMode === 'summary' ? renderWeekSummary(week) : (
                            <ul className="space-y-5">
                            {week.items.length === 0 ? <li className="text-slate-500 text-sm">No items.</li> : 
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
