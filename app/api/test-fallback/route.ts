import { NextResponse } from 'next/server';
import { chatCompletionWithFallback, getModelId } from '@/lib/llm-client';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { testModel } = await req.json().catch(() => ({}));

  console.log('[TEST] Starting fallback test...');
  console.log('[TEST] Primary model:', testModel || getModelId());

  try {
    const completion = await chatCompletionWithFallback({
      model: testModel || getModelId(),
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "test successful" in JSON format: {"result": "..."}' }
      ],
      temperature: 0.1,
      max_tokens: 100,
      response_format: { type: "json_object" },
    });

    const response = completion.choices[0]?.message?.content;
    console.log('[TEST] Response:', response);

    return NextResponse.json({
      success: true,
      result: response,
      modelUsed: completion.model,
    });
  } catch (error: any) {
    console.error('[TEST] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
    }, { status: 500 });
  }
}

// GET endpoint for quick curl test
export async function GET() {
  return NextResponse.json({
    message: 'Send a POST request with { "testModel": "invalid-model-id" } to test fallback'
  });
}