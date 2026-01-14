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

    // 1. BATCHING
    const BATCH_SIZE = 15; // Increased slightly for efficiency
    const batches = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    // 2. PROMPT WITH EXTRACTION TAGS
    const generatePrompt = (batchItems: any[]) => {
      const list = batchItems.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');
      return `
        Analyze these Hyperswitch PRs for the week of ${weekDate}.
        
        Generate concise HTML <li> items summarizing the business value.
        Group into: **Highlights**, **Connectors**, or **Core**.
        
        IMPORTANT: You may "think" out loud, but you MUST wrap your final HTML output inside <RESULT> tags.
        
        Example Output:
        <RESULT>
        <li class="text-sm mb-1"><strong class="text-slate-700 dark:text-slate-200">Connectors</strong>: Added support for X <span class="opacity-50 text-xs">#123</span></li>
        </RESULT>
        
        Input Data:
        ${list}
      `;
    };

    // 3. PARALLEL EXECUTION
    const modelId = process.env.AI_MODEL_ID || 'glm-latest';
    
    const results = await Promise.all(batches.map(async (batch) => {
        try {
            const completion = await openai.chat.completions.create({
                model: modelId,
                messages: [
                    { role: 'system', content: 'You are a strict HTML generator.' },
                    { role: 'user', content: generatePrompt(batch) }
                ],
                temperature: 0.3,
                max_tokens: 1000, 
            });
            
            const rawContent = completion.choices[0]?.message?.content || '';
            
            // 4. THE CLEANING REGEX (Removes "Thinking")
            // This looks for <RESULT>...content...</RESULT> and grabs the content.
            const match = rawContent.match(/<RESULT>([\s\S]*?)<\/RESULT>/i);
            
            if (match && match[1]) {
                return match[1].trim();
            }
            
            // Fallback: If AI forgot tags, try to strip code blocks
            return rawContent.replace(/```html/g, '').replace(/```/g, '').trim();
            
        } catch (e) {
            console.error('Batch failed', e);
            return '';
        }
    }));

    // 5. ASSEMBLE
    let rawHtml = results.join('\n');

    const finalHTML = `
      <div class="space-y-4">
        <div class="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
          <ul class="space-y-3 pl-2 list-none">
            ${rawHtml}
          </ul>
        </div>
        <p class="text-[10px] text-center text-slate-400 opacity-60 font-mono mt-2">
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
