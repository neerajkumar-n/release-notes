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

    // Safety slice to prevent timeouts if frontend sends too much
    const safeItems = items.slice(0, 15); 
    const list = safeItems.map((i: any) => `- ${i.title} (PR #${i.prNumber})`).join('\n');

    // NEW PROMPT: Force JSON Output
    // This is the "Muzzle" that stops the AI from talking.
    const prompt = `
      Analyze these Hyperswitch PRs (Week: ${weekDate}).
      
      TASK:
      Summarize the business value of these updates into 3-4 bullet points.
      Group them logically (e.g., Highlights, Connectors, Core).
      
      OUTPUT FORMAT:
      You must return a STRICT JSON object with a single key "html".
      The value must be a string containing ONLY HTML <li> tags.
      
      Example JSON:
      {
        "html": "<li class='text-sm mb-1'><strong>Connectors</strong>: Added support for X <span class='opacity-50'>#123</span></li>..."
      }
      
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
      response_format: { type: "json_object" }, // This forces the model to be compliant
    });

    const rawContent = completion.choices[0]?.message?.content || '{}';
    
    // --- PARSE THE CLEAN DATA ---
    let cleanHtml = '';
    try {
        // 1. Try strict JSON parse
        const parsed = JSON.parse(rawContent);
        if (parsed.html) cleanHtml = parsed.html;
    } catch (e) {
        // 2. Fallback: If model added markdown text around the JSON, extract the JSON part
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
    
    // Final Cleanup: Remove any leftover markdown formatting if it leaked into the string
    cleanHtml = cleanHtml.replace(/```html/g, '').replace(/```/g, '');

    return NextResponse.json({ summaryFragment: cleanHtml });

  } catch (error: any) {
    console.error('Summary Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
