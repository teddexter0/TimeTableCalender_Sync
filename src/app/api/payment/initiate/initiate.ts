import { NextRequest, NextResponse } from 'next/server';
import { initiatePayment } from '@/lib/pesapal';
import { adminDb } from '@/lib/firebase-admin';
import { rateLimit, validateEmail, validatePhone } from '@/lib/security';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  
  if (!rateLimit(ip, 5, 60000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  
  try {
    const { userId, email, phone } = await req.json();
    
    if (!validateEmail(email) || !validatePhone(phone)) {
      return NextResponse.json({ error: 'Invalid email or phone' }, { status: 400 });
    }
    
    const payment = await initiatePayment({
      amount: 150,
      email,
      phone,
      userId,
    });
    
    // Save payment record
    await adminDb.collection('payments').doc(payment.orderTrackingId).set({
      userId,
      amount: 150,
      status: 'pending',
      orderTrackingId: payment.orderTrackingId,
      createdAt: new Date(),
    });
    
    return NextResponse.json({
      redirectUrl: payment.redirectUrl,
      orderTrackingId: payment.orderTrackingId,
    });
  } catch (error) {
    console.error('Payment initiation error:', error);
    return NextResponse.json({ error: 'Payment failed' }, { status: 500 });
  }
}