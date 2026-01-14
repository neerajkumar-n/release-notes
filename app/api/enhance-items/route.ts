import { NextResponse } from 'next/server';
import { enhanceReleaseItems } from '@/lib/llm-enhancer';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { items } = await req.json();

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid items' }, { status: 400 });
    }

    const enhancedItems = await enhanceReleaseItems(items);

    return NextResponse.json({ items: enhancedItems });
  } catch (error) {
    console.error('Enhance items error:', error);
    return NextResponse.json({ error: 'Failed to enhance items' }, { status: 500 });
  }
}