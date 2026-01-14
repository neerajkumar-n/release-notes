import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || '',
  baseURL: process.env.AI_BASE_URL || 'https://grid.ai.juspay.net',
});

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { items, weekDate } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summary: "<p>No items to summarize.</p>" });
    }

    // Prepare the input list for the AI
    const inputList = items.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');

    // STRICT PROMPT: Mimics your manual example structure
    const prompt = `
      You are writing the official weekly release notes for Hyperswitch.
      
      **Context:**
      - Week of: ${weekDate}
      - Audience: Merchant Business Heads and Product Managers.
      - Goal: Summarize technical PRs into business value.

      **Input Data (PR Titles):**
      ${inputList}

      **Instructions:**
      1. Analyze all PRs to identify 3-4 major themes.
      2. Group related connectors (e.g., "Adyen and Barclaycard", "Stripe and Redsys").
      3. Create a "Highlights" section for the top 3-4 most impactful changes.
      4. Categorize the rest into: "Connector expansions and enhancements", "Customer and access management", "Routing and core improvements".
      
      **Strict HTML Output Format (Do not use Markdown, return only the HTML div):**
      
      <div>
        <div class="mb-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-sky-500"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
            Highlights
          </h3>
          <ul class="space-y-2">
            <li class="text-slate-700 dark:text-slate-300 text-sm leading-relaxed flex gap-2">
              <span class="text-sky-500 font-bold">•</span>
              <span>[Highlight 1: Broad impact statement]</span>
            </li>
            <li class="text-slate-700 dark:text-slate-300 text-sm leading-relaxed flex gap-2">
              <span class="text-sky-500 font-bold">•</span>
              <span>[Highlight 2]</span>
            </li>
             <li class="text-slate-700 dark:text-slate-300 text-sm leading-relaxed flex gap-2">
              <span class="text-sky-500 font-bold">•</span>
              <span>[Highlight 3]</span>
            </li>
          </ul>
        </div>

        <div class="mb-6">
          <h4 class="text-sm font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20 pb-2 mb-4">
            Connector expansions and enhancements
          </h4>
          
          <div class="mb-4">
            <strong class="block text-slate-900 dark:text-white text-sm mb-1">[Connector A & Connector B]: [Theme of update]</strong>
            <ul class="pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-2">
              <li class="text-sm text-slate-600 dark:text-slate-400">
                [Detailed explanation of the change]
                <a href="https://github.com/juspay/hyperswitch/pull/[PR_NUMBER]" target="_blank" class="text-xs text-sky-600 hover:underline ml-1">#[PR_NUMBER]</a>
              </li>
            </ul>
          </div>
        </div>

        <div class="mb-6">
          <h4 class="text-sm font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400 border-b border-purple-500/20 pb-2 mb-4">
            Customer and access management
          </h4>
          </div>

        <div class="mb-6">
          <h4 class="text-sm font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 border-b border-indigo-500/20 pb-2 mb-4">
            Routing and core improvements
          </h4>
           </div>
      </div>
    `;

    const modelId = process.env.AI_MODEL_ID || 'gpt-4o'; // Use a smart model for grouping
    
    const completion = await openai.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: 'system',
          content: 'You are a Product Manager technical writer. You synthesize lists of PRs into cohesive, professional release notes.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5, // Lower temperature for more consistent formatting
    });

    const summaryHTML = completion.choices[0]?.message?.content || '';
    
    // Clean up if the LLM wraps it in markdown code blocks
    const cleanHTML = summaryHTML.replace(/```html/g, '').replace(/```/g, '').trim();

    return NextResponse.json({ summary: cleanHTML });

  } catch (error) {
    console.error('AI Summary Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
