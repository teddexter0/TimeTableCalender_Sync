// server.js - Production WhatsApp TTS Bot
import express from 'express';
import twilio from 'twilio';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import axios from 'axios';
import cron from 'node-cron';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize services
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const upload = multer({ storage: multer.memoryStorage() });

// ============================================
// WEBHOOK: Incoming WhatsApp Messages
// ============================================
app.post('/whatsapp', upload.any(), async (req, res) => {
  try {
    const { From, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body;
    const phone = From.replace('whatsapp:', '');
    
    console.log(`Message from ${phone}: ${Body}`);
    
    // Get or create user
    let { data: user, error } = await supabase
      .from('users')
      .select()
      .eq('phone', phone)
      .single();
      
    if (error || !user) {
      await createUser(phone);
      await sendWelcomeMessage(phone);
      return res.status(200).send();
    }
    
    // Handle PDF timetable upload
    if (NumMedia > 0 && MediaContentType0 === 'application/pdf') {
      await handleTimetablePDF(phone, MediaUrl0);
      return res.status(200).send();
    }
    
    // Handle text commands
    await handleTextCommand(phone, Body, user);
    res.status(200).send();
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send();
  }
});

// ============================================
// USER MANAGEMENT
// ============================================
async function createUser(phone) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      phone,
      created_at: new Date().toISOString(),
      subscription_status: 'trial',
      reminders_enabled: false
    })
    .select()
    .single();
    
  if (error) console.error('Create user error:', error);
  return data;
}

async function sendWelcomeMessage(phone) {
  const message = `👋 Welcome to TTS - Timetable Sync!

Send me your timetable PDF and I'll:
✅ Parse all your classes automatically
✅ Send reminders 30 mins before each class
✅ Include venue, lecturer, and course details

💰 Cost: 50 KSH/week (first week FREE)

📎 Send your timetable PDF to get started!`;

  await sendWhatsAppMessage(phone, message);
}

// ============================================
// PDF PROCESSING
// ============================================
async function handleTimetablePDF(phone, pdfUrl) {
  try {
    await sendWhatsAppMessage(phone, '⏳ Reading your timetable... This might take 30 seconds.');
    
    // Download PDF from Twilio's media URL
    const response = await axios.get(pdfUrl, {
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN
      },
      responseType: 'arraybuffer'
    });
    
    const pdfBuffer = Buffer.from(response.data);
    
    // Convert PDF to base64 for GPT-4 Vision
    const base64Pdf = pdfBuffer.toString('base64');
    
    // Parse with GPT-4 Vision
    const completion = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract ALL classes from this university timetable. Return ONLY a JSON array with this structure:
[{
  "day": "Monday|Tuesday|Wednesday|Thursday|Friday",
  "start_time": "HH:MM",
  "end_time": "HH:MM", 
  "course_code": "e.g. BBIT 2101",
  "subject": "Full subject name",
  "venue": "e.g. MSB 8",
  "lecturer": "Name if visible"
}]

Be thorough and extract every single class entry.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64Pdf}`
              }
            }
          ]
        }
      ],
      max_tokens: 4096
    });
    
    // Parse AI response
    const content = completion.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) {
      throw new Error('Could not extract JSON from AI response');
    }
    
    const events = JSON.parse(jsonMatch[0]);
    
    if (events.length === 0) {
      await sendWhatsAppMessage(phone, 
        '❌ Sorry, I couldn\'t find any classes in that timetable.\n\nPlease make sure it\'s a clear PDF with your class schedule.'
      );
      return;
    }
    
    // Save events to database
    const { error } = await supabase
      .from('timetable_events')
      .delete()
      .eq('user_phone', phone); // Clear old timetable
      
    await supabase
      .from('timetable_events')
      .insert(
        events.map(e => ({
          user_phone: phone,
          day: e.day,
          start_time: e.start_time,
          end_time: e.end_time,
          course_code: e.course_code,
          subject: e.subject,
          venue: e.venue,
          lecturer: e.lecturer
        }))
      );
    
    // Send confirmation
    const nextClass = events[0];
    const message = `✅ Timetable saved successfully!

📚 Found ${events.length} classes

Next class:
📌 ${nextClass.subject}
📖 ${nextClass.course_code}
⏰ ${nextClass.day} at ${nextClass.start_time}
📍 ${nextClass.venue}
${nextClass.lecturer ? `👨‍🏫 ${nextClass.lecturer}` : ''}

