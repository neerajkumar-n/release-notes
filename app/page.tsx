'use client';

import { useEffect, useMemo, useState } from 'react';
import { 
  RefreshCw, 
  CalendarDays, 
  FileText, 
  LayoutList, 
  ChevronDown, 
  Moon, 
  Sun,
  Sparkles,
  X
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

type SummaryCategory = 
  | 'Global Connectivity' 
  | 'Security & Governance' 
  | 'Core Platform & Reliability' 
  | 'Merchant Experience';

export default function Page() {
  const [allItems, setAllItems] = useState<ReleaseItem[]>([]);
  const [groupedWeeks, setGroupedWeeks] = useState<ReleaseGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'summary' | 'list'>('summary'); 
  const [isDarkMode, setIsDarkMode] = useState(true);

  // --- AI SUMMARY STATE ---
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Filters
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // --- TEXT POLISHER (Client Side fallback) ---
  function polishText(text: string, type: 'Feature' | 'Bug Fix'): string {
    let polished = text;
    polished = polished.replace(/^feat:\s*/i, '').replace(/^fix:\s*/i, '').replace(/^chore:\s*/i, '').replace(/^refactor:\s*/i, '');
    polished = polished.replace(/([a-z])_([a-z])/g, '$1 $2');
    if (type === 'Bug Fix') {
       if (polished.match(/^fix/i)) polished = polished.replace(/^fix(ed)?\s/i, 'Resolved stability issue with ');
    } else {
       if (polished.match(/^add/i)) polished = polished.replace(/^add(ed)?\s(support for\s)?/i, 'Enabled capabilities for ');
    }
    return polished.charAt(0).toUpperCase() + polished.slice(1);
  }

  // --- CATEGORIZATION LOGIC ---
  function getCategory(item: ReleaseItem): SummaryCategory {
    if (item.connector) return 'Global Connectivity';
    const text = item.title.toLowerCase();
    const securityKeywords = ['auth', 'security', 'compliance', 'gdpr', 'pci', 'token', 'oidc', 'sso'];
    if (securityKeywords.some(k => text.includes(k))) return 'Security & Governance';
    const coreKeywords = ['routing', 'infrastructure', 'latency', 'performance', 'database', 'api', 'rust'];
    if (coreKeywords.some(k => text.includes(k))) return 'Core Platform & Reliability';
    return 'Merchant Experience';
  }

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

  // --- AI GENERATION FUNCTION ---
  async function generateAiSummary() {
    setAiLoading(true);
    setAiSummary(null);

    const visibleItems = groupedWeeks.flatMap(week => week.items);
    
    if (visibleItems.length === 0) {
      alert("No items to summarize!");
      setAiLoading(false);
      return;
    }

    const rangeStr = fromDate && toDate ? `${fromDate} to ${toDate}` : 'recent updates';

    try {
      const res = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: visibleItems, weekRange: rangeStr }),
      });
      
      const data = await res.json();
      if (data.summary) {
        setAiSummary(data.summary);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to generate AI summary.');
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  const connectors = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((item) => { if (item.connector) set.add(item.connector); });
    return Array.from(set).sort();
  }, [allItems]);

  useEffect(() => {
    const filteredItems = allItems.filter((item) => {
      const itemDate = parseISO(item.originalDate);
      if (connectorFilter !== 'All' && item.connector !== connectorFilter) return false;
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;
      if (fromDate && isBefore(itemDate, startOfDay(parseISO(fromDate)))) return false;
      if (toDate && isAfter(itemDate, endOfDay(parseISO(toDate)))) return false;
      return true;
    });

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

  // --- RENDER HELPERS ---
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
                <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    {title}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(byConnector).sort().map(([name, connectorItems]) => (
                        <div key={name} className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm dark:bg-slate-800/40 dark:border-slate-700/50">
                            <span className="block mb-1 font-bold text-slate-800 dark:text-slate-100">{name}</span>
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
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
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
        
        {/* --- AI MODAL --- */}
        {aiSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-8">
              <button onClick={() => setAiSummary(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 transition-colors">
                <X size={24} />
              </button>
              
              <div className="mb-6 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Executive Summary</h2>
                  <p className="text-sm text-slate-500">Generated by AI • Includes PR Sources</p>
                </div>
              </div>
              
              <div 
                className="prose prose-sm md:prose-base dark:prose-invert max-w-none 
                           prose-a:text-sky-600 dark:prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline
                           prose-ul:space-y-2 prose-li:marker:text-slate-300"
                dangerouslySetInnerHTML={{ __html: aiSummary }}
              />
            </div>
          </div>
        )}

        <main className="mx-auto max-w-5xl px-4 pb-16 pt-10">
          
          {/* HEADER */}
          <section className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-gray-200 dark:border-slate-800 pb-8">
              <div>
                  <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-700/10 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20">
                          INTERNAL
                      </span>
                  </div>
                  <h1 className="mb-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      Weekly Release Notes
                  </h1>
                  <p className="max-w-xl text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      {viewMode === 'summary' ? "High-level overview grouped by business domain." : "Comprehensive technical changelog."}
                  </p>
              </div>
              
              <div className="flex flex-col items-end gap-3">
                  <button onClick={() => setIsDarkMode(!isDarkMode)} className="flex items-center gap-2 rounded-full bg-white border border-gray-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-all">
                    {isDarkMode ? <Sun size={14} /> : <Moon size={14} />} {isDarkMode ? 'Light' : 'Dark'}
                  </button>

                  <div className="flex items-center gap-3">
                    {/* AI BUTTON */}
                    <button 
                      onClick={generateAiSummary}
                      disabled={aiLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles size={14} className={aiLoading ? "animate-spin" : ""} />
                      {aiLoading ? "Generating..." : "Generate AI Summary"}
                    </button>

                    <div className="flex bg-white dark:bg-slate-900 p-1 rounded-lg border border-gray-200 dark:border-slate-800 shadow-sm">
                        <button onClick={() => setViewMode('summary')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'summary' ? 'bg-gray-100 text-sky-600 dark:bg-slate-800 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                            <FileText size={14} /> Executive
                        </button>
                        <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-gray-100 text-sky-600 dark:bg-slate-800 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                            <LayoutList size={14} /> Dev List
                        </button>
                    </div>
                  </div>
              </div>
          </section>

          {/* FILTERS */}
          <section className="mb-10">
            <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] p-1">
              {/* Connector Filter */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Filter by Connector</label>
                <div className="relative">
                  <select value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value)} className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                    <option value="All">All Connectors</option>
                    {connectors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><ChevronDown size={14} /></div>
                </div>
              </div>

              {/* Type Filter */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</label>
                <div className="relative">
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                    <option value="All">All Types</option>
                    <option value="Feature">Features</option>
                    <option value="Bug Fix">Bug Fixes</option>
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><ChevronDown size={14} /></div>
                </div>
              </div>

              {/* Date Range */}
              <div className="flex gap-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">From</label>
                  <div className="relative">
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-500 [color-scheme:light] dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200 dark:[color-scheme:dark]" />
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><CalendarDays size={14} /></div>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">To</label>
                  <div className="relative">
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-500 [color-scheme:light] dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200 dark:[color-scheme:dark]" />
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><CalendarDays size={14} /></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* CONTENT */}
          <section className="space-y-12">
            {groupedWeeks.map((week) => {
              const catConnectors = week.items.filter(i => getCategory(i) === 'Global Connectivity');
              const catSecurity = week.items.filter(i => getCategory(i) === 'Security & Governance');
              const catCore = week.items.filter(i => getCategory(i) === 'Core Platform & Reliability');
              const catMerchant = week.items.filter(i => getCategory(i) === 'Merchant Experience');

              return (
                  <div key={week.id} className="relative pl-8 md:pl-0">
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-sky-500/50 via-gray-200 to-transparent md:hidden dark:via-slate-800"></div>
                      <div className="mb-6 flex items-baseline gap-4">
                          <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">{week.headline}</h2>
                          <span className="text-sm font-mono text-slate-500">Cycle ending {week.date}</span>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm hover:border-gray-300 transition-colors dark:border-slate-800 dark:bg-slate-900/20 dark:hover:border-slate-700">
                          {viewMode === 'summary' ? (
                              <div>
                                  {renderSummarySection('Global Connectivity', catConnectors)}
                                  <div className="grid md:grid-cols-2 gap-x-12 gap-y-6">
                                      <div>
                                          {renderSummarySection('Merchant Experience', catMerchant)}
                                          {renderSummarySection('Security & Governance', catSecurity)}
                                      </div>
                                      <div>
                                          {renderSummarySection('Core Platform & Reliability', catCore)}
                                      </div>
                                  </div>
                                  {week.items.length === 0 && <p className="text-slate-500 text-sm italic">No updates in this cycle.</p>}
                              </div>
                          ) : (
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
                                              {item.prNumber && <a href={item.prUrl} target="_blank" className="text-xs text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400">PR #{item.prNumber}</a>}
                                          </div>
                                      </li>
                                  ))}
                              </ul>
                          )}
                      </div>
                  </div>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}
