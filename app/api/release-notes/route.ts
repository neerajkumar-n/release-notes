import { NextResponse } from 'next/server';

export const runtime = 'edge';

type ReleaseItem = {
  title: string;
  type: 'Feature' | 'Bug Fix';
  connector: string | null;
  prNumber?: string;
  prUrl?: string;
  originalDate: string; // We keep the specific date (e.g. Monday) for sorting
};

type ReleaseWeek = {
  id: string;
  date: string;
  headline: string;
  items: ReleaseItem[];
};

// 1. Clean up the text (remove markdown links, bolding, etc.)
function cleanTitle(raw: string): string {
  let text = raw;
  // Remove PR links
  text = text.replace(/\[#\d+\]\(https:\/\/github\.com[^\)]*\)/g, '');
  text = text.replace(/\(https:\/\/github\.com[^\)]*\)/g, '');
  text = text.replace(/\(\s*\)/g, '');
  // Remove bold markers
  text = text.replace(/\*\*/g, '');
  // Remove [ConnectorName] tags
  text = text.replace(/\[[^\]]+\]/g, '');
  // Remove backticks
  text = text.replace(/`/g, '');
  // Fix spacing
  text = text.replace(/\s{2,}/g, ' ');
  text = text.trim();
  // Remove trailing punctuation
  text = text.replace(/[-–:,;.\s]+$/, '');
  return text;
}

// 2. Normalize Connector Names (e.g. "ADYEN" -> "Adyen")
function normalizeConnector(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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

      // Detect Version Headers like: ## [2026.01.05.0]
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

      // Detect Bullet Points
      if (trimmed.startsWith('-') && currentWeek) {
        const content = trimmed.substring(1).trim();
        if (!content) continue;

        const lower = content.toLowerCase();
        
        // IMPROVED: Better detection for Bug Fixes vs Features
        const type: 'Feature' | 'Bug Fix' = 
          lower.includes('fix') || lower.includes('bug') 
          ? 'Bug Fix' 
          : 'Feature';

        // Extract Connector Name: [Stripe]
        const connectorMatch = content.match(/\[([a-zA-Z0-9_\s]+)\]/);
        const rawConnector = connectorMatch ? connectorMatch[1].trim() : null;
        const connector = rawConnector ? normalizeConnector(rawConnector) : null;

        // Extract PR Number and URL
        const prMatch = content.match(/\[#(\d+)\]\((https:\/\/github\.com\/[^\)]+)\)/);
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
          originalDate: currentWeek.date, // Pass the date down so we can regroup it later
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
