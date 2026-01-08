"use client";

import React, { useState } from 'react';
import { Upload, Calendar, Bell, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';
import { TimetableEvent, formatTimeRange } from '@/types/timetable';

export default function TTSApp() {
  const [step, setStep] = useState('landing');
  const [file, setFile] = useState<File | null>(null);
  const [events, setEvents] = useState<TimetableEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadedFile = files[0];
    if (!uploadedFile) return;
    
    setFile(uploadedFile);
    setLoading(true);
    setError('');
    
    // Simulate AI parsing delay
    setTimeout(() => {
      // Mock parsed events with CORRECT structure
      setEvents([
        { 
          day: 'Monday', 
          startTime: '08:00', 
          endTime: '10:00', 
          courseCode: 'BBIT 2101', 
          subject: 'Database Systems', 
          venue: 'MSB 8', 
          lecturer: 'Dr. Kamau' 
        },
        { 
          day: 'Monday', 
          startTime: '14:00', 
          endTime: '16:00', 
          courseCode: 'BBIT 2102', 
          subject: 'Web Development', 
          venue: 'STM F2-01', 
          lecturer: 'Prof. Wanjiru' 
        },
        { 
          day: 'Tuesday', 
          startTime: '10:00', 
          endTime: '12:00', 
          courseCode: 'BBIT 2103', 
          subject: 'Data Structures', 
          venue: 'MSB 10', 
          lecturer: 'Dr. Omondi' 
        },
        { 
          day: 'Wednesday', 
          startTime: '08:00', 
          endTime: '10:00', 
          courseCode: 'BBIT 2104', 
          subject: 'Computer Networks', 
          venue: 'STM B-12', 
          lecturer: 'Mr. Kipchoge' 
        },
        { 
          day: 'Thursday', 
          startTime: '14:00', 
          endTime: '16:00', 
          courseCode: 'BBIT 2105', 
          subject: 'Software Engineering', 
          venue: 'MSB 8', 
          lecturer: 'Dr. Kamau' 
        },
        { 
          day: 'Friday', 
          startTime: '10:00', 
          endTime: '12:00', 
          courseCode: 'BBIT 2106', 
          subject: 'Business Statistics', 
          venue: 'SBS 5', 
          lecturer: 'Prof. Adhiambo' 
        },
      ]);
      setLoading(false);
      setStep('preview');
    }, 2000);
  };

  const handlePayment = async () => {
    if (!email || !phone) {
      setError('Please enter your email and phone number');
      return;
    }
    
    setLoading(true);
    
    // Save events to localStorage for success page
    localStorage.setItem('tts_events', JSON.stringify(events));
    localStorage.setItem('tts_email', email);
    
    // Mock payment redirect (replace with real Pesapal)
    setTimeout(() => {
      setLoading(false);
      setStep('success');
    }, 1500);
  };

  const handleDownloadCalendar = async () => {
    try {
      const response = await fetch('/api/sync-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: events,
          email: email,
          semesterStart: '2025-01-13' // First Monday of semester
        })
      });

      if (!response.ok) throw new Error('Failed to generate calendar');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'timetable.ics';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Calendar download error:', error);
      alert('Failed to download calendar');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-green-50">
      {/* LANDING PAGE */}
      {step === 'landing' && (
        <div className="flex min-h-screen flex-col items-center justify-center px-6">
          <div className="max-w-4xl w-full space-y-12">
            <div className="text-center space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full bg-emerald-100 px-6 py-3 text-emerald-900">
                <Calendar className="w-5 h-5" />
                <span className="font-semibold">TTS - Timetable Sync</span>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-bold text-gray-900 tracking-tight">
                Never miss a<br />class again
              </h1>
              
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Upload your timetable PDF. Get reminders 30 minutes before every class.
                <br />
                <span className="font-semibold text-emerald-600">150 KSH for the entire semester.</span>
              </p>
            </div>

            <div className="text-center space-y-4">
              <button
                onClick={() => setStep('upload')}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-5 text-lg font-semibold text-white shadow-lg hover:bg-emerald-700 transition-all hover:scale-105"
              >
                <Upload className="w-5 h-5" />
                Upload Your Timetable
              </button>
              
              <p className="text-sm text-gray-500">
                🎓 Works with JKUAT, UoN, Strathmore, KU, and all Kenyan universities
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 pt-8">
              {[
                { icon: Upload, title: 'Upload PDF', desc: 'Any format, any university' },
                { icon: Bell, title: 'Get Reminders', desc: 'Email + Calendar sync' },
                { icon: DollarSign, title: 'Pay Once', desc: '150 KSH entire semester' }
              ].map((feature, i) => (
                <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition">
                  <feature.icon className="w-10 h-10 text-emerald-600 mb-3" />
                  <h3 className="font-bold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.desc}</p>
                </div>
              ))}
            </div>

            <div className="text-center pt-8 border-t border-gray-200">
              <div className="flex items-center justify-center gap-3 text-gray-600">
                <div className="flex -space-x-2">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 border-2 border-white" />
                  ))}
                </div>
                <span className="text-sm">Join 247 students using TTS this semester</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD PAGE */}
      {step === 'upload' && (
        <div className="min-h-screen flex items-center justify-center px-6 py-12">
          <div className="max-w-2xl w-full space-y-8">
            <button
              onClick={() => setStep('landing')}
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              ← Back
            </button>

            <div className="bg-white rounded-3xl shadow-xl border border-gray-200 p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Upload Timetable</h2>
                <p className="text-gray-600">PDF format, any university</p>
              </div>

              <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:border-emerald-500 transition-all hover:bg-emerald-50">
                <Upload className="w-16 h-16 text-gray-400 mb-4" />
                <span className="text-lg font-medium text-gray-700">Click to upload PDF</span>
                <span className="text-sm text-gray-500 mt-2">or drag and drop</span>
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={loading}
                />
              </label>

              {loading && (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
                  <p className="mt-2 text-gray-600">Reading your timetable with AI...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW PAGE */}
      {step === 'preview' && (
        <div className="min-h-screen px-6 py-12">
          <div className="max-w-4xl mx-auto space-y-8">
            <button
              onClick={() => setStep('upload')}
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              ← Upload Different File
            </button>

            <div className="bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-green-600 text-white px-8 py-6">
                <h2 className="text-3xl font-bold mb-2">Your Schedule</h2>
                <p className="text-emerald-100">Found {events.length} classes this semester</p>
              </div>

              <div className="p-8 space-y-4 max-h-96 overflow-y-auto">
                {events.map((event, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-5 border border-gray-200 hover:border-emerald-300 transition">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-600">{event.day}</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-gray-700">{formatTimeRange(event)}</span>
                        </div>
                        <h3 className="font-bold text-gray-900">{event.subject}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>📚 {event.courseCode}</span>
                          <span>📍 {event.venue}</span>
                          {event.lecturer && <span>👨‍🏫 {event.lecturer}</span>}
                        </div>
                      </div>
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-gray-50 border-t border-gray-200 px-8 py-6">
                <div className="space-y-4">
                  <input
                    type="email"
                    placeholder="Your email (for reminders)"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  
                  <input
                    type="tel"
                    placeholder="Phone: 254712345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />

                  {error && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-xl">
                      <AlertCircle className="w-5 h-5" />
                      <span className="text-sm">{error}</span>
                    </div>
                  )}

                  <button
                    onClick={handlePayment}
                    disabled={loading}
                    className="w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing...' : 'Continue to Payment (150 KSH)'}
                  </button>

                  <p className="text-xs text-center text-gray-500">
                    By continuing, you agree to receive email reminders for your classes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS PAGE */}
      {step === 'success' && (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-2xl w-full text-center space-y-8">
            <div className="bg-white rounded-3xl shadow-xl border border-gray-200 p-12 space-y-6">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-12 h-12 text-emerald-600" />
              </div>

              <div className="space-y-3">
                <h2 className="text-4xl font-bold text-gray-900">You're All Set! 🎉</h2>
                <p className="text-lg text-gray-600">
                  You'll receive email reminders 30 minutes before every class
                </p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 space-y-3">
                <h3 className="font-bold text-emerald-900">What's Next?</h3>
                <ul className="text-left text-sm text-emerald-800 space-y-2">
                  <li>✅ Check your email ({email}) for confirmation</li>
                  <li>✅ Add events to Google Calendar (click below)</li>
                  <li>✅ First reminder arrives before your next class</li>
                </ul>
              </div>

              <button
                onClick={handleDownloadCalendar}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-4 rounded-xl hover:bg-blue-700 transition font-semibold"
              >
                <Calendar className="w-5 h-5" />
                Download Google Calendar File
              </button>

              <div className="pt-4 space-y-3">
                <button
                  onClick={() => {
                    setStep('landing');
                    setFile(null);
                    setEvents([]);
                    setEmail('');
                    setPhone('');
                    localStorage.removeItem('tts_events');
                    localStorage.removeItem('tts_email');
                  }}
                  className="text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  ← Back to Home
                </button>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              Questions? Email support@timetablesync.co.ke
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
