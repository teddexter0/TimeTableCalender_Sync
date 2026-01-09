import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { syncToGoogleCalendar } from '@/lib/google-calendar';

export async function POST(req: NextRequest) {
  try {
    const { userId, events, semesterStart } = await req.json();
    
    // Get user from Firebase
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const user = userDoc.data();
    
    if (!user || !user.isPaid) {
      return NextResponse.json({ error: 'Payment required' }, { status: 402 });
    }
    
    // Sync to Google Calendar
    const { success, eventIds } = await syncToGoogleCalendar(
      user.googleAccessToken,
      events,
      semesterStart
    );
    
    if (!success) {
      return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
    }
    
    // Update user record with event IDs
    const eventsWithIds = events.map((event: any, i: number) => ({
      ...event,
      googleEventId: eventIds[i],
    }));
    
    await adminDb.collection('users').doc(userId).update({
      timetable: eventsWithIds,
      lastSyncedAt: new Date(),
    });
    
    return NextResponse.json({ success: true, syncedEvents: eventIds.length });
    
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
