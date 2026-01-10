import axios from 'axios';

const PESAPAL_BASE_URL = 'https://cybqa.pesapal.com/pesapalv3'; // Sandbox URL

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
  
  // Build request body (IPN ID is optional)
  const requestBody: any = {
    id: orderTrackingId,
    currency: 'KES',
    amount: data.amount,
    description: 'Timetable Sync - Semester Subscription',
    callback_url: process.env.PESAPAL_CALLBACK_URL,
    billing_address: {
      email_address: data.email,
      phone_number: data.phone,
    },
  };
  
  // Only add notification_id if it exists in env
  if (process.env.PESAPAL_IPN_ID && process.env.PESAPAL_IPN_ID !== 'your_ipn_id') {
    requestBody.notification_id = process.env.PESAPAL_IPN_ID;
  }
  
  const response = await axios.post(
    `${PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`,
    requestBody,
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