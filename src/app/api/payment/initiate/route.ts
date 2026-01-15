// src/app/api/payment/initiate/route.ts
// ✅ FIXED: Phone is optional, better error handling for PesaPal testing

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
    
    console.log('💰 Payment request:', { userId, email, phone: phone || 'not provided' });
    
    // Validate email (required)
    if (!validateEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    
    // Validate phone (optional, but if provided must be valid)
    if (phone && !validatePhone(phone)) {
      return NextResponse.json({ 
        error: 'Invalid phone number. Use format: 254712345678' 
      }, { status: 400 });
    }
    
    // Use default phone if not provided
    const finalPhone = phone && phone.trim() !== '' 
      ? phone.replace(/\s+/g, '').replace(/\+/g, '') 
      : '254700000000';
    
    console.log('📞 Using phone:', finalPhone);
    
    // Initiate payment with PesaPal
    const payment = await initiatePayment({
      amount: 150,
      email,
      phone: finalPhone,
      userId,
    });
    
    console.log('✅ PesaPal response:', {
      orderTrackingId: payment.orderTrackingId,
      redirectUrl: payment.redirectUrl?.substring(0, 50) + '...'
    });
    
    // Save payment record
    await adminDb.collection('payments').doc(payment.orderTrackingId).set({
      userId,
      email,
      phone: finalPhone,
      amount: 150,
      status: 'pending',
      orderTrackingId: payment.orderTrackingId,
      createdAt: new Date(),
    });
    
    console.log('💾 Payment record saved');
    
    return NextResponse.json({
      success: true,
      redirectUrl: payment.redirectUrl,
      orderTrackingId: payment.orderTrackingId,
    });
    
  } catch (error: any) {
    console.error('❌ Payment initiation error:', error);
    
    // Better error messages for debugging
    if (error.message?.includes('PESAPAL')) {
      return NextResponse.json({ 
        error: 'PesaPal connection failed',
        details: error.message,
        hint: 'Check your PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET in .env.local'
      }, { status: 500 });
    }
    
    if (error.message?.includes('Firebase')) {
      return NextResponse.json({ 
        error: 'Database error',
        details: error.message,
        hint: 'Check your FIREBASE_ADMIN_KEY in .env.local'
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      error: 'Payment initiation failed', 
      details: error.message 
    }, { status: 500 });
  }
}