import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || '',
  baseURL: process.env.AI_BASE_URL || 'https://grid.ai.juspay.net',
});

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { items, weekDate } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summaryFragment: "" });
    }

    const safeItems = items.slice(0, 60);
    
    console.log('[SUMMARY] Starting generation for week:', weekDate);
    console.log('[SUMMARY] Item count:', safeItems.length);

    // STEP 1: Simple prompt asking for structured data
    const list = safeItems.map((i: any) => 
      `- [${i.connector || 'Core'}] ${i.title} (PR #${i.prNumber || 'N/A'})`
    ).join('\n');

    const prompt = `Analyze these Hyperswitch release notes for week ${weekDate}:

${list}

Categorize them into a structured summary with:
1. "highlights": Array of 3-5 key themes (each with "title" and "description")
2. "connectors": Array of connector updates (each with "name", "description", "prNumber")
3. "customer": Array of customer/access management updates (each with "description", "prNumber")
4. "core": Array of routing/core improvements (each with "description", "prNumber")

Return ONLY valid JSON in this format:
{
  "highlights": [{"title": "...", "description": "..."}],
  "connectors": [{"name": "Stripe", "description": "...", "prNumber": "123"}],
  "customer": [{"description": "...", "prNumber": "124"}],
  "core": [{"description": "...", "prNumber": "125"}]
}`;

    // STEP 2: Call LLM
    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL_ID || 'gpt-4-turbo',
      messages: [
        { role: 'system', content: 'You are a technical release notes analyzer. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    console.log('[SUMMARY] LLM Response received');
    let rawContent = completion.choices[0]?.message?.content || '{}';
    
    // STEP 3: Parse the response
    // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
    rawContent = rawContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    
    let data;
    try {
      data = JSON.parse(rawContent);
      console.log('[SUMMARY] JSON parsed successfully');
    } catch (e) {
      console.error('[SUMMARY] JSON parse error, trying regex extraction:', e);
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
        console.log('[SUMMARY] JSON extracted via regex');
      } else {
        console.error('[SUMMARY] Could not extract JSON, returning empty data');
        data = { highlights: [], connectors: [], customer: [], core: [] };
      }
    }

    console.log('[SUMMARY] Parsed data:', {
      highlights: data.highlights?.length || 0,
      connectors: data.connectors?.length || 0,
      customer: data.customer?.length || 0,
      core: data.core?.length || 0
    });

    // STEP 4: Generate HTML from template
    const html = generateHTMLFromData(data);
    
    return NextResponse.json({ summaryFragment: html });

  } catch (error: any) {
    console.error('[SUMMARY] Error:', error.message || error);
    console.error('[SUMMARY] Error details:', {
      type: error.constructor?.name,
      status: error.status,
      code: error.code,
    });
    return NextResponse.json({ 
      error: 'Failed to generate summary',
      details: error.message || 'Unknown error'
    }, { status: 500 });
  }
}

// STEP 5: HTML Template Generator
function generateHTMLFromData(data: any): string {
  const highlights = data.highlights || [];
  const connectors = data.connectors || [];
  const customer = data.customer || [];
  const core = data.core || [];

  // Generate highlights section
  const highlightsHTML = highlights.map((h: any) => `
    <div class="space-y-1">
      <div class="text-xs font-bold text-slate-800 dark:text-slate-200">${h.title || 'Update'}</div>
      <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">${h.description || ''}</p>
    </div>
  `).join('');

  // Generate connectors section
  const connectorsHTML = connectors.map((c: any) => `
    <div class="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
      <div class="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
        <span class="shrink-0 w-32 text-sm font-semibold text-slate-900 dark:text-slate-100">${c.name || 'Connector'}</span>
        <div class="flex-1 space-y-2">
          <div class="flex items-start justify-between gap-4">
            <span class="text-sm text-slate-600 dark:text-slate-400">${c.description || ''}</span>
            ${c.prNumber ? `<a href="https://github.com/juspay/hyperswitch/pull/${c.prNumber}" target="_blank" class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800 text-[10px] font-mono font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">#${c.prNumber}</a>` : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');

  // Generate customer section
  const customerHTML = customer.map((c: any) => `
    <div class="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
      <div class="flex items-start justify-between gap-4">
        <span class="text-sm text-slate-600 dark:text-slate-400">${c.description || ''}</span>
        ${c.prNumber ? `<a href="https://github.com/juspay/hyperswitch/pull/${c.prNumber}" target="_blank" class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 text-purple-600 border border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800 text-[10px] font-mono font-bold hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors">#${c.prNumber}</a>` : ''}
      </div>
    </div>
  `).join('');

  // Generate core section
  const coreHTML = core.map((c: any) => `
    <div class="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
      <div class="flex items-start justify-between gap-4">
        <span class="text-sm text-slate-600 dark:text-slate-400">${c.description || ''}</span>
        ${c.prNumber ? `<a href="https://github.com/juspay/hyperswitch/pull/${c.prNumber}" target="_blank" class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 text-purple-600 border border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800 text-[10px] font-mono font-bold hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors">#${c.prNumber}</a>` : ''}
      </div>
    </div>
  `).join('');

  // Combine everything into final HTML
  return `
<div class="flex flex-col gap-6">
  ${highlights.length > 0 ? `
  <div class="rounded-xl bg-gradient-to-br from-indigo-50/50 to-white/50 dark:from-slate-800 dark:to-slate-900 border border-indigo-100 dark:border-slate-700 p-6 shadow-sm">
    <h3 class="text-xs font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-4 flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-indigo-500"></span> Weekly Highlights
    </h3>
    <div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
      ${highlightsHTML}
    </div>
  </div>
  ` : ''}

  ${connectors.length > 0 ? `
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
    <div class="bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
      <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
      <h4 class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Connectors</h4>
    </div>
    <div class="divide-y divide-slate-100 dark:divide-slate-800">
      ${connectorsHTML}
    </div>
  </div>
  ` : ''}

  ${customer.length > 0 ? `
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
    <div class="bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
      <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
      <h4 class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Customer & Access Management</h4>
    </div>
    <div class="divide-y divide-slate-100 dark:divide-slate-800">
      ${customerHTML}
    </div>
  </div>
  ` : ''}

  ${core.length > 0 ? `
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
    <div class="bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
      <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
      <h4 class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Routing & Core Improvements</h4>
    </div>
    <div class="divide-y divide-slate-100 dark:divide-slate-800">
      ${coreHTML}
    </div>
  </div>
  ` : ''}
</div>
  `.trim();
}
