import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Google AI with the standard library
const genai = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { items, weekRange } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summary: "No items to summarize." });
    }

    const prompt = `
      You are a Product Manager at Hyperswitch. Write a weekly release summary.
      
      **Target Audience:** C-Level Executives.
      **Date Range:** ${weekRange}

      **STRICT OUTPUT FORMAT (HTML ONLY):**
      
      1. **Header:** <h2 class="text-2xl font-bold mb-6 text-white border-b border-slate-700 pb-2">Weekly Report (${weekRange})</h2>
      
      2. **Highlights:** Pick the top 3 impactful changes.
         <h3 class="text-lg font-semibold text-purple-400 mt-6 mb-3 uppercase tracking-wider">Highlights</h3>
         <ul class="list-disc pl-5 space-y-2 text-slate-300">
            <li><strong>Title:</strong> Description.</li>
         </ul>

      3. **Categories:** Group the rest under: "Connector expansions", "Customer access", "Core improvements".
         <h3 class="text-lg font-semibold text-sky-400 mt-6 mb-3 uppercase tracking-wider">Category Name</h3>
         <ul class="list-disc pl-5 space-y-2 text-slate-300">
            <li>
               <strong>Feature:</strong> Description. 
               <span class="text-slate-500 text-xs ml-1 whitespace-nowrap">
                 [<a href="PR_URL" target="_blank" class="hover:text-sky-400 underline decoration-slate-700">#PR_NUMBER</a>]
               </span>
            </li>
         </ul>

      **Rules:**
      - Return ONLY HTML. No markdown backticks.
      - Combine related PRs.

      **Input Data:**
      ${JSON.stringify(items.map((i: any) => ({
        title: i.title,
        prNumber: i.prNumber,
        prUrl: i.prUrl
      })))}
    `;

    const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const summary = result.response.text();
    
    const cleanSummary = summary.replace(/```html/g, '').replace(/```/g, '');

    return NextResponse.json({ summary: cleanSummary });

  } catch (error) {
    console.error('AI Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
