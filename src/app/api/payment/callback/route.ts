// src/app/api/payment/callback/route.ts
// 🔥 FIXED: Auto-syncs calendar after successful payment

import { NextRequest, NextResponse } from 'next/server';
import { verifyPayment } from '@/lib/pesapal';
import { adminDb } from '@/lib/firebase-admin';
import { syncToGoogleCalendar } from '@/lib/google-calendar';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const orderTrackingId = searchParams.get('OrderTrackingId');
  
  if (!orderTrackingId) {
    return NextResponse.redirect(new URL('/payment/error', req.url));
  }
  
  try {
    console.log('🔍 Verifying payment:', orderTrackingId);
    
    // 1️⃣ VERIFY PAYMENT WITH PESAPAL
    const status = await verifyPayment(orderTrackingId);
    
    console.log('Payment status:', status.payment_status_description);
    
    // 2️⃣ UPDATE PAYMENT RECORD
    await adminDb.collection('payments').doc(orderTrackingId).update({
      status: status.payment_status_description.toLowerCase(),
      pesapalTransactionId: status.confirmation_code,
      updatedAt: new Date(),
    });
    
    // 3️⃣ IF SUCCESSFUL, DO EVERYTHING
    if (status.payment_status_description === 'Completed') {
      console.log('✅ Payment completed! Processing...');
      
      // Get payment details
      const paymentDoc = await adminDb.collection('payments').doc(orderTrackingId).get();
      const paymentData = paymentDoc.data();
      
      if (!paymentData) {
        throw new Error('Payment data not found');
      }
      
      // Calculate expiry (4 months from now)
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 4);
      
      // Update user
      await adminDb.collection('users').doc(paymentData.userId).update({
        isPaid: true,
        paymentExpiry: expiryDate,
      });
      
      console.log('✅ User payment status updated');
      
      // 🔥 AUTO-SYNC TO GOOGLE CALENDAR
      try {
        const userDoc = await adminDb.collection('users').doc(paymentData.userId).get();
        const userData = userDoc.data();
        
        if (!userData) {
          throw new Error('User data not found');
        }
        
        if (!userData.googleAccessToken) {
          console.warn('⚠️ No Google access token found. User needs to login first.');
          return NextResponse.redirect(new URL('/login?message=Please%20sign%20in%20with%20Google%20to%20sync%20your%20calendar', req.url));
        }
        
        if (!userData.timetable || userData.timetable.length === 0) {
          throw new Error('No timetable events found');
        }
        
        console.log('🔄 Syncing to Google Calendar...');
        
        // Default semester start (you can make this dynamic later)
        const semesterStart = new Date().toISOString().split('T')[0]; // Today
        
        const { success, eventIds } = await syncToGoogleCalendar(
          userData.googleAccessToken,
          userData.timetable,
          semesterStart
        );
        
        if (!success) {
          throw new Error('Calendar sync failed');
        }
        
        // Update timetable with Google event IDs
        const eventsWithIds = userData.timetable.map((event: any, i: number) => ({
          ...event,
          googleEventId: eventIds[i],
        }));
        
        await adminDb.collection('users').doc(paymentData.userId).update({
          timetable: eventsWithIds,
          lastSyncedAt: new Date(),
        });
        
        console.log('✅ Calendar synced!', eventIds.length, 'events created');
        
      } catch (syncError: any) {
        console.error('❌ Calendar sync failed:', syncError.message);
        // Don't fail the whole payment, just log it
        // User can manually sync from dashboard later
      }
    }
    
    // 4️⃣ REDIRECT TO SUCCESS PAGE
    return NextResponse.redirect(new URL('/success', req.url));
    
  } catch (error: any) {
    console.error('❌ Payment callback error:', error);
    return NextResponse.redirect(new URL('/error?message=' + encodeURIComponent(error.message), req.url));
  }
}