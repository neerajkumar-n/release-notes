import { NextResponse } from 'next/server';

export const runtime = 'edge';

type ReleaseItem = {
  title: string; // cleaned, PM-friendly text
  type: 'Feature' | 'Bug Fix';
  connector: string | null;
  prNumber?: string;
  prUrl?: string;
};

type ReleaseWeek = {
  id: string;
  date: string; // ISO yyyy-mm-dd
  headline: string;
  items: ReleaseItem[];
};

function cleanTitle(raw: string): string {
  let text = raw;

  // Remove PR links like ([#10588](https://github.com/...))
  text = text.replace(/\[#\d+\]\(https:\/\/github\.com[^\)]*\)/g, '');
  // Remove any remaining GitHub links in parentheses
  text = text.replace(/\(https:\/\/github\.com[^\)]*\)/g, '');
  // Remove empty parentheses that are left behind
  text = text.replace(/\(\s*\)/g, '');
  // Remove markdown bold markers
  text = text.replace(/\*\*/g, '');
  // Remove connector markers like [ADYEN]
  text = text.replace(/\[[^\]]+\]/g, '');
  // Remove stray backticks
  text = text.replace(/`/g, '');
  // Collapse multiple spaces
  text = text.replace(/\s{2,}/g, ' ');
  // Trim trailing punctuation / whitespace
  text = text.trim();
  text = text.replace(/[-–:,;.\s]+$/, '');

  return text;
}

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

    for (const line of lines) {
      const trimmed = line.trim();

      // Version like: ## [2026.01.05.0]
      const versionMatch = trimmed.match(
        /^##\s*\[?(\d{4})\.(\d{1,2})\.(\d{1,2})\.\d{1,2}\]?/
      );
      if (versionMatch) {
        const [, y, m, d] = versionMatch;
        const dateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

        currentWeek = {
          id: dateStr,
          date: dateStr,
          headline: `Release ${dateStr}`,
          items: [],
        };
        weeks.push(currentWeek);
        continue;
      }

      // Bullet lines
      if (trimmed.startsWith('-') && currentWeek) {
        const content = trimmed.substring(1).trim();
        if (!content) continue;

        const lower = content.toLowerCase();
        const type: 'Feature' | 'Bug Fix' = lower.includes('fix')
          ? 'Bug Fix'
          : 'Feature';

        // Connector like [ADYEN], [Stripe], [WorldpayWPG]
        const connectorMatch = content.match(/\[([a-zA-Z0-9_\s]+)\]/);
        const connector = connectorMatch ? connectorMatch[1].trim() : null;

        // PR number + URL
        const prMatch = content.match(
          /\[#(\d+)\]\((https:\/\/github\.com\/[^\)]+)\)/
        );
        const prNumber = prMatch?.[1];
        const prUrl = prMatch?.[2];

        const title = cleanTitle(content);
        if (!title) continue;

        currentWeek.items.push({
          title,
          type,
          connector,
          prNumber,
          prUrl,
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
