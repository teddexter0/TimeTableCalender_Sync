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
```

### **9. `firestore.rules` (Database Security)**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Timetables - users can only access their own
    match /timetables/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Payments - read only for user, write only from backend
    match /payments/{paymentId} {
      allow read: if request.auth != null;
      allow write: if false; // Only backend can write
    }
  }
}