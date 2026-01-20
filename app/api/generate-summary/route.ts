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

    // Limit context to prevent token overflow
    const safeItems = items.slice(0, 25); 
    const list = safeItems.map((i: any) => `- [${i.connector || 'Core'}] ${i.title} (PR #${i.prNumber})`).join('\n');

    const prompt = `
      You are a Frontend UI Generator for Hyperswitch. 
      Analyze these Pull Requests for the week of ${weekDate}.
      
      INPUT DATA:
      ${list}

      INSTRUCTIONS:
      1.  **Highlights Section:** Identify the 3 most significant changes.
      2.  **Categorization:** Group the rest into "Connectors" and "Core & Platform".
      3.  **Links:** You must use the provided PR number to create links.
      
      OUTPUT FORMAT:
      Return ONLY a JSON object with a single key "html" containing a string of HTML.
      The HTML must use the following Tailwind CSS structure EXACTLY:

      <div class="space-y-8">
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-b from-indigo-50/80 to-white dark:from-indigo-950/30 dark:to-slate-900/40 border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
           <div class="p-6 relative z-10">
              <h3 class="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-5 flex items-center gap-2">
                <span class="p-1 bg-indigo-100 dark:bg-indigo-500/20 rounded-md">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                </span>
                Weekly Highlights
              </h3>
              <div class="grid gap-4 sm:grid-cols-3">
                 <div class="flex flex-col gap-1.5 p-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-indigo-50 dark:border-indigo-500/10">
                    <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Category Name</span>
                    <p class="text-sm text-slate-600 dark:text-slate-400 leading-snug">Summary text here.</p>
                 </div>
              </div>
           </div>
        </div>

        <div class="space-y-4">
            <h4 class="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Connectors
            </h4>
            <div class="grid gap-4 md:grid-cols-2">
                <div class="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-indigo-500/30 transition-all">
                    <div class="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span class="font-bold text-slate-900 dark:text-white text-sm">Connector Name</span>
                    </div>
                    <ul class="space-y-3">
                        <li class="flex flex-col gap-1">
                            <span class="text-sm text-slate-600 dark:text-slate-300">Description of change</span>
                            <a href="https://github.com/juspay/hyperswitch/pull/PR_NUMBER" target="_blank" class="w-fit text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg> 
                                #PR_NUMBER
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
        
        <div class="space-y-4">
            <h4 class="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                Core & Platform
            </h4>
             </div>
      </div>
    `;

    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL_ID || 'gpt-4-turbo', 
      messages: [
        { role: 'system', content: 'You are a JSON generator that outputs specific Tailwind HTML structures.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }, 
    });

    const rawContent = completion.choices[0]?.message?.content || '{}';
    
    let cleanHtml = '';
    try {
        const parsed = JSON.parse(rawContent);
        if (parsed.html) cleanHtml = parsed.html;
    } catch (e) {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.html) cleanHtml = parsed.html;
            } catch (innerE) {
                console.error("Failed to parse fallback JSON");
            }
        }
    }
    
    cleanHtml = cleanHtml.replace(/```html/g, '').replace(/```/g, '');

    return NextResponse.json({ summaryFragment: cleanHtml });

  } catch (error: any) {
    console.error('Summary Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
