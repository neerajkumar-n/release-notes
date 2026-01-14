import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Octokit } from 'octokit';

// 1. Initialize Clients
const genai = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY || '');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN }); // Ensure this ENV is set

// Configuration
const REPO_OWNER = 'juspay'; // Replace with your actual owner (e.g., 'juspay' or your username)
const REPO_NAME = 'hyperswitch';     // Replace with your actual repo name

export async function GET(req: Request) {
  try {
    // 2. Parse Query Params
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing dates' }, { status: 400 });
    }

    // 3. Fetch Commits from GitHub (The "Raw Data")
    // We increase per_page to ensure we capture enough context
    const commitsRes = await octokit.request('GET /repos/{owner}/{repo}/commits', {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      since: new Date(startDate).toISOString(),
      until: new Date(endDate).toISOString(),
      per_page: 100 
    });

    const rawCommits = commitsRes.data;

    // 4. Transform to your "ReleaseItem" format
    // This allows the Frontend List View to work perfectly
    const items = rawCommits.map((commit: any) => {
      const msg = commit.commit.message.split('\n')[0]; // First line only
      
      // Basic detection logic (You can refine this)
      const isFix = msg.toLowerCase().startsWith('fix');
      const type = isFix ? 'Bug Fix' : 'Feature';
      
      // Attempt to extract Connector name (e.g., "feat(stripe):")
      const scopeMatch = msg.match(/\(([^)]+)\):/);
      const connector = scopeMatch ? scopeMatch[1] : null;

      // Extract PR number if available in message
      const prMatch = msg.match(/\(#(\d+)\)/);
      const prNumber = prMatch ? prMatch[1] : null;

      return {
        title: msg,
        type,
        connector,
        prNumber,
        prUrl: commit.html_url,
        originalDate: commit.commit.author.date,
        version: null // We don't have tags here, keeping null for now
      };
    });

    if (items.length === 0) {
      return NextResponse.json({ summary: "<p>No updates in this period.</p>", items: [] });
    }

    // 5. Generate AI Summary (The "Executive View")
    const prompt = `
      You are a Product Manager. Write a release summary for ${startDate} to ${endDate}.
      
      **STRICT HTML OUTPUT (Tailwind CSS classes):**
      
      1. **Highlights:**
         <div class="mb-8">
           <h3 class="text-xl font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">Highlights</h3>
           <ul class="space-y-4">
             <li class="text-slate-600 dark:text-slate-300 text-base">
               <strong class="text-sky-600 dark:text-sky-400 block mb-1">Title of Feature:</strong>
               Description of value.
             </li>
           </ul>
         </div>

      2. **Categorized Updates:**
         Group into: "Global Connectivity", "Merchant Experience", "Core Platform".
         <div class="mb-6">
           <h3 class="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">Category Name</h3>
           <ul class="space-y-3 pl-0">
             <li class="text-slate-600 dark:text-slate-300 text-sm">
               <strong class="text-slate-900 dark:text-white">Feature Name:</strong> 
               Description.
             </li>
           </ul>
         </div>

      **Input Data:**
      ${JSON.stringify(items.map((i: any) => i.title).slice(0, 50))} 
    `;

    const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const summaryText = result.response.text();
    
    // Clean markdown if AI adds it
    const cleanSummary = summaryText.replace(/```html/g, '').replace(/```/g, '');

    // 6. Return EVERYTHING
    return NextResponse.json({ 
      summary: cleanSummary, 
      items: items 
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
