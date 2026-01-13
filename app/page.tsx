'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, CalendarDays, FileText, LayoutList } from 'lucide-react';
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

// Refined Categories for C-Level View
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

  // Filters
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // --- 1. SMART TEXT POLISHER (The "Business Friendly" Logic) ---
  function polishText(text: string, type: 'Feature' | 'Bug Fix'): string {
    let polished = text;

    // A. Remove technical noise
    polished = polished.replace(/^feat:\s*/i, '')
                       .replace(/^fix:\s*/i, '')
                       .replace(/^chore:\s*/i, '')
                       .replace(/^refactor:\s*/i, '');

    // B. Convert snake_case to Human Readable (e.g. merchant_defined_fields -> merchant defined fields)
    polished = polished.replace(/([a-z])_([a-z])/g, '$1 $2');

    // C. "Business Verb" Swapping - Make it sound proactive
    if (type === 'Bug Fix') {
       if (polished.match(/^fix/i)) polished = polished.replace(/^fix(ed)?\s/i, 'Resolved stability issue with ');
       if (polished.match(/^correct/i)) polished = polished.replace(/^correct(ed)?\s/i, 'Fixed data discrepancy in ');
    } else {
       if (polished.match(/^add/i)) polished = polished.replace(/^add(ed)?\s(support for\s)?/i, 'Enabled capabilities for ');
       if (polished.match(/^implement/i)) polished = polished.replace(/^implement(ed)?\s/i, 'Launched new ');
       if (polished.match(/^update/i)) polished = polished.replace(/^update(ed)?\s/i, 'Enhanced ');
    }

    // D. Capitalize first letter
    return polished.charAt(0).toUpperCase() + polished.slice(1);
  }

  // --- 2. HIERARCHICAL CATEGORIZATION ---
  function getCategory(item: ReleaseItem): SummaryCategory {
    // Priority 1: Connectors (Revenue Drivers)
    if (item.connector) return 'Global Connectivity';

    const text = item.title.toLowerCase();

    // Priority 2: Security & Governance (Risk & Compliance)
    const securityKeywords = ['auth', 'security', 'compliance', 'gdpr', 'pci', 'token', 'vault', 'locker', 'permission', 'role', 'policy', 'oidc', 'sso'];
    if (securityKeywords.some(k => text.includes(k))) return 'Security & Governance';

    // Priority 3: Core Platform (Scale & Reliability)
    const coreKeywords = ['routing', 'infrastructure', 'latency', 'performance', 'database', 'optimization', 'api', 'webhook', 'event', 'monitoring', 'alert', 'rust', 'aws'];
    if (coreKeywords.some(k => text.includes(k))) return 'Core Platform & Reliability';

    // Priority 4: Everything else is "Merchant Experience" (Product Features)
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
      // Wednesday Logic
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

    // Special Layout for Connectors: Comma Separated for Cleanliness
    if (title === 'Global Connectivity') {
        const byConnector: Record<string, ReleaseItem[]> = {};
        items.forEach(item => {
            const name = item.connector || 'Other';
            if (!byConnector[name]) byConnector[name] = [];
            byConnector[name].push(item);
        });

        return (
            <div className="mb-6">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-400">
                    {title}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(byConnector).sort().map(([name, connectorItems]) => (
                        <div key={name} className="rounded-lg bg-slate-800/40 p-3 border border-slate-700/50">
                            <span className="block mb-1 font-bold text-slate-100">{name}</span>
                            <ul className="list-disc list-inside space-y-1">
                                {connectorItems.map((c, i) => (
                                    <li key={i} className="text-sm text-slate-300 leading-snug">
                                        {polishText(c.title, c.type)}
                                        {c.prNumber && <a href={c.prUrl} target="_blank" className="ml-1 text-[10px] text-slate-500 hover:text-sky-400 no-underline">↗</a>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Standard Layout for other categories
    return (
      <div className="mb-6">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-sky-400">
            {title}
        </h3>
        <ul className="space-y-3">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-3 text-sm text-slate-300 leading-relaxed group">
              <span className="text-slate-500 mt-1">•</span>
              <span>
                <span className="text-slate-200">{polishText(item.title, item.type)}</span>
                {item.prNumber && (
                  <a href={item.prUrl} target="_blank" className="ml-2 text-[10px] text-slate-500 opacity-50 group-hover:opacity-100 hover:text-sky-400 transition-all">
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
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-sky-500/30">
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-10">
        
        {/* HEADER */}
        <section className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800 pb-8">
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-400 ring-1 ring-inset ring-sky-500/20">
                        INTERNAL
                    </span>
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                        Product Updates
                    </span>
                </div>
                <h1 className="mb-3 text-3xl font-bold tracking-tight text-white">
                    Weekly Release Notes
                </h1>
                <p className="max-w-xl text-sm text-slate-400 leading-relaxed">
                    {viewMode === 'summary' 
                        ? "High-level overview of value delivered, grouped by business domain."
                        : "Comprehensive technical changelog for engineering review."
                    }
                </p>
            </div>
            
            <div className="flex items-center gap-3">
                <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button 
                        onClick={() => setViewMode('summary')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'summary' ? 'bg-slate-800 text-sky-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <FileText size={14} /> Executive View
                    </button>
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-slate-800 text-sky-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <LayoutList size={14} /> Dev List
                    </button>
                </div>

                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="flex items-center justify-center h-9 w-9 rounded-full border border-slate-700 bg-slate-900/50 text-slate-400 hover:border-sky-500 hover:text-sky-400 transition-colors"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>
        </section>

        {/* FILTERS */}
        <section className="mb-10">
          <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] p-1">
            {/* Connector */}
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Filter by Connector</label>
              <select value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value)} className="w-full appearance-none rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5 text-sm text-slate-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all">
                <option value="All">All Connectors</option>
                {connectors.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="w-full appearance-none rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5 text-sm text-slate-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all">
                <option value="All">All Types</option>
                <option value="Feature">Features</option>
                <option value="Bug Fix">Bug Fixes</option>
              </select>
            </div>

            {/* Date Range */}
            <div className="flex gap-2">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">From</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500" />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">To</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500" />
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
                    {/* Timeline Line */}
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-sky-500/50 via-slate-800 to-transparent md:hidden"></div>
                    
                    <div className="mb-6 flex items-baseline gap-4">
                        <h2 className="text-xl font-semibold text-white tracking-tight">
                            {week.headline}
                        </h2>
                        <span className="text-sm font-mono text-slate-500">Cycle ending {week.date}</span>
                    </div>
                
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-6 md:p-8 hover:border-slate-700 transition-colors">
                        {viewMode === 'summary' ? (
                            // EXECUTIVE VIEW
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
                            // DEV LIST VIEW
                            <ul className="space-y-4">
                                {week.items.map((item, idx) => (
                                    <li key={idx} className="flex flex-col gap-1 md:flex-row md:items-start md:gap-3 text-sm">
                                         <span className={`mt-0.5 inline-flex h-fit w-fit items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.type === 'Feature' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                            {item.type === 'Feature' ? 'FEAT' : 'FIX'}
                                        </span>
                                        <div className="flex-1">
                                            <p className="text-slate-300">
                                                {item.connector && <strong className="text-slate-100 mr-1">{item.connector}:</strong>}
                                                {item.title}
                                            </p>
                                            {item.prNumber && <a href={item.prUrl} target="_blank" className="text-xs text-slate-500 hover:text-sky-400">PR #{item.prNumber}</a>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            );
          })}

          {groupedWeeks.length === 0 && !loading && (
            <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
              <p className="text-slate-400">No release notes found for this period.</p>
              <button onClick={() => {setFromDate(''); setToDate(''); setConnectorFilter('All');}} className="mt-2 text-sm text-sky-400 hover:text-sky-300">
                  Clear Filters
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
