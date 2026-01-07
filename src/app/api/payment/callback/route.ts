import { NextRequest, NextResponse } from 'next/server';
import { verifyPayment } from '@/lib/pesapal';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const orderTrackingId = searchParams.get('OrderTrackingId');
  
  if (!orderTrackingId) {
    return NextResponse.redirect(new URL('/payment/error', req.url));
  }
  
  try {
    const status = await verifyPayment(orderTrackingId);
    
    // Update payment record
    await adminDb.collection('payments').doc(orderTrackingId).update({
      status: status.payment_status_description.toLowerCase(),
      pesapalTransactionId: status.confirmation_code,
      updatedAt: new Date(),
    });
    
    // If successful, update user
    if (status.payment_status_description === 'Completed') {
      const paymentDoc = await adminDb.collection('payments').doc(orderTrackingId).get();
      const paymentData = paymentDoc.data();
      
      if (paymentData) {
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 4); // 4 months (1 semester)
        
        await adminDb.collection('users').doc(paymentData.userId).update({
          isPaid: true,
          paymentExpiry: expiryDate,
        });
      }
    }
    
    return NextResponse.redirect(new URL('/payment/success', req.url));
  } catch (error) {
    console.error('Payment callback error:', error);
    return NextResponse.redirect(new URL('/payment/error', req.url));
  }
} 
 