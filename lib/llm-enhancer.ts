import OpenAI from 'openai';
import { chatCompletionWithFallback, getModelId } from './llm-client';

type ReleaseItem = {
  title: string;
  type: 'Feature' | 'Bug Fix';
  connector: string | null;
  prNumber?: string;
  prUrl?: string;
  originalDate: string;
};

type EnhancedReleaseItem = ReleaseItem & {
  enhancedTitle: string;
  description: string;
  businessImpact?: string;
};

/**
 * Enhances a batch of release items using LLM
 */
export async function enhanceReleaseItems(
  items: ReleaseItem[]
): Promise<EnhancedReleaseItem[]> {
  if (items.length === 0) return [];

  const modelId = process.env.AI_MODEL_ID || 'glm-latest';
  const temperature = parseFloat(process.env.AI_TEMPERATURE || '0.7');

  try {
    // Process items in smaller batches for reliability
    const batchSize = 5; // Smaller batch for this model
    const batches: ReleaseItem[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    const enhancedItems: EnhancedReleaseItem[] = [];

    for (const batch of batches) {
      const prompt = buildEnhancementPrompt(batch);

      const completion = await chatCompletionWithFallback({
        model: modelId,
        messages: [
          {
            role: 'system',
            content: `You are a technical product manager specializing in payment systems and developer tools. Your task is to enhance release notes to make them clear, professional, and valuable for product managers and business development teams.

IMPORTANT: Your response must be valid JSON only. Do not include any explanations, introductions, or additional text. Start directly with { and end with }.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: temperature,
        max_tokens: 2000, // Increased to prevent cutoff
      });

      const responseText = completion.choices[0]?.message?.content || '{}';

      // Try to extract JSON from response (handle verbose responses)
      let jsonString = responseText;

      // Look for JSON array or object
      const jsonArrayMatch = responseText.match(/\[[\s\S]*\]/);
      const jsonObjectMatch = responseText.match(/\{[\s\S]*\}/);

      if (jsonArrayMatch) {
        jsonString = jsonArrayMatch[0];
      } else if (jsonObjectMatch) {
        jsonString = jsonObjectMatch[0];
      }

      try {
        const response = JSON.parse(jsonString);

        // Handle both array and object responses
        let itemsArray: any[] = [];
        if (Array.isArray(response)) {
          itemsArray = response;
        } else if (response.enhanced_items && Array.isArray(response.enhanced_items)) {
          itemsArray = response.enhanced_items;
        } else if (response.items && Array.isArray(response.items)) {
          itemsArray = response.items;
        }

        if (itemsArray.length > 0) {
          // Map enhanced items back to original items
          const batchEnhanced = itemsArray.map((enhanced: any, idx: number) => {
            const original = batch[idx] || batch[0];
            return {
              ...original,
              enhancedTitle: enhanced.enhanced_title || enhanced.title || enhanced.enhancedTitle || original.title,
              description: enhanced.description || enhanced.desc || original.title,
              businessImpact: enhanced.business_impact || enhanced.impact || enhanced.businessImpact
            };
          });
          enhancedItems.push(...batchEnhanced);
        } else {
          // Fallback: use original items with basic enhancement
          enhancedItems.push(...batch.map(item => ({
            ...item,
            enhancedTitle: item.title,
            description: item.title
          })));
        }
      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError);
        console.error('Response text:', responseText.substring(0, 500));
        // Fallback: use original items
        enhancedItems.push(...batch.map(item => ({
          ...item,
          enhancedTitle: item.title,
          description: item.title
        })));
      }
    }

    return enhancedItems;
  } catch (error) {
    console.error('LLM Enhancement Error:', error);
    // Fallback: return items with minimal enhancement
    return items.map(item => ({
      ...item,
      enhancedTitle: item.title,
      description: item.title
    }));
  }
}

function buildEnhancementPrompt(items: ReleaseItem[]): string {
  const itemsList = items.map((item, index) => {
    return `
${index + 1}. Original: "${item.title}"
   Type: ${item.type}
   ${item.connector ? `Connector: ${item.connector}` : ''}
   PR: #${item.prNumber || 'N/A'}
`;
  }).join('\n');

  return `Enhance the following release notes. For each item, provide:

1. enhanced_title: A clear, professional title (5-10 words)
2. description: A detailed explanation of what changed (1-2 sentences)
3. business_impact: Why this matters to customers, if applicable

Guidelines:
- Use professional, business-friendly language
- Focus on user benefits and outcomes
- Avoid technical jargon where possible
- For bug fixes: describe what problem was solved
- For features: describe what capability is now available
- Keep descriptions concise but informative

Input items:${itemsList}

Respond with JSON array only:
[
  {
    "enhanced_title": "...",
    "description": "...",
    "business_impact": "..."
  }
]`;
}

/**
 * Enhances a single release item for real-time updates
 */
export async function enhanceSingleItem(
  item: ReleaseItem
): Promise<EnhancedReleaseItem> {
  const enhanced = await enhanceReleaseItems([item]);
  return enhanced[0];
}