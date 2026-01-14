import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || '',
  baseURL: process.env.AI_BASE_URL || 'https://grid.ai.juspay.net',
});

// Allow longer timeout if on Pro plan (ignored on Hobby but good practice)
export const maxDuration = 30; 
export const runtime = 'nodejs';

// --- HELPER TYPES ---
type AIProcessedItem = {
  prNumber: string;
  category: 'connectors' | 'customer' | 'core';
  subGroup: string; // e.g. "Adyen", "Analytics"
  summary: string;
  isHighlight: boolean;
};

export async function POST(req: Request) {
  try {
    const { items, weekDate } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summary: "<p>No items to summarize.</p>" });
    }

    // 1. BATCHING (Process in chunks of 10 to avoid Timeouts)
    // We send ALL items, but in parallel streams so it finishes in ~3 seconds.
    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    // 2. PARALLEL AI CLASSIFICATION
    // We ask AI for JSON only. This stops the "yapping" (Chain of Thought).
    const modelId = process.env.AI_MODEL_ID || 'glm-latest';
    
    const results = await Promise.all(batches.map(async (batch) => {
        const list = batch.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');
        
        const prompt = `
          Task: Analyze these Hyperswitch PR titles.
          Output: A JSON Array only. No markdown, no explanation.
          
          Schema per item:
          {
            "prNumber": "1234",
            "category": "connectors" | "customer" | "core", 
            "subGroup": "String (Connector Name or Feature Area)",
            "summary": "Professional business value summary",
            "isHighlight": boolean (true if major impact)
          }

          Rules for Category:
          - 'connectors': Any payment processor (Adyen, Stripe), Wallets, APMs.
          - 'customer': Merchant dashboard, User access, Authentication, Onboarding.
          - 'core': Routing, Analytics, Tokenization, Infrastructure, DB.

          Rules for subGroup:
          - If 'connectors', use the Connector Name (e.g. "Adyen").
          - If multiple connectors, list them (e.g. "Adyen & Stripe").

          Input PRs:
          ${list}
        `;

        try {
            const completion = await openai.chat.completions.create({
                model: modelId,
                messages: [
                    { role: 'system', content: 'You are a JSON-only API. Output strict JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1, // Very low temp for strict JSON
                response_format: { type: "json_object" }, // Force JSON mode if supported
            });
            
            const content = completion.choices[0]?.message?.content || '[]';
            // Clean up potentially messy output (e.g. if model wraps in ```json ... ```)
            const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
            
            // Handle case where model returns object { items: [...] } instead of array
            const parsed = JSON.parse(cleanJson);
            if (Array.isArray(parsed)) return parsed;
            if (parsed.items) return parsed.items;
            return []; // Fallback
        } catch (e) {
            console.error('Batch failed', e);
            return [];
        }
    }));

    // Flatten results
    const processedItems: AIProcessedItem[] = results.flat();

    // 3. GROUPING LOGIC (The "Assemble" Phase)
    // We group by Category -> SubGroup
    const groups: Record<string, Record<string, AIProcessedItem[]>> = {
        connectors: {},
        customer: {},
        core: {}
    };
    const highlights: AIProcessedItem[] = [];

    processedItems.forEach(item => {
        // Normalize category
        let cat = item.category?.toLowerCase() || 'core';
        if (!groups[cat]) cat = 'core';

        // Normalize subGroup (Capitalize)
        const sub = item.subGroup || 'General';
        
        if (!groups[cat][sub]) groups[cat][sub] = [];
        groups[cat][sub].push(item);

        if (item.isHighlight) highlights.push(item);
    });

    // 4. HTML GENERATION (Matching your manual format exactly)
    
    // Helper to render a category block
    const renderCategory = (key: string, title: string, colorClass: string, borderClass: string) => {
        const subGroups = groups[key];
        const subGroupKeys = Object.keys(subGroups).sort();
        if (subGroupKeys.length === 0) return '';

        let html = `
        <div class="mb-8">
          <h4 class="text-xs font-bold uppercase tracking-widest ${colorClass} border-b ${borderClass} pb-2 mb-4">
            ${title}
          </h4>`;
        
        subGroupKeys.forEach(sub => {
            const items = subGroups[sub];
            html += `
            <div class="mb-4">
                <strong class="block text-slate-900 dark:text-white text-sm mb-1">${sub}: ${items[0].summary.split(' ').slice(0, 5).join(' ')}...</strong>
                <ul class="pl-0 space-y-1">
                    ${items.map(i => `
                        <li class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            ${i.summary}
                            <a href="https://github.com/juspay/hyperswitch/pull/${i.prNumber}" target="_blank" class="opacity-60 text-xs hover:text-sky-500 hover:underline decoration-sky-500/30 ml-1">#${i.prNumber}</a>
                        </li>
                    `).join('')}
                </ul>
            </div>`;
        });
        html += `</div>`;
        return html;
    };

    // Construct Final HTML
    const highlightsHTML = highlights.slice(0, 4).map(h => `
        <li class="text-slate-700 dark:text-slate-300 text-sm leading-relaxed flex gap-2">
            <span class="text-sky-500 font-bold mt-1">•</span>
            <span>${h.summary}</span>
        </li>
    `).join('');

    const finalHTML = `
      <div>
        ${highlights.length > 0 ? `
        <div class="mb-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-4">Highlights</h3>
          <ul class="space-y-2">
            ${highlightsHTML}
          </ul>
        </div>
        ` : ''}

        ${renderCategory('connectors', 'Connector expansions and enhancements', 'text-emerald-600 dark:text-emerald-400', 'border-emerald-500/20')}
        ${renderCategory('customer', 'Customer and access management', 'text-purple-600 dark:text-purple-400', 'border-purple-500/20')}
        ${renderCategory('core', 'Routing and core improvements', 'text-indigo-600 dark:text-indigo-400', 'border-indigo-500/20')}
        
        <p class="text-[10px] text-center text-slate-400 mt-8 opacity-50 font-mono">
            Generated from ${items.length} updates
        </p>
      </div>
    `;

    return NextResponse.json({ summary: finalHTML });

  } catch (error: any) {
    console.error('Summary Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
