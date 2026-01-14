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

    // SAFETY: Even if the frontend sends too many, we slice to 15 to prevent crash.
    const safeItems = items.slice(0, 15); 

    const list = safeItems.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');

    const prompt = `
      Analyze these Hyperswitch PRs (Week: ${weekDate}).
      
      OUTPUT RULES:
      1. Return ONLY HTML <li> tags.
      2. NO introductory text, NO markdown, NO code blocks.
      3. Format: <li class="text-sm mb-1.5 leading-relaxed"><strong class="text-slate-800 dark:text-slate-200">[Category]</strong>: Summary <span class="opacity-60 text-xs ml-1">#PR</span></li>
      4. Categories: **Highlights**, **Connectors**, **Core**, **Experience**.
      
      Input Data:
      ${list}
    `;

    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL_ID || 'glm-latest',
      messages: [
        { role: 'system', content: 'You are a strict HTML generator. Output only <li> tags.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 700,
    });

    const rawContent = completion.choices[0]?.message?.content || '';
    
    // --- CLEANER: Remove "Thinking" text ---
    // We look for the first <li> tag and ignore everything before it.
    let cleanHtml = rawContent;
    const listStartIndex = rawContent.indexOf('<li');
    if (listStartIndex !== -1) {
        cleanHtml = rawContent.substring(listStartIndex);
    }
    
    // Remove any trailing code block markers
    cleanHtml = cleanHtml.replace(/```html/g, '').replace(/```/g, '');

    return NextResponse.json({ summaryFragment: cleanHtml });

  } catch (error: any) {
    console.error('Summary Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
