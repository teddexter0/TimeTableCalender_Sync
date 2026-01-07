import axios from 'axios';
import crypto from 'crypto';

const PESAPAL_BASE_URL = 'https://pay.pesapal.com/v3';

export async function getAccessToken() {
  const response = await axios.post(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
    consumer_key: process.env.PESAPAL_CONSUMER_KEY,
    consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
  });
  
  return response.data.token;
}

export async function initiatePayment(data: {
  amount: number;
  email: string;
  phone: string;
  userId: string;
}) {
  const token = await getAccessToken();
  
  const orderTrackingId = `TTS-${data.userId}-${Date.now()}`;
  
  const response = await axios.post(
    `${PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`,
    {
      id: orderTrackingId,
      currency: 'KES',
      amount: data.amount,
      description: 'Timetable Sync - Semester Subscription',
      callback_url: process.env.PESAPAL_CALLBACK_URL,
      notification_id: process.env.PESAPAL_IPN_ID,
      billing_address: {
        email_address: data.email,
        phone_number: data.phone,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  return {
    orderTrackingId,
    redirectUrl: response.data.redirect_url,
  };
}

export async function verifyPayment(orderTrackingId: string) {
  const token = await getAccessToken();
  
  const response = await axios.get(
    `${PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  
  return response.data;
}