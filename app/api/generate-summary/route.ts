import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || '',
  baseURL: process.env.AI_BASE_URL || 'https://grid.ai.juspay.net', // Kept your original URL
});

// Allow longer timeout if on Pro plan (ignored on Hobby but good practice)
export const maxDuration = 30; 
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { items, weekDate } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summary: "<p>No items to summarize.</p>" });
    }

    // SAFETY 1: Limit input size to prevent timeouts on Vercel Free Tier
    // We send max 40 items. This ensures the request finishes in <10s.
    const limitedItems = items.slice(0, 40); 
    
    const inputList = limitedItems.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');

    const prompt = `
      You are writing the official weekly release notes for Hyperswitch.
      
      **Context:**
      - Week of: ${weekDate}
      - Audience: Merchant Business Heads.
      - Goal: Summarize technical PRs into business value.

      **Input Data:**
      ${inputList}
      ${items.length > 40 ? `*(Note: ${items.length - 40} minor updates omitted)*` : ''}

      **Instructions:**
      1. Group related connectors (e.g. "Adyen & Barclaycard").
      2. Create "Highlights" (Top 3 changes).
      3. Categorize rest: "Connector expansions", "Customer access", "Core improvements".
      
      **Strict HTML Output (No Markdown):**
      
      <div>
        <div class="mb-6 p-5 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <h3 class="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            Highlights
          </h3>
          <ul class="space-y-2">
            <li class="text-slate-700 dark:text-slate-300 text-sm flex gap-2">
              <span class="text-sky-500 font-bold">•</span>
              <span>[Highlight 1]</span>
            </li>
            <li class="text-slate-700 dark:text-slate-300 text-sm flex gap-2">
              <span class="text-sky-500 font-bold">•</span>
              <span>[Highlight 2]</span>
            </li>
          </ul>
        </div>

        <div class="mb-4">
          <h4 class="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20 pb-1 mb-2">
            Connector expansions
          </h4>
          <div class="mb-2">
            <strong class="block text-slate-800 dark:text-slate-200 text-sm">[Connector Group]: [Summary]</strong>
            <p class="text-xs text-slate-500 dark:text-slate-400 pl-2">
              [Detail] <span class="opacity-75">#[PR_NUMBER]</span>
            </p>
          </div>
        </div>
      </div>
    `;

    // SAFETY 2: Force a fast model. GPT-4o-mini is ~10x faster than GPT-4.
    // If your custom AI proxy doesn't support this specific ID, change it to what it supports (e.g. 'gpt-3.5-turbo').
    const modelId = process.env.AI_MODEL_ID || 'gpt-4o-mini'; 

    const completion = await openai.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: 'You are a precise technical writer.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 1000, // Limit output length
    });

    const summaryHTML = completion.choices[0]?.message?.content || '';
    const cleanHTML = summaryHTML.replace(/```html/g, '').replace(/```/g, '').trim();

    return NextResponse.json({ summary: cleanHTML });

  } catch (error: any) {
    console.error('AI Summary Error:', error);
    
    // Return specific error if timeout or rate limit
    if (error.code === 'rate_limit_exceeded') {
        return NextResponse.json({ error: 'AI Rate limit exceeded' }, { status: 429 });
    }

    return NextResponse.json({ 
        error: 'Failed to generate summary', 
        details: error.message 
    }, { status: 500 });
  }
}
