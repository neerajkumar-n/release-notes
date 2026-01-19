import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || '',
  baseURL: process.env.AI_BASE_URL || 'https://grid.ai.juspay.net',
});

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { items } = await req.json();

    if (!items || items.length === 0) return NextResponse.json({ classifications: [] });

    const inputList = items.map((i: any) => `ID:${i.prNumber} Title:${i.title}`).join('\n');

    // NEW STRATEGY: Categorize by "Nature of Impact"
    const prompt = `
      Analyze these Hyperswitch PRs and classify them into exactly one of these 3 distinct buckets based on their IMPACT:

      1. 'connectivity': 
         - ANY update related to a specific Payment Connector (Adyen, Stripe, Worldpay, etc.).
         - Wallets (Google Pay, Apple Pay) or Payment Methods.
         - *SubGroup Name:* The name of the Connector (e.g., "Adyen", "PayPal").

      2. 'experience': 
         - Updates that a Merchant/User would visually see or interact with.
         - Dashboard, Analytics, User Authentication, Onboarding, Reporting, Audit Logs.
         - *SubGroup Name:* The Feature Area (e.g., "Analytics", "User Auth").

      3. 'core': 
         - Low-level system components, Routing logic, Database changes, Refactoring, CI/CD.
         - Things that happen "under the hood" that a user doesn't directly "click".
         - *SubGroup Name:* The Component (e.g., "Routing", "Infra", "Database").

      Output strictly a JSON object:
      {
        "classifications": [
          { "prNumber": "123", "category": "connectivity", "subGroup": "Adyen" }
        ]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL_ID || 'glm-latest',
      messages: [
        { role: 'system', content: 'You are a product classification engine.' },
        { role: 'user', content: prompt + "\n\nInput:\n" + inputList }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const cleanRaw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanRaw);

    return NextResponse.json(parsed);

  } catch (error) {
    console.error('Categorization Error:', error);
    return NextResponse.json({ classifications: [] });
  }
}
