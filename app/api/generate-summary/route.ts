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

    // STRICT SAFETY: Limit input to prevent timeouts.
    // The client handles batching, but if a huge payload hits, we slice it.
    const safeItems = items.slice(0, 15); 

    const list = safeItems.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');

    const prompt = `
      Analyze these Hyperswitch PRs (Week: ${weekDate}).
      
      OUTPUT INSTRUCTIONS:
      - Return ONLY HTML <li> tags.
      - NO introductory text ("Here is the list...").
      - NO markdown formatting (\`\`\`).
      - Format: <li class="text-sm mb-1.5 leading-relaxed"><strong class="text-slate-800 dark:text-slate-200">[Category]</strong>: Business value summary <span class="opacity-60 text-xs ml-1">#PR</span></li>
      - Categories: **Highlights**, **Connectors**, **Core**.
      
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
      max_tokens: 600,
    });

    const rawContent = completion.choices[0]?.message?.content || '';
    
    // --- CLEANER: STRIP "THINKING" TEXT ---
    // If the model generates "Sure! Here is the list...", we want to delete that.
    // We look for the first occurrence of "<li" and keep everything after it.
    let cleanHtml = rawContent;
    const listStartIndex = rawContent.indexOf('<li');
    if (listStartIndex !== -1) {
        cleanHtml = rawContent.substring(listStartIndex);
    }
    
    // Remove closing code blocks or end text
    cleanHtml = cleanHtml.replace(/```html/g, '').replace(/```/g, '');
    
    // Final sanity check: If it doesn't look like HTML, return nothing to avoid UI ugliness
    if (!cleanHtml.includes('<li')) {
        return NextResponse.json({ summaryFragment: '' });
    }

    return NextResponse.json({ summaryFragment: cleanHtml });

  } catch (error: any) {
    console.error('Summary Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
