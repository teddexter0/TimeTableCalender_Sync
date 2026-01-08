# TTS (Timetable Sync) - Technical Flow Documentation

## 🎯 Product Summary (Investor Pitch Version)

**One-Sentence Pitch:**  
"Upload your university timetable PDF → AI extracts your classes → Get automatic reminders before each class. One-time payment of 150 KSH per semester."

**Problem:** Students miss classes because they forget, lose their timetables, or don't check them daily.

**Solution:** Automated reminder system that requires zero daily effort after initial setup.

**Revenue Model:** 150 KSH one-time payment per student per semester (4 months).

---

## 📊 System Architecture (5 Stages)

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  1. Landing │ →  │  2. Upload   │ →  │ 3. Preview  │ →  │  4. Payment  │ →  │ 5. Delivery │
│    Page     │    │   PDF File   │    │   Schedule  │    │   (M-Pesa)   │    │  Reminders  │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘    └─────────────┘
```

---

## 🔄 End-to-End User Flow

### **Stage 1: Landing → Upload** (0 friction)
```
User arrives → Sees value prop → Clicks "Upload Timetable"
```
- **No signup required** (removes barrier)
- **No email collection** yet (do it after value delivery)
- **Clear CTA:** "Upload Your Timetable"

---

### **Stage 2: PDF Upload → AI Parsing** (Technical moat)
```
User uploads PDF → Frontend sends to API → GPT-4 Vision parses → Returns structured JSON
```

**Technical Implementation:**
```typescript
// /api/parse-pdf/route.ts
1. Receive PDF file from user
2. Convert to Buffer
3. Send to OpenAI GPT-4 Vision API with prompt:
   "Extract all classes from this timetable as JSON"
4. Parse AI response into structured events:
   [{
     day: "Monday",
     start_time: "08:00",
     end_time: "10:00",
     course_code: "BBIT 2101",
     subject: "Database Systems",
     venue: "MSB 8",
     lecturer: "Dr. Kamau"
   }]
5. Return to frontend
```

**Why this is the moat:**
- PDFs are messy and inconsistent across universities
- Manual parsing would require custom logic per university
- AI automatically adapts to any format
- Improves over time with more data

---

### **Stage 3: Preview & Verification** (Build trust)
```
Show parsed schedule → User confirms accuracy → Enter email + phone → Continue to payment
```

**Why this matters:**
- User sees **immediate value** before paying
- Confirms parsing worked correctly
- Reduces refunds/disputes
- Collects contact info AFTER showing value

---

### **Stage 4: Payment Integration** (M-Pesa)
```
User clicks "Pay" → Redirect to PesaPal → User pays via M-Pesa → Callback confirms payment
```

**Payment Flow:**
```typescript
// /api/payment/initiate/route.ts
1. Create PesaPal order with:
   - Amount: 150 KSH
   - Order ID: TTS-{userId}-{timestamp}
   - Callback URL: /api/payment/callback
2. Return redirect URL to user
3. User completes payment on PesaPal
4. PesaPal calls our callback endpoint
5. We verify payment status
6. Update user record: isPaid = true
7. Redirect user to success page
```

**Why PesaPal:**
- M-Pesa integration built-in
- Handles payment security
- No PCI compliance burden on us
- Kenyan students trust it

---

### **Stage 5: Automated Delivery** (Zero marginal cost)
```
Payment confirmed → Save events to database → Schedule email reminders → Send calendar links
```

**Reminder System:**
```typescript
// Runs every minute via cron job
1. Check current time
2. Find all classes starting in 30 minutes
3. Filter for users with:
   - isPaid = true
   - subscription_expiry > today
4. Send email reminder with:
   - Class details
   - Time remaining
   - Venue and lecturer
5. Log reminder sent
```

**Email Template:**
```
⏰ CLASS IN 30 MINUTES!

📌 Database Systems
📖 BBIT 2101
🕐 08:00 - 10:00
📍 MSB 8
👨‍🏫 Dr. Kamau

