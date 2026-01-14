'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ChevronDown,
  Moon,
  Sun,
  List,
  FileText,
  Loader2,
  Sparkles,
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
  isSameDay
} from 'date-fns';

type ReleaseItem = {
  title: string;
  type: 'Feature' | 'Bug Fix';
  connector: string | null;
  prNumber?: string;
  prUrl?: string;
  originalDate: string;
  enhancedTitle?: string;
  description?: string;
  businessImpact?: string;
  version: string | null;
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

type SummaryCategory =
  | 'Global Connectivity'
  | 'Security & Governance'
  | 'Core Platform & Reliability'
  | 'Merchant Experience';

export default function Page() {
  const [allItems, setAllItems] = useState<ReleaseItem[]>([]);
  const [groupedWeeks, setGroupedWeeks] = useState<ReleaseGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // VIEW STATE
  const [viewMode, setViewMode] = useState<'summary' | 'list'>('summary');

  // Enhancement state
  const [enhancing, setEnhancing] = useState(false);
  const [enhancedCount, setEnhancedCount] = useState(0);
  const [totalToEnhance, setTotalToEnhance] = useState(0);

  // FILTERS
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // --- CATEGORIZATION LOGIC ---
  function getCategory(item: ReleaseItem): SummaryCategory {
    if (item.connector) return 'Global Connectivity';

    const text = (item.enhancedTitle || item.title).toLowerCase();
    const securityKeywords = ['auth', 'security', 'compliance', 'gdpr', 'pci', 'token', 'vault', 'permission', 'role', 'oidc', 'sso'];
    if (securityKeywords.some(k => text.includes(k))) return 'Security & Governance';

    const coreKeywords = ['routing', 'infrastructure', 'latency', 'performance', 'database', 'optimization', 'api', 'webhook', 'monitoring', 'rust', 'aws', 'db'];
    if (coreKeywords.some(k => text.includes(k))) return 'Core Platform & Reliability';

    return 'Merchant Experience';
  }

  // --- FETCH DATA ---
  async function fetchData() {
    console.log('Fetching data...');
    setLoading(true);
    try {
      constCc = await fetch('/api/release-notes');
      const weeksData = await res.json();
      const flatItems: ReleaseItem[] = [];
      weeksData.forEach((week: any) => {
        week.items.forEach((item: ReleaseItem) => flatItems.push(item));
      });
      setAllItems(flatItems);
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  // --- BACKGROUND ENHANCEMENT WITH LOCALSTORAGE CACHE ---
  const enhanceInBackground = useCallback(async () => {
    const CACHE_KEY = 'hyperswitch_enhanced_cache_v1';
    
    // 1. Load Cache
    let cachedData: Record<string, any> = {};
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) cachedData = JSON.parse(stored);
    } catch (e) { console.error('Cache read error', e); }

    // 2. Identify items that need enhancement
    // If they are in cache, update them immediately locally
    // If not, mark them for fetching
    const itemsToFetch: ReleaseItem[] = [];
    let stateUpdatedFromCache = false;

    // We create a copy to mutate safely if needed (though we rely on setAllItems)
    const currentItemsWithCache = allItems.map(item => {
        const key = `${item.title}-${item.prNumber}`;
        if (cachedData[key]) {
            // Apply cache
            if (!item.enhancedTitle) {
                stateUpdatedFromCache = true;
                return {
                    ...item,
                    enhancedTitle: cachedData[key].enhancedTitle,
                    description: cachedData[key].description,
                    businessImpact: cachedData[key].businessImpact
                };
            }
        } else if (!item.enhancedTitle) {
            // Needs fetching
            itemsToFetch.push(item);
        }
        return item;
    });

    // If we applied cache, update state immediately
    if (stateUpdatedFromCache) {
        setAllItems(currentItemsWithCache);
    }

    if (itemsToFetch.length === 0) return;

    // 3. Process remaining items
    setEnhancing(true);
    setTotalToEnhance(itemsToFetch.length);
    setEnhancedCount(0);

    const batchSize = 5;
    let processed = 0;

    for (let i = 0; i < itemsToFetch.length; i += batchSize) {
      const batch = itemsToFetch.slice(i, i + batchSize);
      try {
        const res = await fetch('/api/enhance-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: batch })
        });
        const data = await res.json();

        if (data.items) {
          // Update State AND LocalStorage
          setAllItems(prev => {
            const updated = [...prev];
            data.items.forEach((enhanced: ReleaseItem) => {
              const idx = updated.findIndex(item => item.title === enhanced.title && item.prNumber === enhanced.prNumber);
              if (idx >= 0) {
                updated[idx] = enhanced;
                
                // Write to cache object
                const key = `${enhanced.title}-${enhanced.prNumber}`;
                cachedData[key] = {
                    enhancedTitle: enhanced.enhancedTitle,
                    description: enhanced.description,
                    businessImpact: enhanced.businessImpact
                };
              }
            });
            return updated;
          });
          
          // Save to LocalStorage
          localStorage.setItem(CACHE_KEY, JSON.stringify(cachedData));
        }
      } catch (e) {
        console.error('Batch enhancement error:', e);
      }

      processed += batch.length;
      setEnhancedCount(processed);
    }

    setEnhancing(false);
  }, [allItems]);

  // Auto-start enhancement when data loads
  useEffect(() => {
    if (allItems.length > 0 && !enhancing) {
      const timer = setTimeout(() => {
        enhanceInBackground();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [allItems.length, enhancing, enhanceInBackground]);

  // --- DERIVED DATA ---
  const connectors = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((item) => { if (item.connector) set.add(item.connector); });
    return Array.from(set).sort();
  }, [allItems]);

  // --- FILTER & GROUP ---
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

    // 2. Group by Wednesday
    const groups: Record<string, {items: ReleaseItem[], version: string | null}> = {};
    
    filteredItems.forEach((item) => {
      constQb = parseISO(item.originalDate);
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

  // --- RENDER HELPER ---
  const renderSummarySection = (title: string, items: ReleaseItem[]) => {
    if (items.length === 0) return null;

    if (title === 'Global Connectivity') {
      const byConnector: Record<string, ReleaseItem[]> = {};
      items.forEach(item => {
        const name = item.connector || 'Other';
        if (!byConnector[name]) byConnector[name] = [];
        byConnector[name].push(item);
      });

      return (
        <div className="mb-6">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20 pb-1 w-fit">
            {title}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(byConnector).sort().map(([name, connectorItems]) => (
              <div key={name} className="rounded-lg bg-white border border-slate-200 p-4 shadow-sm dark:bg-slate-800/40 dark:border-slate-700/50">
                <span className="block mb-3 font-bold text-slate-800 dark:text-slate-100">{name}</span>
                <ul className="space-y-3">
                  {connectorItems.map((c, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-semibold text-slate-700 dark:text-slate-200WX block mb-1">
                        {c.enhancedTitle || c.title}
                      </span>
                      {c.description && (
                        <span className="text-slate-600 dark:text-slate-400 block mb-1">
                          {c.description}
                        </span>
                      )}
                      {c.businessImpact && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 italic block">
                          {c.businessImpact}
                        </span>
                      )}
                      {c.prNumber && <a href={c.prUrl} target="_blank" className="ml-1 text-[10px] text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 no-underline">↗</a>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="mb-6">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400 border-b border-sky-500/20 pb-1 w-fit">
          {title}
        </h3>
        <ul className="space-y-4">
          {items.map((item, idx) => (
            <li key={idx} className="flex flex-col gap-1.5 text-sm group">
              <div className="flex items-start gap-3">
                <span className="text-slate-400 dark:text-slate-500 mt-1">•</span>
                <div className="flex-1">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                    {item.enhancedTitle || item.title}
                  </span>
                  {item.description && (
                    <span className="text-slate-600 dark:text-slate-400 block mt-1">
                      {item.description}
                    </span>
                  )}
                  {item.businessImpact && (
                    <span className="text-xs text-sky-600 dark:text-sky-400 italic block mt-1">
                      {item.businessImpact}
                    </span>
                  )}
                  {item.prNumber && (
                    <a href={item.prUrl} target="_blank" className="ml-2 text-[10px] text-slate-400 dark:text-slate-500 opacity-50 group-hover:opacity-100 hover:text-sky-600 dark:hover:text-sky-400 transition-all">
                      [#{item.prNumber}]
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

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
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Weekly updates tracked from GitHub Changelog.
                    </p>
                    {enhancing && (
                      <div className="flex items-center gap-2 text-xs text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 px-2 py-1 rounded-full">
                        <Sparkles size={12} className="animate-spin" />
                        <span>Enhancing {enhancedCount}/{totalToEnhance}...</span>
                      </div>
                    )}
                  </div>
              </div>

              <div className="flex items-center gap-4">
                  <div className="flex bg-gray-200 dark:bg-slate-900 p-1 rounded-lg border border-gray-300 dark:border-slate-700">
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

          {/* FILTERS */}
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
            {groupedWeeks.length === 0 && !loading && (
               <div className="text-center py-20 border border-dashed border-gray-300 rounded-2xl dark:border-slate-800 opacity-60">
                 <p className="text-lg text-slate-500">No release notes found for these filters.</p>
               </div>
            )}

            {groupedWeeks.map((week) => (
               <div key={week.id} className="mb-12 relative pl-8 md:pl-0">
                 {/* Timeline line */}
                 <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-sky-500/50 via-gray-300 to-transparent md:hidden dark:via-slate-800"></div>

                 {/* WEEK HEADER */}
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
                     
                     {/* EXECUTIVE VIEW */}
                     {viewMode === 'summary' && (
                        <div>
                           {renderSummarySection('Global Connectivity', week.items.filter(i => getCategory(i) === 'Global Connectivity'))}
                           <div className="grid md:grid-cols-2 gap-x-16 gap-y-8">
                             <div>
                                 {renderSummarySection('Merchant Experience', week.items.filter(i => getCategory(i) === 'Merchant Experience'))}
                                 {renderSummarySection('Security & Governance', week.items.filter(i => getCategory(i) === 'Security & Governance'))}
                             </div>
                             <div>
                                 {renderSummarySection('Core Platform & Reliability', week.items.filter(i => getCategory(i) === 'Core Platform & Reliability'))}
                             </div>
                           </div>
                        </div>
                     )}

                     {/* LIST VIEW */}
                     {viewMode === 'list' && (
                        <ul className="space-y-5">
                           {week.items.map((item, idx) => (
                              <li key={idx} className="border-b border-gray-100 dark:border-slate-800 pb-4 last:border-0">
                                 <div className="flex items-start gap-3">
                                    <span className={`mt-0.5 inline-flex h-fit w-fit items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.type === 'Feature' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                                        {item.type === 'Feature' ? 'FEAT' : 'FIX'}
                                    </span>
                                    <div className="flex-1">
                                       <p className="font-medium text-slate-800 dark:text-slate-200">
                                          {item.connector && <span className="font-bold text-slate-900 dark:text-slate-100 mr-1">{item.connector}:</span>}
                                          {item.enhancedTitle || item.title}
                                       </p>
                                       {item.description && (
                                          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                                             {item.description}
                                          </p>
                                       )}
                                       {item.businessImpact && (
                                          <p className="text-xs text-sky-600 dark:text-sky-400 italic mt-1">
                                             {item.businessImpact}
                                          </p>
                                       )}
                                       {item.prNumber && (
                                          <a href={item.prUrl} target="_blank" className="text-xs text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400 mt-1 inline-block">
                                             #{item.prNumber}
                                          </a>
                                       )}
                                    </div>
                                 </div>
                              </li>
                           ))}
                        </ul>
                     )}
                 </div>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}
