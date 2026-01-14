import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || '',
  baseURL: process.env.AI_BASE_URL || 'https://grid.ai.juspay.net',
});

export const maxDuration = 30; 
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { items, weekDate } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summary: "<p>No items to summarize.</p>" });
    }

    // 1. BATCHING: Split items into chunks of 10 to prevent Timeouts
    const BATCH_SIZE = 10;
    const batches = [];
    // Process all items, not just top 40
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    // 2. PROMPT: Ask for HTML Fragments (Safe & Fast)
    const generatePrompt = (batchItems: any[]) => {
      const list = batchItems.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');
      return `
        Analyze these Hyperswitch PRs for the week of ${weekDate}.
        
        Group them into these categories if applicable:
        - **Highlights**: (Top impactful changes)
        - **Connectors**: (Adyen, Stripe, etc.)
        - **Core**: (Routing, Analytics, DB)
        
        OUTPUT FORMAT:
        Return ONLY a list of HTML <li> tags. Do not include <ul> tags or markdown or explanations.
        Format: <li class="text-sm mb-1"><strong class="text-slate-700 dark:text-slate-200">[Category]</strong>: Summary <span class="opacity-50 text-xs">#PR</span></li>
        
        Input Data:
        ${list}
      `;
    };

    // 3. PARALLEL EXECUTION ⚡️
    const modelId = process.env.AI_MODEL_ID || 'glm-latest';
    
    const results = await Promise.all(batches.map(async (batch) => {
        try {
            const completion = await openai.chat.completions.create({
                model: modelId,
                messages: [
                    { role: 'system', content: 'You are a strict HTML generator. Output only <li> tags.' },
                    { role: 'user', content: generatePrompt(batch) }
                ],
                temperature: 0.5,
                max_tokens: 500, 
            });
            return completion.choices[0]?.message?.content || '';
        } catch (e) {
            console.error('Batch failed', e);
            return '';
        }
    }));

    // 4. CLEANUP & ASSEMBLE
    let rawHtml = results.join('\n')
        .replace(/```html/g, '')
        .replace(/```/g, '')
        .trim();

    const finalHTML = `
      <div class="space-y-4">
        <div class="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
          <ul class="space-y-3 pl-2">
            ${rawHtml}
          </ul>
        </div>
        <p class="text-[10px] text-center text-slate-400 opacity-60 font-mono">
            Summarized ${items.length} updates
        </p>
      </div>
    `;

    return NextResponse.json({ summary: finalHTML });

  } catch (error: any) {
    console.error('Summary Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
