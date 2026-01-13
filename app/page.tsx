'use client';

import { useEffect, useMemo, useState } from 'react';
import { 
  RefreshCw, 
  ChevronDown, 
  Moon, 
  Sun,
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

  // VIEW STATE: 'summary' = Executive View (Regex Polished), 'list' = Dev View
  const [viewMode, setViewMode] = useState<'summary' | 'list'>('summary');

  // FILTERS
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // --- SMART TEXT POLISHER (No AI needed) ---
  // Converts "feat: add_stuff" -> "Enabled capabilities for..."
  function polishText(text: string, type: 'Feature' | 'Bug Fix'): string {
    let polished = text;
    // Remove dev prefixes
    polished = polished.replace(/^(feat|fix|chore|refactor|docs)(\([^\)]+\))?:\s*/i, '');
    // Snake case to normal
    polished = polished.replace(/([a-z])_([a-z])/g, '$1 $2');
    
    // Make verbs professional
    if (type === 'Bug Fix') {
       if (polished.match(/^fix(ed)?/i)) polished = polished.replace(/^fix(ed)?\s/i, 'Resolved stability issue with ');
       if (polished.match(/^correct(ed)?/i)) polished = polished.replace(/^correct(ed)?\s/i, 'Rectified data discrepancy in ');
    } else {
       if (polished.match(/^add(ed)?/i)) polished = polished.replace(/^add(ed)?\s(support for\s)?/i, 'Enabled capabilities for ');
       if (polished.match(/^implement(ed)?/i)) polished = polished.replace(/^implement(ed)?\s/i, 'Launched new ');
       if (polished.match(/^update(ed)?/i)) polished = polished.replace(/^update(ed)?\s/i, 'Enhanced ');
    }
    return polished.charAt(0).toUpperCase() + polished.slice(1);
  }

  // --- CATEGORIZATION LOGIC ---
  function getCategory(item: ReleaseItem): SummaryCategory {
    if (item.connector) return 'Global Connectivity';
    
    const text = item.title.toLowerCase();
    const securityKeywords = ['auth', 'security', 'compliance', 'gdpr', 'pci', 'token', 'vault', 'permission', 'role', 'oidc', 'sso'];
    if (securityKeywords.some(k => text.includes(k))) return 'Security & Governance';
    
    const coreKeywords = ['routing', 'infrastructure', 'latency', 'performance', 'database', 'optimization', 'api', 'webhook', 'monitoring', 'rust', 'aws', 'db'];
    if (coreKeywords.some(k => text.includes(k))) return 'Core Platform & Reliability';
    
    return 'Merchant Experience';
  }

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

  useEffect(() => { fetchData(); }, []);

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

  // --- RENDER HELPER: SUMMARY SECTION ---
  const renderSummarySection = (title: string, items: ReleaseItem[]) => {
    if (items.length === 0) return null;
    
    // Group Connectors specifically
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
                        <div key={name} className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm dark:bg-slate-800/40 dark:border-slate-700/50">
                            <span className="block mb-2 font-bold text-slate-800 dark:text-slate-100">{name}</span>
                            <ul className="list-disc list-inside space-y-1">
                                {connectorItems.map((c, i) => (
                                    <li key={i} className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
                                        {polishText(c.title, c.type)}
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
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400 border-b border-sky-500/20 pb-1 w-fit">
            {title}
        </h3>
        <ul className="space-y-3">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed group">
              <span className="text-slate-400 dark:text-slate-500 mt-1">•</span>
              <span>
                <span className="text-slate-800 dark:text-slate-200">{polishText(item.title, item.type)}</span>
                {item.prNumber && (
                  <a href={item.prUrl} target="_blank" className="ml-2 text-[10px] text-slate-400 dark:text-slate-500 opacity-50 group-hover:opacity-100 hover:text-sky-600 dark:hover:text-sky-400 transition-all">
                      [#{item.prNumber}]
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 font-sans selection:bg-sky-500/30 transition-colors duration-300">
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
          
          {/* HEADER */}
          <section className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-gray-200 dark:border-slate-800 pb-6">
              <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
                      Hyperswitch Release Notes
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                      Weekly updates tracked from GitHub Changelog.
                  </p>
              </div>
              
              <div className="flex items-center gap-4">
                  <div className="flex bg-gray-200 dark:bg-slate-900 p-1 rounded-lg border border-gray-300 dark:border-slate-700">
                      <button 
                          onClick={() => setViewMode('summary')}
                          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'summary' ? 'bg-white text-sky-700 shadow-sm dark:bg-sky-600 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                      >
                          <FileText size={14} /> EXECUTIVE
                      </button>
                      <button 
                          onClick={() => setViewMode('list')}
                          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white text-sky-700 shadow-sm dark:bg-sky-600 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                      >
                          <List size={14} /> LIST VIEW
                      </button>
                  </div>

                  <div className="h-6 w-px bg-gray-300 dark:bg-slate-800 mx-1"></div>

                  <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full border border-gray-300 bg-white text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white transition-all">
                    {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                  </button>
              </div>
          </section>

          {/* FILTERS */}
          <section className="mb-8 p-4 rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/50">
            <div className="grid gap-4 md:grid-cols-[1fr_200px_auto]">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">FILTER BY CONNECTOR</label>
                <div className="relative">
                  <select value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value)} className="w-full appearance-none rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-slate-700 focus:border-sky-500 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <option value="All">All Connectors</option>
                    {connectors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"><ChevronDown size={16} /></div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">TYPE</label>
                <div className="relative">
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="w-full appearance-none rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-slate-700 focus:border-sky-500 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
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
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-500 [color-scheme:light] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:[color-scheme:dark]" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">TO</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-500 [color-scheme:light] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:[color-scheme:dark]" />
                </div>
              </div>
            </div>
          </section>

          {/* --- CONTENT AREA --- */}
          <section className="min-h-[400px]">
            {groupedWeeks.length === 0 && !loading && (
               <div className="text-center py-20 border border-dashed border-gray-300 rounded-2xl dark:border-slate-800 opacity-60">
                 <p className="text-slate-500">No release notes found for these filters.</p>
               </div>
            )}

            {groupedWeeks.map((week) => (
               <div key={week.id} className="mb-10 relative pl-8 md:pl-0">
                  {/* Timeline line */}
                  <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-sky-500/50 via-gray-300 to-transparent md:hidden dark:via-slate-800"></div>

                  <div className="mb-6 flex items-baseline gap-4">
                     <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{week.headline}</h2>
                     <span className="text-sm font-mono text-slate-500">{week.date}</span>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
                     
                     {/* RENDER VIEW 1: EXECUTIVE SUMMARY (Regex Polished) */}
                     {viewMode === 'summary' && (
                        <div>
                           {renderSummarySection('Global Connectivity', week.items.filter(i => getCategory(i) === 'Global Connectivity'))}
                           <div className="grid md:grid-cols-2 gap-x-12 gap-y-6">
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

                     {/* RENDER VIEW 2: LIST VIEW (Raw Data) */}
                     {viewMode === 'list' && (
                        <ul className="space-y-4">
                           {week.items.map((item, idx) => (
                              <li key={idx} className="flex flex-col gap-1 md:flex-row md:items-start md:gap-3 text-sm">
                                 <span className={`mt-0.5 inline-flex h-fit w-fit items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.type === 'Feature' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                                    {item.type === 'Feature' ? 'FEAT' : 'FIX'}
                                 </span>
                                 <div className="flex-1">
                                    <p className="text-slate-700 dark:text-slate-300">
                                       {item.connector && <strong className="text-slate-900 dark:text-slate-100 mr-1">{item.connector}:</strong>}
                                       {item.title}
                                    </p>
                                    {item.prNumber && <a href={item.prUrl} target="_blank" className="text-xs text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400">#{item.prNumber}</a>}
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
