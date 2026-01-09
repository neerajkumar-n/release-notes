'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, CalendarDays } from 'lucide-react';

type ReleaseItem = {
  title: string;
  type: 'Feature' | 'Bug Fix';
  connector: string | null;
  prNumber?: string;
  prUrl?: string;
};

type ReleaseWeek = {
  id: string;
  date: string; // yyyy-mm-dd (release date)
  headline: string;
  items: ReleaseItem[];
};

export default function Page() {
  // Full data from the API
  const [allWeeks, setAllWeeks] = useState<ReleaseWeek[]>([]);
  // What we actually show after applying filters
  const [filteredWeeks, setFilteredWeeks] = useState<ReleaseWeek[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Feature' | 'Bug Fix'>(
    'All'
  );
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Fetch from our API (which reads the GitHub changelog)
  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/release-notes');
      const json = await res.json();
      setAllWeeks(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    fetchData();
  }, []);

  // Unique connectors for the dropdown (based on full data)
  const connectors = useMemo(() => {
    const set = new Set<string>();
    allWeeks.forEach((week) =>
      week.items.forEach((item) => {
        if (item.connector) {
          set.add(item.connector);
        }
      })
    );
    return Array.from(set).sort();
  }, [allWeeks]);

  // Recompute filtered list whenever data or any filter changes
  useEffect(() => {
    // Convert filter dates to timestamps (milliseconds)
    const fromTime =
      fromDate && !Number.isNaN(Date.parse(fromDate))
        ? Date.parse(fromDate)
        : null;
    const toTime =
      toDate && !Number.isNaN(Date.parse(toDate)) ? Date.parse(toDate) : null;

    const next: ReleaseWeek[] = allWeeks
      .map((week) => {
        // Parse week date (from API) to timestamp
        const weekTime = !Number.isNaN(Date.parse(week.date))
          ? Date.parse(week.date)
          : null;

        // If we can't parse the week date, hide it
        if (weekTime === null) {
          return { ...week, items: [] as ReleaseItem[] };
        }

        // Date range checks (inclusive)
        if (fromTime !== null && weekTime < fromTime) {
          return { ...week, items: [] as ReleaseItem[] };
        }
        if (toTime !== null && weekTime > toTime) {
          return { ...week, items: [] as ReleaseItem[] };
        }

        // Apply connector + type filters to the items
        const items = week.items.filter((item) => {
          if (connectorFilter !== 'All' && item.connector !== connectorFilter) {
            return false;
          }
          if (typeFilter !== 'All' && item.type !== typeFilter) {
            return false;
          }
          return true;
        });

        return { ...week, items };
      })
      // Only keep weeks that still have visible items
      .filter((week) => week.items.length > 0);

    setFilteredWeeks(next);
  }, [allWeeks, connectorFilter, typeFilter, fromDate, toDate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
        {/* Hero */}
        <section className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
            Release Notes
          </p>
          <h1 className="mb-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Weekly Hyperswitch Updates
          </h1>
          <p className="max-w-2xl text-sm text-slate-300">
            A single view of what changed in Hyperswitch, grouped by weekly
            releases from our GitHub changelog. Filter by connector, change
            type, and date range. Use a Wednesday–to–Wednesday window to view a
            specific weekly release cycle.
          </p>

          {/* Refresh button */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:border-sky-500 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh from GitHub
          </button>
        </section>

        {/* Filters */}
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

            {/* From date */}
            <div className="w-full md:w-40">
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                From date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 pr-9 text-sm text-slate-50 outline-none focus:border-sky-500"
                />
                <CalendarDays className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
            </div>

            {/* To date */}
            <div className="w-full md:w-40">
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                To date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 pr-9 text-sm text-slate-50 outline-none focus:border-sky-500"
                />
                <CalendarDays className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
            </div>
          </div>
        </section>

        {/* Weekly releases */}
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
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {filteredWeeks.length === 0 && !loading && (
            <p className="text-sm text-slate-400">
              No release notes match this connector / type / date range. Try
              adjusting the window (for example, Wednesday–to–Wednesday).
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
