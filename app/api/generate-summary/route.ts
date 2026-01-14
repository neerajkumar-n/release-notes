import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || '',
  baseURL: process.env.AI_BASE_URL || 'https://grid.ai.juspay.net',
});

// Set max duration for Pro plan (ignored on Hobby, but good practice)
export const maxDuration = 30; 
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { items, weekDate } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summary: "<p>No items to summarize.</p>" });
    }

    // 1. PROCESS ALL ITEMS (Removed the slice limit)
    // We map to a dense format to save tokens while keeping all info.
    const inputList = items.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');

    // 2. STRICTER PROMPT to force the specific groups you want
    const prompt = `
      You are writing the official release notes for Hyperswitch.
      
      **Context:**
      - Week: ${weekDate}
      - Input: ${items.length} Pull Requests.
      - Goal: Summarize ALL work done this week. Do not ignore items.

      **Input Data:**
      ${inputList}

      **Required Output Structure (HTML Only):**
      
      <div>
        <div class="mb-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-4">Highlights</h3>
          <ul class="space-y-2">
            <li class="text-slate-700 dark:text-slate-300 text-sm flex gap-2">
              <span class="text-sky-500 font-bold">•</span>
              <span>[Highlight 1]</span>
            </li>
            <li class="text-slate-700 dark:text-slate-300 text-sm flex gap-2">
              <span class="text-sky-500 font-bold">•</span>
              <span>[Highlight 2]</span>
            </li>
             <li class="text-slate-700 dark:text-slate-300 text-sm flex gap-2">
              <span class="text-sky-500 font-bold">•</span>
              <span>[Highlight 3]</span>
            </li>
          </ul>
        </div>

        <div class="mb-8">
          <h4 class="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20 pb-2 mb-4">
            Connector expansions and enhancements
          </h4>
          <div class="mb-4">
            <strong class="block text-slate-900 dark:text-white text-sm mb-1">[Connector Group Name]: [Summary of changes]</strong>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              [Specific details of what changed]
              <span class="opacity-60 text-xs ml-1">#[PR_Number]</span>
            </p>
          </div>
        </div>

        <div class="mb-8">
          <h4 class="text-xs font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400 border-b border-purple-500/20 pb-2 mb-4">
            Customer and access management
          </h4>
          <div class="mb-4">
            <strong class="block text-slate-900 dark:text-white text-sm mb-1">[Feature Area]: [Summary]</strong>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              [Details] <span class="opacity-60 text-xs ml-1">#[PR_Number]</span>
            </p>
          </div>
        </div>

        <div class="mb-8">
          <h4 class="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 border-b border-indigo-500/20 pb-2 mb-4">
            Routing and core improvements
          </h4>
          <div class="mb-4">
            <strong class="block text-slate-900 dark:text-white text-sm mb-1">[Core Area]: [Summary]</strong>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              [Details] <span class="opacity-60 text-xs ml-1">#[PR_Number]</span>
            </p>
          </div>
        </div>
      </div>
    `;

    const modelId = process.env.AI_MODEL_ID || 'glm-latest';

    const completion = await openai.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: 'You are a precise technical product manager. You categorize EVERY input item into the correct bucket.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, // Lower temperature to be more deterministic and strictly follow the list
      max_tokens: 2000,
    });

    const summaryHTML = completion.choices[0]?.message?.content || '';
    const cleanHTML = summaryHTML.replace(/```html/g, '').replace(/```/g, '').trim();

    return NextResponse.json({ summary: cleanHTML });

  } catch (error: any) {
    console.error('AI Summary Error:', error);
    if (error.code === 'rate_limit_exceeded') {
        return NextResponse.json({ error: 'AI Rate limit exceeded' }, { status: 429 });
    }
    return NextResponse.json({ 
        error: 'Failed to generate summary', 
        details: error.message 
    }, { status: 500 });
  }
}
