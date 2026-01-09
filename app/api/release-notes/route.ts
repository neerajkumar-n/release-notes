import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  try {
    // 1. Fetch the raw file from Hyperswitch GitHub
    const res = await fetch('https://raw.githubusercontent.com/juspay/hyperswitch/main/CHANGELOG.md');
    if (!res.ok) throw new Error('Failed to fetch changelog');
    const text = await res.text();

    // 2. Simple Parser Logic
    const lines = text.split('\n');
    const weeks = [];
    let currentWeek = null;
    let currentVersion = '';

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect Version Date (e.g. 2025.12.15.0)
      const versionMatch = trimmed.match(/^##\s*\[?(\d{4}\.\d{1,2}\.\d{1,2}\.\d{1,2})\]?/);
      if (versionMatch) {
        currentVersion = versionMatch[1]; 
        // Create a simplified "Week" bucket based on this date
        const dateStr = currentVersion.split('.').slice(0,3).join('-');
        
        if (!currentWeek || currentWeek.headline !== dateStr) {
            currentWeek = { 
                id: dateStr, 
                headline: `Release ${dateStr}`, 
                items: [] 
            };
            weeks.push(currentWeek);
        }
      }

      // Detect bullet points
      if (trimmed.startsWith('-') && currentWeek) {
        const content = trimmed.substring(1).trim();
        // Check if it's a feature or bug
        const type = content.toLowerCase().includes('fix') ? 'Bug Fix' : 'Feature';
        // Extract Connector name like [Stripe]
        const connectorMatch = content.match(/\[([a-zA-Z0-9_\s]+)\]/);
        const connector = connectorMatch ? connectorMatch[1] : null;

        currentWeek.items.push({
            title: content,
            type: type,
            connector: connector
        });
      }
    }

    return NextResponse.json(weeks);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
}
