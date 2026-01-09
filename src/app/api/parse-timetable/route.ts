import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Convert to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    
    // Parse with GPT-4 Vision
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract ALL classes from this university timetable. Return ONLY valid JSON array:
[{
  "day": "Monday|Tuesday|Wednesday|Thursday|Friday",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "courseCode": "BBIT 2101",
  "subject": "Database Systems",
  "venue": "MSB 8",
  "lecturer": "Dr. Kamau"
}]

Be thorough. Extract every class.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 4096,
    });
    
    const content = completion.choices[0].message.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse timetable' }, { status: 400 });
    }
    
    const events = JSON.parse(jsonMatch[0]);
    
    return NextResponse.json({ events });
    
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json({ error: 'Parsing failed' }, { status: 500 });
  }
}