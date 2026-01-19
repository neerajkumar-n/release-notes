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

    const safeItems = items.slice(0, 15); 
    const list = safeItems.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');

    // UPDATED PROMPT: Forces <a> tags for PR links
    const prompt = `
      Analyze these Hyperswitch PRs (Week: ${weekDate}).
      
      OUTPUT INSTRUCTIONS:
      1. Return ONLY HTML <li> tags.
      2. Format: <li class="text-sm mb-1.5 leading-relaxed"><strong class="text-slate-800 dark:text-slate-200">[Category]</strong>: Summary <a href="https://github.com/juspay/hyperswitch/pull/PR_NUMBER" target="_blank" class="text-xs text-sky-600 hover:underline opacity-80 ml-1">#PR_NUMBER</a></li>
      3. Categories: **Highlights**, **Connectors**, **Core**, **Experience**.
      4. IMPORTANT: You MUST generate the link using the PR number provided in the input.
      5. Return ONLY JSON: { "html": "..." }
      
      Input Data:
      ${list}
    `;

    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL_ID || 'glm-latest',
      messages: [
        { role: 'system', content: 'You are a JSON-only generator.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 800,
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
