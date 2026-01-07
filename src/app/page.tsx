'use client';

import { useState } from 'react';

export default function Home() {
  const [view, setView] = useState('hero');
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      {view === 'hero' ? (
        <HeroSection onExplore={() => setView('demo')} />
      ) : (
        <DemoSection onBack={() => setView('hero')} />
      )}
    </div>
  );
}

function HeroSection({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="max-w-3xl space-y-8">
        {/* Logo/Title */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-3 rounded-full bg-green-100 px-6 py-3 text-green-900">
            <span className="text-2xl">📚</span>
            <span className="font-semibold">TTS - Timetable Sync</span>
          </div>
          
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Never miss a class again
          </h1>
          
          <p className="text-xl text-gray-600">
            Send your timetable PDF to WhatsApp. Get reminders before every class.
            <br />
            <span className="font-semibold text-green-600">No app downloads. Just works.</span>
          </p>
        </div>

        {/* CTA */}
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <a
              href="https://wa.me/254712345678?text=Hi%20TTS"
              className="rounded-lg bg-green-600 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-green-700 transition"
            >
              Start on WhatsApp →
            </a>
            
            <button
              onClick={onExplore}
              className="rounded-lg border-2 border-green-600 bg-white px-8 py-4 text-lg font-semibold text-green-600 hover:bg-green-50 transition"
            >
              See How It Works
            </button>
          </div>
          
          <p className="text-sm text-gray-500">
            💰 50 KSH/week • Works on any phone • M-Pesa payments
          </p>
        </div>

        {/* Social Proof */}
        <div className="pt-8 space-y-4">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="flex -space-x-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-8 w-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 border-2 border-white" />
              ))}
            </div>
            <span>Join 500+ students from JKUAT, UoN, Strathmore</span>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid gap-4 pt-12 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">⚡</div>
            <h3 className="font-semibold text-gray-900 mb-1">Instant Setup</h3>
            <p className="text-sm text-gray-600">Send PDF, get reminders. 2 minutes max.</p>
          </div>
          
          <div className="rounded-lg bg-white p-6 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">🧠</div>
            <h3 className="font-semibold text-gray-900 mb-1">AI-Powered</h3>
            <p className="text-sm text-gray-600">Reads ANY timetable format automatically.</p>
          </div>
          
          <div className="rounded-lg bg-white p-6 shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">📱</div>
            <h3 className="font-semibold text-gray-900 mb-1">WhatsApp Native</h3>
            <p className="text-sm text-gray-600">No new app. Works where you already are.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoSection({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0);
  
  const messages = [
    { from: 'user', text: 'Hi', time: '10:30' },
    { from: 'bot', text: '👋 Welcome to TTS!\n\nSend me your timetable PDF and I\'ll remind you before every class.\n\n💰 Cost: 50 KSH/week', time: '10:30' },
    { from: 'user', text: '[📄 timetable.pdf]', time: '10:32', isPdf: true },
    { from: 'bot', text: '⏳ Reading your timetable...', time: '10:32' },
    { from: 'bot', text: '✅ Found 18 classes!\n\nNext class:\n📌 Database Systems\n⏰ Today at 2:00 PM\n📍 Room MSB 8\n\nReply "SUBSCRIBE" to get reminders (50 KSH/week)', time: '10:33' },
    { from: 'user', text: 'SUBSCRIBE', time: '10:34' },
    { from: 'bot', text: '💳 M-Pesa: Send 50 KSH to 0712345678\n\nReply with transaction code when done.', time: '10:34' },
    { from: 'user', text: 'QH45TGRT8', time: '10:36' },
    { from: 'bot', text: '🎉 Payment confirmed! You\'re all set.\n\nI\'ll remind you 30 mins before every class.', time: '10:36' },
  ];

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={onBack}
          className="mb-8 text-green-600 hover:text-green-700 font-medium"
        >
          ← Back
        </button>

        <div className="space-y-8">
          {/* Header */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">How TTS Works</h2>
            <p className="text-gray-600">See the entire flow from start to finish</p>
          </div>

          {/* Chat Interface */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            {/* Phone Header */}
            <div className="bg-green-600 text-white px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                📚
              </div>
              <div>
                <div className="font-semibold">TTS Bot</div>
                <div className="text-xs text-green-100">Online</div>
              </div>
            </div>

            {/* Messages */}
            <div className="bg-gray-50 p-6 min-h-[500px]">
              <div className="space-y-3">
                {messages.slice(0, step + 1).map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] ${
                      msg.from === 'user' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-white text-gray-900'
                    } rounded-lg p-3 shadow-sm`}>
                      {msg.isPdf ? (
                        <div className="bg-red-100 text-red-900 px-3 py-2 rounded text-sm flex items-center gap-2">
                          📄 timetable.pdf
                          <span className="text-xs">124 KB</span>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-line">{msg.text}</p>
                      )}
                      <p className={`text-xs mt-1 ${
                        msg.from === 'user' ? 'text-green-100' : 'text-gray-400'
                      }`}>{msg.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="bg-white border-t border-gray-200 px-6 py-4">
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(Math.max(0, step - 1))}
                  disabled={step === 0}
                  className="px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  ← Previous
                </button>
                
                <div className="flex-1 text-center py-2 text-sm text-gray-600">
                  Step {step + 1} of {messages.length}
                </div>
                
                <button
                  onClick={() => setStep(Math.min(messages.length - 1, step + 1))}
                  disabled={step === messages.length - 1}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <a
              href="https://wa.me/254712345678?text=Hi%20TTS"
              className="inline-block rounded-lg bg-green-600 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-green-700 transition"
            >
              Try It Now on WhatsApp →
            </a>
            <p className="mt-4 text-sm text-gray-500">
              First week free • Cancel anytime • 500+ active users
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}