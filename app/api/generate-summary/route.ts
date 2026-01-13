import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Configure the client to use Groq's servers
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function POST(req: Request) {
  try {
    const { items, weekRange } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ summary: "No items to summarize." });
    }

    const prompt = `
      You are a Senior Technical Product Manager at Hyperswitch. 
      Your goal is to summarize the following list of release notes for C-Level executives.
      
      **Time Range:** ${weekRange}

      **Strict Instructions:**
      1. **Categorize:** Group items into "Global Connectivity", "Core Platform & Reliability", and "Merchant Experience".
      2. **Summarize:** Combine related PRs into single, high-impact bullet points.
      3. **Business Value:** Focus on the "Why" (e.g., "Improved conversion" instead of "Refactored code").
      4. **CITATIONS ARE MANDATORY:** You MUST include the PR links at the end of every bullet point. 
         - Format: <a href="PR_URL" target="_blank">[#PR_NUMBER]</a>
      5. **Output Format:** Return ONLY clean HTML (no markdown backticks). Use <h3> for headers and <ul>/<li> for items.

      **Input Data (JSON):**
      ${JSON.stringify(items.map((i: any) => ({
        title: i.title,
        prNumber: i.prNumber,
        prUrl: i.prUrl
      })))}
    `;

    const completion = await client.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      // "llama-3.3-70b-versatile" is their best free model (Smart & Fast)
      model: "llama-3.3-70b-versatile",
      temperature: 0.5,
    });

    const summary = completion.choices[0].message.content || "";
    const cleanSummary = summary.replace(/```html/g, '').replace(/```/g, '');

    return NextResponse.json({ summary: cleanSummary });

  } catch (error) {
    console.error('Groq API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    );
  }
}
