import { NextResponse } from 'next/server';
import { enhanceReleaseItems } from '@/lib/llm-enhancer';

export const runtime = 'nodejs';

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

type ReleaseWeek = {
  id: string;
  date: string;
  headline: string;
  items: ReleaseItem[];
};

// Clean up markdown noise
function cleanTitle(raw: string): string {
  let text = raw;
  text = text.replace(/\[#\d+\]\(https:\/\/github\.com[^\)]*\)/g, '');
  text = text.replace(/\(https:\/\/github\.com[^\)]*\)/g, '');
  text = text.replace(/\(\s*\)/g, '');
  text = text.replace(/\*\*/g, '');
  text = text.replace(/\[[^\]]+\]/g, '');
  text = text.replace(/`/g, '');
  text = text.replace(/\s{2,}/g, ' ');
  text = text.trim();
  text = text.replace(/[-–:,;.\s]+$/, '');
  return text;
}

// Normalize Connector Names
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
    // FIXED LINE BELOW
    const res = await fetch(
      'https://raw.githubusercontent.com/juspay/hyperswitch/main/CHANGELOG.md',
      { next: { revalidate: 3600 } }
    );
    
    if (!res.ok) throw new Error('Failed to fetch changelog');
    const text = await res.text();

    const lines = text.split('\n');
    const weeks: ReleaseWeek[] = [];
    let currentWeek: ReleaseWeek | null = null;
    let currentVersion: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect Version: ## [2026.01.05.0]
      const versionMatch = trimmed.match(
        /^##\s*\[?(\d{4}\.\d{1,2}\.\d{1,2}\.\d{1,2})\]?/
      );
      
      if (versionMatch) {
        currentVersion = versionMatch[1];
        
        // Parse date from version string
        const [y, m, d] = currentVersion.split('.').map(Number);
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        currentWeek = {
          id: dateStr,
          date: dateStr,
          headline: `Release ${dateStr}`,
          items: [],
        };
        weeks.push(currentWeek);
        continue;
      }

      // Items
      if (trimmed.startsWith('-') && currentWeek) {
        const content = trimmed.substring(1).trim();
        if (!content) continue;

        const lower = content.toLowerCase();

        // Smart Type Detection
        const type: 'Feature' | 'Bug Fix' =
          lower.includes('fix') || lower.includes('bug') || lower.includes('resolves')
          ? 'Bug Fix'
          : 'Feature';

        const connectorMatch = content.match(/\[([a-zA-Z0-9_\s]+)\]/);
        const rawConnector = connectorMatch ? connectorMatch[1].trim() : null;
        const connector = rawConnector ? normalizeConnector(rawConnector) : null;

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
          originalDate: currentWeek.date,
          version: currentVersion,
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