See you in class! 🎓
```

---

## 🗄️ Database Schema (Firebase/Firestore)

### **Users Collection**
```typescript
{
  id: string,              // Auto-generated
  email: string,
  phone: string,
  isPaid: boolean,         // Payment status
  paymentExpiry: Date,     // End of semester
  createdAt: Date,
  timetable: [{            // Array of events
    day: string,
    start_time: string,
    end_time: string,
    course_code: string,
    subject: string,
    venue: string,
    lecturer: string
  }]
}
```

### **Payments Collection**
```typescript
{
  orderTrackingId: string, // TTS-{userId}-{timestamp}
  userId: string,
  amount: number,          // 150
  status: string,          // pending/completed/failed
  pesapalTransactionId: string,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🚀 Current Implementation Status

### ✅ **What's Working**
1. ✅ Landing page with value prop
2. ✅ File upload UI
3. ✅ Mock PDF parsing (simulated AI response)
4. ✅ Schedule preview
5. ✅ Payment flow simulation
6. ✅ Success page

### ❌ **What's Missing**
1. ❌ **Actual AI PDF parsing** (currently mocked)
2. ❌ **Real PesaPal integration** (simulated redirect)
3. ❌ **Email reminder system** (no cron job yet)
4. ❌ **Calendar sync** (Google Calendar .ics generation)
5. ❌ **Database persistence** (events not saved)
6. ❌ **Styling issues** (Tailwind not loading)

---

## 🔧 Technical Issues to Fix

### **Issue 1: Tailwind CSS Not Loading**

**Problem:** Classes like `bg-emerald-600` not rendering.

**Root Cause:** Tailwind config not picking up component files.

**Fix:**
```javascript
// tailwind.config.ts
content: [
  "./src/app/**/*.{js,ts,jsx,tsx}",
  "./src/components/**/*.{js,ts,jsx,tsx}",
  "./src/**/*.{js,ts,jsx,tsx}", // Add this
]
```

Then rebuild:
```bash
npm run dev
```

---

### **Issue 2: Missing Calendar Sync API**

**What it should do:**
```typescript
// /api/sync-calendar/route.ts
export async function POST(req) {
  const { events, email } = await req.json();
  
  // Generate .ics file
  const icsContent = generateICS(events);
  
  // Option 1: Send as email attachment
  await sendEmailWithCalendar(email, icsContent);
  
  // Option 2: Return downloadable .ics
  return new Response(icsContent, {
    headers: {
      'Content-Type': 'text/calendar',
      'Content-Disposition': 'attachment; filename="timetable.ics"'
    }
  });
}
```

---

## 📈 Scalability & Economics

### **Unit Economics**
```
Revenue per student: 150 KSH
Costs per student:
  - OpenAI API (GPT-4 Vision): ~20 KSH
  - Email service (SendGrid): ~2 KSH
  - Database storage: ~1 KSH
  - M-Pesa fees (3.5%): ~5 KSH
  ─────────────────────────
  Gross margin: 122 KSH (81%)
```

### **Target Market**
- **TAM:** 500,000+ university students in Kenya
- **Initial Target:** JKUAT (30,000 students)
- **Semester Capacity:** 200 students (conservative)
- **Revenue Goal:** 30,000 KSH first semester

### **Why This Scales**
1. **Zero marginal cost** after initial setup
2. **No customer support** (self-service)
3. **Viral loop:** Students tell classmates
4. **Semester recurring:** Re-subscribe every 4 months

---

## 🛠️ Next Steps (Priority Order)

### **Phase 1: MVP (Week 1-2)**
1. ✅ Fix Tailwind styling
2. ✅ Integrate real OpenAI API
3. ✅ Connect Firebase database
4. ✅ Deploy to Vercel

### **Phase 2: Payments (Week 3)**
1. ❌ Integrate PesaPal API
2. ❌ Test M-Pesa flow end-to-end
3. ❌ Add payment verification webhook

### **Phase 3: Automation (Week 4)**
1. ❌ Build email reminder system
2. ❌ Add cron job for scheduled reminders
3. ❌ Generate Google Calendar .ics files

### **Phase 4: Launch (Week 5)**
1. ❌ Soft launch with 20 beta users
2. ❌ Collect feedback
3. ❌ Fix bugs
4. ❌ Scale to 200 students

---

## 💡 Investor Talking Points

### **Why This Works:**
1. **Clear pain point:** Students forget classes → fail courses
2. **Simple solution:** Automated reminders (set and forget)
3. **Low friction:** No app download, works via email
4. **One-time payment:** No subscription fatigue

### **Defensibility:**
1. **Data moat:** Parsing accuracy improves with usage
2. **Network effects:** Campus-by-campus viral growth
3. **Switching costs:** Once setup, students won't change

### **Traction Potential:**
- **Day 1:** 10 students (friends)
- **Week 1:** 50 students (word of mouth)
- **Month 1:** 200 students (semester target)
- **Year 1:** 2,000 students (10x campus expansion)

---

## 🔒 Security & Privacy

- **No passwords stored** (email-based auth)
- **Rate limiting** on file uploads (10 per hour per IP)
- **Input sanitization** to prevent XSS
- **PesaPal handles payments** (no credit cards stored)
- **HTTPS only** (Vercel default)

---

## 📞 Support & Maintenance

**Expected Support Load:**
- **Week 1:** High (10-20 questions/day)
- **Week 2+:** Low (1-2 questions/day)

**Common Issues:**
1. "PDF not parsing correctly" → Improve AI prompt
2. "Didn't receive reminder" → Check spam folder
3. "Payment not confirmed" → Manual verification

---

## 🎓 Technical Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 + React | Fast, SEO-friendly |
| Styling | Tailwind CSS | Rapid UI development |
| AI Parsing | OpenAI GPT-4 Vision | Best PDF understanding |
| Database | Firebase Firestore | Real-time, scalable |
| Payments | PesaPal + M-Pesa | Kenyan market standard |
| Email | SendGrid | Reliable delivery |
| Hosting | Vercel | Zero-config deployment |
| Cron Jobs | Vercel Cron | Built-in scheduling |

---

## 📊 Success Metrics

### **Week 1:**
- ✅ 10 paying users
- ✅ 90%+ parsing accuracy
- ✅ Zero refunds

### **Month 1:**
- ✅ 200 paying users
- ✅ 30,000 KSH revenue
- ✅ 95%+ reminder delivery rate

### **Semester 1:**
- ✅ 500 users
- ✅ 75,000 KSH revenue
- ✅ <5% churn rate

---

## 🚨 Risk Mitigation

| Risk | Mitigation |
|------|------------|
| AI parsing fails | Manual review queue + improve prompts |
| M-Pesa integration bugs | Test with real transactions before launch |
| Email deliverability | Use SendGrid + SPF/DKIM setup |
| Server downtime | Vercel 99.9% uptime SLA |
| Low conversion rate | A/B test landing page copy |

---

## 🎯 Conclusion

**This is a simple product with complex execution:**
- **Simple for users:** Upload PDF → Get reminders
- **Complex technically:** AI parsing + payment + scheduling + emails

**The key insight:**  
Students will pay for **convenience**, not features. The fewer steps between "I have a problem" and "problem solved," the higher the conversion rate.

**Next action:**  
Fix styling → Deploy MVP → Get 10 beta users → Iterate based on feedback.

---

*Last updated: January 8, 2026*  
*Version: 1.0.0*  
*Status: Pre-launch MVP*