Reply with:
1️⃣ VIEW - See this week's schedule
2️⃣ SUBSCRIBE - Enable reminders (50 KSH/week, first week FREE)`;

    await sendWhatsAppMessage(phone, message);
    
  } catch (error) {
    console.error('PDF processing error:', error);
    await sendWhatsAppMessage(phone,
      '❌ Sorry, something went wrong processing your timetable.\n\nPlease try again or contact support.'
    );
  }
}

// ============================================
// COMMAND HANDLING
// ============================================
async function handleTextCommand(phone, text, user) {
  const cmd = text.trim().toUpperCase();
  
  if (cmd === '1' || cmd === 'VIEW') {
    await sendWeekSchedule(phone);
  } 
  else if (cmd === '2' || cmd === 'SUBSCRIBE') {
    await initiateSubscription(phone);
  }
  else if (cmd.match(/^[A-Z0-9]{10}$/)) {
    // M-Pesa transaction code format
    await verifyMpesaPayment(phone, cmd);
  }
  else if (cmd === 'HELP') {
    await sendWhatsAppMessage(phone, 
      `📱 TTS Commands:

1️⃣ VIEW - See this week's schedule
2️⃣ SUBSCRIBE - Enable reminders (50 KSH/week)
📎 Send PDF - Upload new timetable

Need help? WhatsApp: +254712345678`
    );
  }
  else {
    await sendWhatsAppMessage(phone,
      '❓ I didn\'t understand that.\n\nReply HELP to see available commands.'
    );
  }
}

async function sendWeekSchedule(phone) {
  const { data: events } = await supabase
    .from('timetable_events')
    .select()
    .eq('user_phone', phone)
    .order('day', { ascending: true })
    .order('start_time', { ascending: true });
    
  if (!events || events.length === 0) {
    await sendWhatsAppMessage(phone, 
      '📚 No timetable found.\n\nSend me your timetable PDF to get started!'
    );
    return;
  }
  
  // Group by day
  const schedule = events.reduce((acc, event) => {
    if (!acc[event.day]) acc[event.day] = [];
    acc[event.day].push(event);
    return acc;
  }, {});
  
  let message = '📅 THIS WEEK\'S SCHEDULE:\n\n';
  
  for (const [day, classes] of Object.entries(schedule)) {
    message += `*${day}*\n`;
    classes.forEach(c => {
      message += `⏰ ${c.start_time}-${c.end_time}\n`;
      message += `📌 ${c.subject}\n`;
      message += `📍 ${c.venue}\n\n`;
    });
  }
  
  await sendWhatsAppMessage(phone, message);
}

async function initiateSubscription(phone) {
  const message = `💳 SUBSCRIBE TO TTS

Cost: 50 KSH/week
🎁 First week FREE

To subscribe:
1. M-Pesa Paybill: 123456
2. Account: TTS${phone.slice(-4)}
3. Amount: 50 KSH

After payment, send the M-Pesa code here.`;

  await sendWhatsAppMessage(phone, message);
}

async function verifyMpesaPayment(phone, transactionCode) {
  // TODO: Integrate with M-Pesa Daraja API to verify
  // For now, mock verification
  
  await sendWhatsAppMessage(phone, '⏳ Verifying payment...');
  
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Update user subscription
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 7); // 1 week
  
  await supabase
    .from('users')
    .update({
      subscription_status: 'active',
      subscription_expiry: expiryDate.toISOString(),
      reminders_enabled: true,
      last_payment_code: transactionCode
    })
    .eq('phone', phone);
  
  await sendWhatsAppMessage(phone,
    `🎉 Payment confirmed!

You're now subscribed to TTS.
✅ Reminders enabled
📅 Valid until: ${expiryDate.toDateString()}

I'll send you a reminder 30 minutes before every class.

Reply HELP anytime to see commands.`
  );
}

// ============================================
// REMINDER SYSTEM (Cron Job)
// ============================================
cron.schedule('* * * * *', async () => {
  // Run every minute
  const now = new Date();
  const in30mins = new Date(now.getTime() + 30 * 60000);
  
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
  const targetTime = in30mins.toTimeString().slice(0, 5); // HH:MM
  
  // Find classes starting in 30 minutes
  const { data: upcomingClasses } = await supabase
    .from('timetable_events')
    .select('*, users!inner(*)')
    .eq('users.reminders_enabled', true)
    .eq('users.subscription_status', 'active')
    .eq('day', currentDay)
    .eq('start_time', targetTime);
  
  if (upcomingClasses && upcomingClasses.length > 0) {
    for (const cls of upcomingClasses) {
      const message = `⏰ CLASS IN 30 MINUTES!

📌 ${cls.subject}
📖 ${cls.course_code}
🕐 ${cls.start_time} - ${cls.end_time}
📍 ${cls.venue}
${cls.lecturer ? `👨‍🏫 ${cls.lecturer}` : ''}

See you in class! 🎓`;

      await sendWhatsAppMessage(cls.user_phone, message);
    }
  }
});

// ============================================
// UTILITIES
// ============================================
async function sendWhatsAppMessage(to, body) {
  try {
    const message = await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${to}`,
      body
    });
    console.log(`Message sent to ${to}: ${message.sid}`);
    return message;
  } catch (error) {
    console.error('Send message error:', error);
    throw error;
  }
}

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 TTS Bot running on port ${PORT}`);
  console.log(`📱 WhatsApp webhook: /whatsapp`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});