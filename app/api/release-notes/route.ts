import { NextResponse } from 'next/server';

export const runtime = 'edge';

type ReleaseItem = {
  title: string;
  type: 'Feature' | 'Bug Fix';
  connector: string | null;
};

type ReleaseWeek = {
  id: string;
  date: string; // ISO yyyy-mm-dd
  headline: string;
  items: ReleaseItem[];
};

export async function GET() {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/juspay/hyperswitch/main/CHANGELOG.md'
    );
    if (!res.ok) throw new Error('Failed to fetch changelog');
    const text = await res.text();

    const lines = text.split('\n');
    const weeks: ReleaseWeek[] = [];
    let currentWeek: ReleaseWeek | null = null;
    let currentVersion = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect version like: ## [2025.12.15.0]
      const versionMatch = trimmed.match(
        /^##\s*\[?(\d{4})\.(\d{1,2})\.(\d{1,2})\.\d{1,2}\]?/
      );
      if (versionMatch) {
        const [, y, m, d] = versionMatch;
        const dateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        currentVersion = `${y}.${m}.${d}`;

        currentWeek = {
          id: dateStr,
          date: dateStr,
          headline: `Release ${dateStr}`,
          items: [],
        };
        weeks.push(currentWeek);
        continue;
      }

      // Bullet lines (very simple heuristic)
      if (trimmed.startsWith('-') && currentWeek) {
        const content = trimmed.substring(1).trim();

        const lower = content.toLowerCase();
        const type: 'Feature' | 'Bug Fix' = lower.includes('fix')
          ? 'Bug Fix'
          : 'Feature';

        const connectorMatch = content.match(/\[([a-zA-Z0-9_\s]+)\]/);
        const connector = connectorMatch ? connectorMatch[1] : null;

        currentWeek.items.push({
          title: content,
          type,
          connector,
        });
      }
    }

    return NextResponse.json(weeks);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to load data' },
      { status: 500 }
    );
  }
}
