import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Initialize Google AI
const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { items, weekRange } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summary: "No items to summarize." });
    }

    // NEW: A much stricter prompt to match your sample style exactly
    const prompt = `
      You are a Product Manager at Hyperswitch. Write a weekly release summary based on these PRs.
      
      **Target Audience:** C-Level Executives (Focus on business value, not just code).
      **Date Range:** ${weekRange}

      **STRICT OUTPUT FORMAT (HTML ONLY):**
      
      1. **Header:** Start with <h2 class="text-xl font-bold mb-4 text-white">Weekly Report (${weekRange})</h2>
      
      2. **Highlights Section:** Pick the top 3-5 most impactful changes. Format them as:
         <h3 class="text-lg font-semibold text-purple-400 mt-6 mb-2">Highlights</h3>
         <ul class="list-disc pl-5 space-y-2 text-slate-300">
            <li><strong>Title:</strong> Description of value.</li>
         </ul>

      3. **Categorized Updates:** Group the rest under these exact headers:
         - "Connector expansions and enhancements"
         - "Customer and access management"
         - "Routing and core improvements"
         
         Format these sections as:
         <h3 class="text-lg font-semibold text-sky-400 mt-6 mb-2">Category Name</h3>
         <ul class="list-disc pl-5 space-y-2 text-slate-300">
            <li>
               <strong>Feature Name:</strong> The update description. 
               <span class="text-slate-500 text-xs ml-1">
                 [<a href="PR_URL" target="_blank" class="hover:text-sky-400 underline">#PR_NUMBER</a>]
               </span>
            </li>
         </ul>

      **Rules:**
      - Do NOT use markdown (no \`\`\` or **). Use real HTML tags.
      - Combine related PRs into one bullet point.
      - Keep descriptions concise but impactful.

      **Input Data:**
      ${JSON.stringify(items.map((i: any) => ({
        title: i.title,
        prNumber: i.prNumber,
        prUrl: i.prUrl
      })))}
    `;

    const response = await genai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const summary = response.response.text();
    // Clean up markdown if the AI adds it despite instructions
    const cleanSummary = summary.replace(/```html/g, '').replace(/```/g, '');

    return NextResponse.json({ summary: cleanSummary });

  } catch (error) {
    console.error('AI Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
