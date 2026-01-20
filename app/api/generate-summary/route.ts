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

    const safeItems = items.slice(0, 35); 
    const list = safeItems.map((i: any) => `- [${i.connector || 'Core'}] ${i.title} (PR #${i.prNumber})`).join('\n');

    // --- PROMPT WITH FIXED DARK MODE COLORS ---
    const prompt = `
      You are a Release Notes UI Generator.
      Analyze these Hyperswitch Pull Requests (Week: ${weekDate}).
      
      INPUT DATA:
      ${list}

      INSTRUCTIONS:
      1. **Highlights:** Pick the top 3 most impactful changes.
      2. **Categorization:** Group remaining items into "Connectors" and "Core & Platform".
      3. **Structure:** Create ONE unified card per category.
      4. **Links:** Convert PR numbers into interactive "Pills".

      OUTPUT FORMAT:
      Return ONLY a JSON object: { "html": "..." } containing this EXACT Tailwind HTML structure. 
      Use the provided dark mode classes to ensure visibility.

      <div class="flex flex-col gap-6">
        
        <div class="rounded-xl bg-gradient-to-br from-indigo-50/80 to-white/80 dark:from-slate-800 dark:to-slate-900/80 border border-indigo-100/80 dark:border-slate-700 p-6 shadow-sm backdrop-blur-sm">
           <h3 class="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-indigo-500"></span> Weekly Highlights
           </h3>
           <div class="grid gap-4 sm:grid-cols-3">
              <div class="space-y-1.5">
                 <div class="text-xs font-bold text-slate-800 dark:text-slate-200">Category</div>
                 <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                    Brief summary of the highlight.
                 </p>
              </div>
           </div>
        </div>

        <div class="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 shadow-sm overflow-hidden backdrop-blur-sm">
            <div class="bg-slate-50/80 dark:bg-slate-800/80 px-4 py-3 border-b border-slate-100 dark:border-slate-700/60 flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <h4 class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Connectors</h4>
            </div>
            
            <div class="divide-y divide-slate-100 dark:divide-slate-700/60">
                <div class="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                    <div class="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
                        <span class="shrink-0 w-36 text-sm font-bold text-slate-800 dark:text-slate-200">Connector Name</span>
                        <div class="flex-1 space-y-2.5">
                            <div class="flex items-start justify-between gap-4 relative z-10">
                                <span class="text-sm font-medium text-slate-600 dark:text-slate-300 leading-snug">Description of the change</span>
                                <a href="https://github.com/juspay/hyperswitch/pull/PR_NUMBER" target="_blank" class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100/80 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20 text-[10px] font-mono font-bold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                                    #PR_NUMBER
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 shadow-sm overflow-hidden backdrop-blur-sm">
             <div class="bg-slate-50/80 dark:bg-slate-800/80 px-4 py-3 border-b border-slate-100 dark:border-slate-700/60 flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                <h4 class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Core & Platform</h4>
            </div>
            <div class="divide-y divide-slate-100 dark:divide-slate-700/60">
                <div class="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                     <div class="flex items-start justify-between gap-4 relative z-10">
                        <span class="text-sm font-medium text-slate-600 dark:text-slate-300 leading-snug">Description of core change</span>
                         <a href="https://github.com/juspay/hyperswitch/pull/PR_NUMBER" target="_blank" class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 text-purple-600 border border-purple-100/80 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 text-[10px] font-mono font-bold hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors">
                            #PR_NUMBER
                        </a>
                     </div>
                </div>
            </div>
        </div>

      </div>
    `;

    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL_ID || 'gpt-4-turbo', 
      messages: [
        { role: 'system', content: 'You are a JSON generator that outputs Tailwind HTML.' },
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
            try { const parsed = JSON.parse(jsonMatch[0]); if(parsed.html) cleanHtml = parsed.html; } catch (e) {}
        }
    }
    
    cleanHtml = cleanHtml.replace(/```html/g, '').replace(/```/g, '');

    return NextResponse.json({ summaryFragment: cleanHtml });

  } catch (error: any) {
    console.error('Summary Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
