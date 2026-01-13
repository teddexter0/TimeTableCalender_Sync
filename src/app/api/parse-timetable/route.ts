import { NextRequest, NextResponse } from 'next/server';

async function parseWithAnthropic(base64Data: string): Promise<any> {
  // 🚀 Use the 2026 production model ID
  const modelId = 'claude-sonnet-4-5-20250929'; 

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!.trim(),
      'anthropic-version': '2023-06-01',
      // 🔥 CRITICAL: Organization Header for Org accounts
      'anthropic-organization': process.env.ANTHROPIC_ORG_ID!.trim(), 
      'anthropic-beta': 'pdfs-2024-09-25',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Data }
          },
          {
            type: 'text',
            text: 'Extract the classes from this timetable PDF as a JSON array. Return ONLY JSON.'
          }
        ]
      }]
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('❌ Anthropic Error Detail:', JSON.stringify(result, null, 2));
    throw new Error(result.error?.message || 'API Error');
  }

  const text = result.content[0].text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const events = await parseWithAnthropic(buffer.toString('base64'));

    return NextResponse.json({ events });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}