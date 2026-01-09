'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type ReleaseItem = {
  title: string;
  type: 'Feature' | 'Bug Fix';
  connector: string | null;
  prNumber?: string;
  prUrl?: string;
};

type ReleaseWeek = {
  id: string;
  date: string; // yyyy-mm-dd
  headline: string;
  items: ReleaseItem[];
};

export default function Page() {
  const [data, setData] = useState<ReleaseWeek[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>(
    'All'
  );
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/release-notes');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  // All unique connectors for dropdown
  const connectors = useMemo(() => {
    const set = new Set<string>();
    data.forEach((week) =>
      week.items.forEach((item) => {
        if (item.connector) set.add(item.connector);
      })
    );
    return Array.from(set).sort();
  }, [data]);

  // Apply filters
  const filteredWeeks = useMemo(() => {
    return data
      .map((week) => {
        const dateOk =
          (!fromDate || week.date >= fromDate) &&
          (!toDate || week.date <= toDate);

        if (!dateOk) return { ...week, items: [] as ReleaseItem[] };

        const items = week.items.filter((item) => {
          if (connectorFilter !== 'All' && item.connector !== connectorFilter)
            return false;
          if (typeFilter !== 'All' && item.type !== typeFilter) return false;
          if (
            search &&
            !item.title.toLowerCase().includes(search.toLowerCase())
          )
            return false;
          return true;
        });

        return { ...week, items };
      })
      .filter((week) => week.items.length > 0);
  }, [data, fromDate, toDate, connectorFilter, typeFilter, search]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
        {/* Hero */}
        <section className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
            Release Notes
          </p>
          <h1 className="mb-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Weekly Hyperswitch Updates
          </h1>
          <p className="max-w-2xl text-sm text-slate-300">
            A single view of what changed in Hyperswitch, grouped by weekly
            releases from our GitHub changelog. Filter by connector, change
            type, date range, and search for specific updates.
          </p>
        </section>

        {/* Filters + refresh */}
        <section className="mb-6 flex flex-col gap-4 rounded-xl border border-white/5 bg-slate-900/60 p-4 shadow-sm md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            {/* Connector */}
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Connector
              </label>
              <select
                value={connectorFilter}
                onChange={(e) => setConnectorFilter(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
              >
                <option value="All">All connectors</option>
                {connectors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div className="w-full md:w-44">
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as 'All' | 'Feature' | 'Bug Fix')
                }
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
              >
                <option value="All">All types</option>
                <option value="Feature">Features</option>
                <option value="Bug Fix">Bug fixes</option>
              </select>
            </div>

            {/* Date range */}
            <div className="w-full md:w-40">
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                From date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
              />
            </div>
            <div className="w-full md:w-40">
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                To date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Search + refresh */}
          <div className="flex flex-col gap-3 md:w-80">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Search
              </label>
              <input
                placeholder="Search in titles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-sky-500"
              />
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 shadow-sm transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={loading ? 'animate-spin' : ''}
              />
              {loading ? 'Fetching…' : 'Fetch latest details'}
            </button>
          </div>
        </section>

        {/* Weeks */}
        <section className="space-y-6">
          {filteredWeeks.map((week) => (
            <div
              key={week.id}
              className="rounded-xl border border-white/5 bg-slate-900/70 p-5 shadow-sm"
            >
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-50">
                  {week.headline}
                </h2>
                <p className="text-xs text-slate-400">{week.date}</p>
              </div>
              <ul className="space-y-3">
                {week.items.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex flex-col gap-1 text-sm md:flex-row md:items-start md:gap-3"
                  >
                    <span
                      className={`inline-flex h-fit w-max items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight tracking-wide ${
                        item.type === 'Feature'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {item.type === 'Feature' ? 'FEATURE' : 'BUG FIX'}
                    </span>
                    <div className="flex-1 space-y-1">
                      <p className="text-slate-200">
                        {item.connector && (
                          <strong className="text-slate-100">
                            {item.connector}:{' '}
                          </strong>
                        )}
                        {item.title}
                      </p>
                      {item.prNumber && item.prUrl && (
                        <a
                          href={item.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex text-xs font-medium text-sky-300 hover:text-sky-200"
                        >
                          View PR #{item.prNumber}
                        </a>
