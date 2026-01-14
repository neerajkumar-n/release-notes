import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || '',
  baseURL: process.env.AI_BASE_URL || 'https://grid.ai.juspay.net',
});

// Even though we aim for speed, we set this for Pro users
export const maxDuration = 30; 
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { items, weekDate } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summaryFragment: "" });
    }

    // STRICT SAFETY: If the client sends too many, we slice to prevent timeout
    const safeItems = items.slice(0, 15); 

    const list = safeItems.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');

    const prompt = `
      Analyze these Hyperswitch PRs (Week: ${weekDate}).
      
      OUTPUT FORMAT:
      - Return ONLY HTML <li> tags.
      - NO <br>, NO markdown, NO "Here is the list".
      - Format: <li class="text-sm mb-1"><strong class="text-slate-700 dark:text-slate-200">[Category]</strong>: Summary <span class="opacity-50 text-xs">#PR</span></li>
      - Categories: Highlights, Connectors, Core.
      
      Input:
      ${list}
    `;

    // Force "glm-latest" or your env model
    const modelId = process.env.AI_MODEL_ID || 'glm-latest';

    const completion = await openai.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: 'You are a strict HTML generator.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 600,
    });

    const rawContent = completion.choices[0]?.message?.content || '';
    
    // Clean up "Thinking" or Code Blocks
    // We look for the first <li> and take everything after it
    let cleanHtml = rawContent;
    const listStartIndex = rawContent.indexOf('<li');
    if (listStartIndex !== -1) {
        cleanHtml = rawContent.substring(listStartIndex);
    }
    // Remove closing code blocks if present
    cleanHtml = cleanHtml.replace(/```html/g, '').replace(/```/g, '');

    return NextResponse.json({ summaryFragment: cleanHtml });

  } catch (error: any) {
    console.error('Summary Fragment Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
