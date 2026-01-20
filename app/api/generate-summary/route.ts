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

    // Limit items context to avoid token limits
    const safeItems = items.slice(0, 20); 
    const list = safeItems.map((i: any) => `- [${i.connector || 'Core'}] ${i.title} (PR #${i.prNumber})`).join('\n');

    const prompt = `
      You are a Frontend UI Generator for Hyperswitch. 
      Analyze these Pull Requests for the week of ${weekDate} and output a specific HTML structure using Tailwind CSS.
      
      INPUT DATA:
      ${list}

      OUTPUT RULES:
      1.  **Highlights Section:** Pick top 3 impactful items. Use the "Weekly Highlights" gradient card structure provided below.
      2.  **Categorization:** Group remaining items into "Connectors" and "Core & Platform".
      3.  **Links:** Convert (PR #123) into the specific pill-style <a> tag: 
          <a href="https://github.com/juspay/hyperswitch/pull/123" target="_blank" class="...">...</a>
      4.  **Tone:** Professional, concise, executive summary style.

      REQUIRED HTML TEMPLATE (Strictly follow this structure):
      
      <div class="space-y-8">
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-b from-indigo-50/80 to-white dark:from-indigo-950/30 dark:to-slate-900/40 border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
           <div class="p-6 relative z-10">
              <h3 class="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-5">Weekly Highlights</h3>
              <div class="grid gap-4 sm:grid-cols-3">
                 <div class="flex flex-col gap-1.5 p-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-indigo-50 dark:border-indigo-500/10">
                    <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Category Name</span>
                    <p class="text-sm text-slate-600 dark:text-slate-400 leading-snug">Summary text here.</p>
                 </div>
              </div>
           </div>
        </div>

        <div class="space-y-4">
            <h4 class="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Connectors</h4>
            <div class="grid gap-4 md:grid-cols-2">
                <div class="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <div class="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span class="font-bold text-slate-900 dark:text-white text-sm">Connector Name</span>
                    </div>
                    <ul class="space-y-3">
                        <li class="flex flex-col gap-1">
                            <span class="text-sm text-slate-600 dark:text-slate-300">Description of change</span>
                            <a href="..." class="w-fit text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors flex items-center gap-1">
                                #PR_NUMBER
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
        
        </div>

      Return ONLY valid JSON: { "html": "..." }
    `;

    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL_ID || 'gpt-4-turbo', // Ensure model is capable of complex HTML
      messages: [
        { role: 'system', content: 'You are a JSON generator that outputs Tailwind HTML.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }, 
    });

    const rawContent = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent);

    return NextResponse.json({ summaryFragment: parsed.html });

  } catch (error: any) {
    console.error('Summary Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
