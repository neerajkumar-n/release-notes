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

    // 1. LIMIT & BATCH
    // We take top 40 items, but split them into chunks of 10
    // This allows us to run 4 fast requests in parallel instead of 1 slow one
    const topItems = items.slice(0, 40);
    const BATCH_SIZE = 10;
    const batches = [];
    
    for (let i = 0; i < topItems.length; i += BATCH_SIZE) {
      batches.push(topItems.slice(i, i + BATCH_SIZE));
    }

    // 2. DEFINE PROMPT (Optimized for smaller chunks)
    const generatePrompt = (batchItems: any[]) => {
      const list = batchItems.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');
      return `
        Analyze these ${batchItems.length} Hyperswitch PRs.
        Context: Week of ${weekDate}.
        
        Output strictly 3-4 bullet points in HTML <li> format summarizing the most important business value.
        Focus on: Connectors, Customer Access, or Core Improvements.
        
        Input:
        ${list}

        Output Format:
        <li class="text-slate-700 dark:text-slate-300 text-sm flex gap-2 mb-2"><span class="text-sky-500 font-bold">•</span><span>[Summary of Item] <span class="opacity-60 text-xs">#[PR]</span></span></li>
      `;
    };

    // 3. RUN IN PARALLEL (The Speed Fix ⚡️)
    const modelId = process.env.AI_MODEL_ID || 'glm-latest';
    
    const results = await Promise.all(batches.map(async (batch) => {
        try {
            const completion = await openai.chat.completions.create({
                model: modelId,
                messages: [
                    { role: 'system', content: 'You are a concise technical writer.' },
                    { role: 'user', content: generatePrompt(batch) }
                ],
                temperature: 0.5,
                max_tokens: 300, // Small output = Fast response
            });
            return completion.choices[0]?.message?.content || '';
        } catch (e) {
            console.error('Batch failed', e);
            return '';
        }
    }));

    // 4. COMBINE & WRAP IN HTML
    // We stitch the bullet points together into your requested layout
    const allBullets = results.join('\n').replace(/```html/g, '').replace(/```/g, '');

    const finalHTML = `
      <div>
        <div class="mb-6 p-5 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <h3 class="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            Highlights & Updates
          </h3>
          <ul class="space-y-1">
            ${allBullets}
          </ul>
        </div>
        <p class="text-xs text-center text-slate-400 mt-2">
            Summarized ${topItems.length} updates using ${modelId}
        </p>
      </div>
    `;

    return NextResponse.json({ summary: finalHTML });

  } catch (error: any) {
    console.error('Summary Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
