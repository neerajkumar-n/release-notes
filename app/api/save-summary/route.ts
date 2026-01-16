import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// This API only works in Local Development (Node.js environment)
// It writes the AI-generated summary to your file system.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ skipped: true, reason: 'Production is read-only' });
  }

  try {
    const { id, summary } = await req.json();
    
    // Path to your cache file
    const filePath = path.join(process.cwd(), 'app/data/summary-cache.json');
    
    // Read existing
    let cache = {};
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      cache = JSON.parse(fileContent || '{}');
    }

    // Update
    cache = { ...cache, [id]: summary };

    // Write back
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to save cache:', error);
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}
