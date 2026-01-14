import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client with LiteLLM configuration
const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || '',
  baseURL: process.env.AI_BASE_URL || 'https://grid.ai.juspay.net',
});

export async function POST(req: Request) {
  try {
    const { items, weekRange } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summary: "No items to summarize." });
    }

    // STRICT PROMPT: Forces the exact "Highlights" + "Category" structure
    const prompt = `
      You are a Product Manager at Hyperswitch. Write a release summary for: ${weekRange}.

      **STRICT HTML OUTPUT FORMAT (No Markdown):**

      1. **Highlights Section:**
         <div class="mb-8">
           <h3 class="text-xl font-bold text-white mb-4 border-b border-slate-700 pb-2">Highlights</h3>
           <ul class="space-y-4">
             <li class="text-slate-300 text-base">
               <strong class="text-purple-400 block mb-1">Feature Title:</strong>
               Feature Description goes here.
             </li>
           </ul>
         </div>

      2. **Categorized Updates:**
         Group remaining items into: "Connector expansions", "Customer access", "Core improvements".
         <div class="mb-6">
           <h3 class="text-lg font-bold text-sky-400 mb-3 uppercase tracking-wide">Category Name</h3>
           <ul class="space-y-3 pl-0">
             <li class="text-slate-300 text-sm">
               <strong class="text-white">Feature Name:</strong>
               Description text.
               <span class="inline-block ml-2 opacity-60 text-xs">
                 [<a href="PR_URL" target="_blank" class="hover:text-sky-400 underline">#PR_NUMBER</a>]
               </span>
             </li>
           </ul>
         </div>

      **Content Rules:**
      - Combine related PRs into single impactful points.
      - Focus on business value (Why it matters).
      - Ensure every item has a PR link citation.

      **Input Data:**
      ${JSON.stringify(items.map((i: any) => ({
        title: i.title,
        prNumber: i.prNumber,
        prUrl: i.prUrl
      })))}
    `;

    const modelId = process.env.AI_MODEL_ID || 'openai/qwen3-coder-480b';
    const maxTokens = parseInt(process.env.AI_MAX_TOKENS || '32768', 10);
    const temperature = parseFloat(process.env.AI_TEMPERATURE || '0.7');

    const completion = await openai.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful product manager who writes clear, professional release summaries.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: maxTokens,
      temperature: temperature,
    });

    const summary = completion.choices[0]?.message?.content || '';

    // Clean up potential markdown
    const cleanSummary = summary.replace(/```html/g, '').replace(/```/g, '');

    return NextResponse.json({ summary: cleanSummary });

  } catch (error) {
    console.error('AI Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
