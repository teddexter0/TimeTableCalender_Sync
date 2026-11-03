'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { AlertCircle, Calendar, CheckCircle, Clock3, FileCheck2, ShieldAlert, Upload } from 'lucide-react';
import { DocumentType, ParsedTimetable, TimetableEvent, formatTimeRange } from '@/types/timetable';

type TypeHint = 'auto' | DocumentType;
type Step = 'upload' | 'preview' | 'done';

interface ExistingCalendarEvent {
  id: string;
  summary: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
}

const DRAFT_KEY = 'tts_calendar_draft_v2';
const PROFILE_KEY = 'tts_semester_profile_v1';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fourMonthsAfter(date: string): string {
  const value = new Date(`${date}T00:00:00`);
  value.setMonth(value.getMonth() + 4);
  return value.toISOString().slice(0, 10);
}

function typeLabel(type: DocumentType): string {
  if (type === 'class') return 'Regular weekly classes';
  if (type === 'cat') return 'CAT timetable';
  return 'Final exam timetable';
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function classDate(semesterStart: string, day: string | null): string {
  const wanted = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    .findIndex(value => value.toLowerCase() === (day || '').toLowerCase());
  if (wanted < 0) return semesterStart;
  const value = new Date(`${semesterStart}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + (wanted - value.getUTCDay() + 7) % 7);
  return value.toISOString().slice(0, 10);
}

function calendarStart(time: string, type: DocumentType): string {
  if (type === 'class') return time;
  const [hours, minutes] = time.split(':').map(Number);
  const shifted = (hours * 60 + minutes - 60 + 1440) % 1440;
  return `${String(Math.floor(shifted / 60)).padStart(2, '0')}:${String(shifted % 60).padStart(2, '0')}`;
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00Z`));
}

function displayClock(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, '0')}${suffix}`;
}

function timeMinutes(value: string): number | null {
  const match = value.match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export default function TTSApp() {
  const { data: session, status } = useSession();
  const [step, setStep] = useState<Step>('upload');
  const [groupCode, setGroupCode] = useState('BBIT 2.2 D');
  const [groupAliases, setGroupAliases] = useState('');
  const [courseCatalog, setCourseCatalog] = useState('');
  const [typeHint, setTypeHint] = useState<TypeHint>('auto');
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [formatLabel, setFormatLabel] = useState('');
  const [events, setEvents] = useState<TimetableEvent[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [semesterStart, setSemesterStart] = useState(today());
  const [semesterEnd, setSemesterEnd] = useState(fourMonthsAfter(today()));
  const [ambiguousConfirmed, setAmbiguousConfirmed] = useState(false);
  const [syncConfirmed, setSyncConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [existingCalendarEvents, setExistingCalendarEvents] = useState<ExistingCalendarEvent[]>([]);
  const [calendarCompared, setCalendarCompared] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const storedProfile = localStorage.getItem(PROFILE_KEY);
      if (storedProfile) {
        const profile = JSON.parse(storedProfile) as { groupCode?: string; groupAliases?: string; courseCatalog?: string; semesterStart?: string; semesterEnd?: string };
        if (profile.groupCode) setGroupCode(profile.groupCode);
        setGroupAliases(profile.groupAliases || '');
        setCourseCatalog(profile.courseCatalog || '');
        if (profile.semesterStart) setSemesterStart(profile.semesterStart);
        if (profile.semesterEnd) setSemesterEnd(profile.semesterEnd);
      }
      const stored = localStorage.getItem(DRAFT_KEY);
      if (!stored) return;
      const draft = JSON.parse(stored) as {
        groupCode: string; documentType: DocumentType; events: TimetableEvent[];
        warnings: string[]; semesterStart: string; semesterEnd: string;
        groupAliases?: string; courseCatalog?: string; formatLabel?: string;
      };
      if (!Array.isArray(draft.events) || !draft.documentType) return;
      const restoredType = (draft.documentType as DocumentType | 'exam_cat') === 'exam_cat' ? 'exam' : draft.documentType;
      setGroupCode(draft.groupCode);
      setDocumentType(restoredType);
      setFormatLabel(draft.formatLabel || 'Recognized timetable format');
      setEvents(draft.events);
      setWarnings(draft.warnings || []);
      setGroupAliases(draft.groupAliases || '');
      setCourseCatalog(draft.courseCatalog || '');
      setSemesterStart(draft.semesterStart || today());
      setSemesterEnd(draft.semesterEnd || fourMonthsAfter(today()));
      setStep('preview');
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  const ambiguousCount = useMemo(() => events.filter(event => event.ambiguousMatch).length, [events]);

  const comparisonRange = useMemo(() => {
    if (documentType === 'class') return { start: semesterStart, end: addDays(semesterStart, 6) };
    const dated = events.map(event => event.date).filter((date): date is string => Boolean(date)).sort();
    return dated.length ? { start: dated[0], end: dated[dated.length - 1] } : { start: semesterStart, end: semesterStart };
  }, [documentType, events, semesterStart]);

  const persistDraft = (result?: ParsedTimetable) => {
    const value = result || { documentType: documentType!, groupSearched: groupCode, events, warnings };
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      groupCode: value.groupSearched,
      documentType: value.documentType,
      events: value.events,
      warnings: value.warnings,
      groupAliases,
      courseCatalog,
      formatLabel: result?.formatLabel || formatLabel,
      semesterStart,
      semesterEnd,
    }));
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ groupCode: value.groupSearched, groupAliases, courseCatalog, semesterStart, semesterEnd }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!groupCode.trim()) {
      setError('Enter your full group code first, for example BBIT 2.2 D.');
      return;
    }
    setLoading(true);
    setError('');
    setAmbiguousConfirmed(false);
    setSyncConfirmed(false);
    setCalendarCompared(false);
    setExistingCalendarEvents([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('groupCode', groupCode);
      formData.append('documentType', typeHint);
      formData.append('groupAliases', groupAliases);
      formData.append('courseCatalog', courseCatalog);
      const response = await fetch('/api/parse-timetable', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Parsing failed.');
      const result = data as ParsedTimetable;
      setDocumentType(result.documentType);
      setFormatLabel(result.formatLabel);
      setGroupCode(result.groupSearched);
      setEvents(result.events);
      setWarnings(result.warnings || []);
      setStep('preview');
      persistDraft(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse timetable.');
    } finally {
      setLoading(false);
    }
  };

  const updateEvent = (index: number, field: keyof TimetableEvent, value: string | boolean | null | undefined) => {
    setEvents(current => current.map((event, i) => i === index ? { ...event, [field]: value } : event));
    setAmbiguousConfirmed(false);
    setSyncConfirmed(false);
  };

  const removeEvent = (index: number) => {
    setEvents(current => current.filter((_, i) => i !== index));
    setAmbiguousConfirmed(false);
    setSyncConfirmed(false);
  };

  const compareCalendar = async () => {
    setCalendarLoading(true);
    setError('');
    try {
      const query = new URLSearchParams(comparisonRange);
      const response = await fetch(`/api/calendar-preview?${query.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Calendar comparison failed.');
      setExistingCalendarEvents(Array.isArray(data.events) ? data.events : []);
      setCalendarCompared(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calendar comparison failed.');
    } finally {
      setCalendarLoading(false);
    }
  };

  const connectCalendar = async () => {
    persistDraft();
    await signIn('google', { callbackUrl: '/' });
  };

  const syncCalendar = async () => {
    if (!documentType) return;
    setSyncing(true);
    setError('');
    persistDraft();
    try {
      const response = await fetch('/api/sync-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events, documentType, semesterStart, semesterEnd, ambiguousConfirmed, syncConfirmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Calendar sync failed.');
      localStorage.removeItem(DRAFT_KEY);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calendar sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  if (step === 'done') {
    return (
      <main className="min-h-screen bg-emerald-50 px-6 py-16">
        <section className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-white p-10 text-center shadow-xl">
          <CheckCircle className="mx-auto mb-5 h-16 w-16 text-emerald-600" />
          <h1 className="text-3xl font-bold text-gray-900">Calendar synced</h1>
          <p className="mt-3 text-gray-600">{events.length} verified event{events.length === 1 ? '' : 's'} added to your primary Google Calendar.</p>
          <button onClick={() => { setStep('upload'); setEvents([]); setDocumentType(null); }} className="mt-8 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700">
            Process another timetable
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-5 py-10 text-gray-900">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 font-semibold text-emerald-900">
              <Calendar className="h-5 w-5" /> TTS
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Timetable to Google Calendar</h1>
            <p className="mt-2 text-gray-600">Recognize the format, match your semester profile, verify every field, then sync once.</p>
          </div>
          {session ? (
            <div className="flex flex-wrap items-center gap-2 self-start">
              <span className="rounded-xl bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900">
                Google connected
              </span>
              <button type="button" onClick={() => signOut()} className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">
                Log out
              </button>
            </div>
          ) : (
            <button onClick={() => signIn('google')} className="self-start rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
              Connect Google Calendar
            </button>
          )}
        </header>

        {step === 'upload' && (
          <section className="rounded-3xl border border-gray-200 bg-white p-7 shadow-xl sm:p-10">
            <div className="grid gap-6 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block font-semibold">Your full group code</span>
                <input value={groupCode} onChange={event => setGroupCode(event.target.value)} placeholder="e.g. BBIT 2.2 D" className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                <span className="mt-2 block text-sm text-gray-500">Include the subgroup letter when you have one. Change this every semester.</span>
              </label>
              <label className="block">
                <span className="mb-2 block font-semibold">Timetable kind</span>
                <select value={typeHint} onChange={event => setTypeHint(event.target.value as TypeHint)} className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  <option value="auto">Detect automatically</option>
                  <option value="class">Regular weekly classes</option>
                  <option value="cat">CAT timetable</option>
                  <option value="exam">Final exam timetable</option>
                </select>
                <span className="mt-2 block text-sm text-gray-500">Automatic detection checks the full document layout before extracting.</span>
              </label>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block font-semibold">Other ways your group may be printed</span>
                <textarea value={groupAliases} onChange={event => setGroupAliases(event.target.value)} rows={4} placeholder={'One per line, for example:\nBBIT Year 2.2D\nBBIT 2.2 A & D'} className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                <span className="mt-2 block text-sm text-gray-500">Optional. These are exact aliases, never fuzzy matches to another group.</span>
              </label>
              <label className="block">
                <span className="mb-2 block font-semibold">Units you are taking this semester</span>
                <textarea value={courseCatalog} onChange={event => setCourseCatalog(event.target.value)} rows={5} placeholder={'One per line:\nBBT2206 | Probability and Statistics I | Alice Muta\nNO CODE | Maisha | Exact lecturer name'} className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                <span className="mt-2 block text-sm text-gray-500">Use <strong>NO CODE</strong> for Maisha, electives, or any unit whose timetable cell has no printed code.</span>
                <span className="mt-2 block text-sm text-gray-500">Optional but recommended. Exact unit and lecturer names anchor OCR and filter out units you are not taking.</span>
              </label>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Semester starts" value={semesterStart} type="date" onChange={setSemesterStart} />
              <Field label="Semester ends" value={semesterEnd} type="date" onChange={setSemesterEnd} />
            </div>

            <label className={`mt-8 flex h-56 flex-col items-center justify-center rounded-2xl border-2 border-dashed transition ${loading ? 'cursor-wait border-emerald-300 bg-emerald-50' : 'cursor-pointer border-gray-300 hover:border-emerald-500 hover:bg-emerald-50'}`}>
              <Upload className="mb-4 h-14 w-14 text-emerald-600" />
              <span className="text-lg font-bold">{loading ? 'Reading every page.' : 'Choose timetable PDF'}</span>
              <span className="mt-2 text-sm text-gray-500">PDF only, up to 15 MB</span>
              <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFileUpload} disabled={loading} />
            </label>

            {error && <ErrorBox message={error} />}
            <p className="mt-6 text-center text-xs text-gray-500">Always compare the extracted course, lecturer, venue, date, and time with the official timetable before syncing.</p>
          </section>
        )}

        {step === 'preview' && documentType && (
          <>
            <section className="rounded-3xl border border-gray-200 bg-white p-7 shadow-xl sm:p-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-emerald-700"><FileCheck2 className="h-5 w-5" /><span className="font-semibold">{typeLabel(documentType)}</span></div>
                  <h2 className="mt-2 text-2xl font-bold">Verify {events.length} matching event{events.length === 1 ? '' : 's'}</h2>
                  <p className="mt-1 text-gray-600">Format: <strong>{formatLabel}</strong> � Target group: <strong>{groupCode}</strong>. Every field below is editable.</p>
                </div>
                <button onClick={() => setStep('upload')} className="self-start text-sm font-semibold text-emerald-700 hover:underline">Upload a different PDF</button>
              </div>

              {warnings.map((warning, index) => <div key={index} className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{warning}</div>)}
              {events.length === 0 && <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">No matching rows were found. Check the group code and do not sync an empty result.</div>}

              <div className="mt-7 space-y-5">
                {events.map((event, index) => (
                  <article key={index} className={`rounded-2xl border p-5 ${event.ambiguousMatch ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Event {index + 1}</span>
                        {event.ambiguousMatch && <div className="mt-1 flex items-center gap-2 font-semibold text-amber-800"><ShieldAlert className="h-4 w-4" />Verification required: check code characters, lecturer spelling, venue, time, and subgroup</div>}
                      </div>
                      <button onClick={() => removeEvent(index)} className="text-sm font-semibold text-red-600 hover:underline">Remove</button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Course unit" value={event.courseUnit} onChange={value => updateEvent(index, 'courseUnit', value)} />
                      <Field label="Lecturer" value={event.lecturer || ''} onChange={value => updateEvent(index, 'lecturer', value || undefined)} />
                      <Field label="Venue" value={event.venue} onChange={value => updateEvent(index, 'venue', value)} />
                      {documentType !== 'class' ? (
                        <Field label="Date" value={event.date || ''} type="date" onChange={value => updateEvent(index, 'date', value || null)} />
                      ) : (
                        <Field label="Day" value={event.day || ''} onChange={value => updateEvent(index, 'day', value || null)} />
                      )}
                      <Field label="Matched group label" value={event.matchedGroupLabel} onChange={value => updateEvent(index, 'matchedGroupLabel', value)} />
                      <Field label="Official start" value={event.startTime} type="time" onChange={value => updateEvent(index, 'startTime', value)} />
                      <Field label="Official end" value={event.endTime} type="time" onChange={value => updateEvent(index, 'endTime', value)} />
                    </div>
                    <p className="mt-4 text-sm text-gray-600">Official slot: {event.date || event.day} � {formatTimeRange(event)} � {event.venue}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-7 shadow-xl sm:p-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-blue-700"><Clock3 className="h-5 w-5" /><span className="font-semibold">Safe sandbox - nothing here writes to Google</span></div>
                  <h2 className="mt-2 text-2xl font-bold">How this will look in your calendar</h2>
                  <p className="mt-1 text-gray-600">
                    {documentType === 'class'
                      ? `Sample week from ${comparisonRange.start}; these blocks repeat weekly until ${semesterEnd}.`
                      : `${typeLabel(documentType)} blocks from ${comparisonRange.start} to ${comparisonRange.end}, including the one-hour arrival buffer.`}
                  </p>
                </div>
                {session ? (
                  <button onClick={compareCalendar} disabled={calendarLoading} className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-50">
                    {calendarLoading ? 'Reading calendar.' : calendarCompared ? 'Refresh real-calendar overlay' : 'Overlay my real calendar'}
                  </button>
                ) : (
                  <button onClick={connectCalendar} className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 hover:bg-blue-100">Connect Google for comparison</button>
                )}
              </div>
              <SandboxCalendar
                documentType={documentType}
                events={events}
                semesterStart={semesterStart}
                existingEvents={existingCalendarEvents}
                calendarCompared={calendarCompared}
              />
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-7 shadow-xl sm:p-10">
              <h2 className="text-xl font-bold">Calendar behavior</h2>
              {documentType !== 'class' ? (
                <p className="mt-2 text-gray-600">Each {documentType === 'cat' ? 'CAT' : 'exam'} calendar block begins <strong>1 hour before</strong> the official start and continues through the official end. Alerts are set 30 minutes, 1 day, 3 days, 5 days, and 1 week before the early-arrival block.</p>
              ) : (
                <>
                  <p className="mt-2 text-gray-600">Classes repeat weekly with one alert 30 minutes before the official start.</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Field label="Semester starts" value={semesterStart} type="date" onChange={setSemesterStart} />
                    <Field label="Semester ends" value={semesterEnd} type="date" onChange={setSemesterEnd} />
                  </div>
                </>
              )}

              {ambiguousCount > 0 && (
                <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <input type="checkbox" checked={ambiguousConfirmed} onChange={event => setAmbiguousConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-600" />
                  <span className="text-sm text-amber-950">I checked all {ambiguousCount} highlighted row{ambiguousCount === 1 ? '' : 's'} against the official PDF, including easily confused code characters (J/&#123;, I/1, O/0), lecturer spelling, code-less units, venue, time, and subgroup.</span>
                </label>
              )}

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <input type="checkbox" checked={syncConfirmed} onChange={event => setSyncConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-600" />
                <span className="text-sm text-emerald-950">I consent to sync these {events.length} reviewed events to my primary Google Calendar now.</span>
              </label>

              {error && <ErrorBox message={error} />}
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                {!session ? (
                  <button onClick={connectCalendar} disabled={status === 'loading'} className="flex-1 rounded-xl bg-emerald-600 px-6 py-4 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Connect Google Calendar</button>
                ) : (
                  <button onClick={syncCalendar} disabled={syncing || events.length === 0 || !syncConfirmed || (ambiguousCount > 0 && !ambiguousConfirmed)} className="flex-1 rounded-xl bg-emerald-600 px-6 py-4 font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {syncing ? 'Syncing.' : `Sync ${events.length} event${events.length === 1 ? '' : 's'} to Google Calendar`}
                  </button>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function SandboxCalendar({
  documentType,
  events,
  semesterStart,
  existingEvents,
  calendarCompared,
}: {
  documentType: DocumentType;
  events: TimetableEvent[];
  semesterStart: string;
  existingEvents: ExistingCalendarEvent[];
  calendarCompared: boolean;
}) {
  const proposed = events.map((event, index) => ({
    ...event,
    index,
    previewDate: documentType === 'class' ? classDate(semesterStart, event.day) : (event.date || semesterStart),
    previewStart: calendarStart(event.startTime, documentType),
  })).sort((a, b) => `${a.previewDate}${a.previewStart}`.localeCompare(`${b.previewDate}${b.previewStart}`));
  const dates = Array.from(new Set(proposed.map(event => event.previewDate)));
  let clashCount = 0;

  const clashesWithExisting = (event: typeof proposed[number]) => {
    const proposedStart = Number(event.previewStart.slice(0, 2)) * 60 + Number(event.previewStart.slice(3, 5));
    const proposedEnd = Number(event.endTime.slice(0, 2)) * 60 + Number(event.endTime.slice(3, 5));
    return existingEvents.filter(existing => {
      if (existing.allDay || existing.start.slice(0, 10) !== event.previewDate) return false;
      const start = timeMinutes(existing.start);
      const end = timeMinutes(existing.end);
      return start !== null && end !== null && proposedStart < end && proposedEnd > start;
    });
  };

  return (
    <div className="mt-7">
      {calendarCompared && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
          Read-only comparison loaded: proposed TTS blocks are coloured; your existing Google events are grey. No calendar data was changed.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dates.map(date => {
          const dayProposed = proposed.filter(event => event.previewDate === date);
          const dayExisting = existingEvents.filter(event => event.start.slice(0, 10) === date);
          return (
            <div key={date} className="min-h-64 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="border-b border-gray-200 pb-3 font-bold text-gray-900">{displayDate(date)}</h3>
              <div className="mt-3 space-y-2">
                {dayProposed.map(event => {
                  const clashes = clashesWithExisting(event);
                  if (clashes.length) clashCount += 1;
                  return (
                    <div key={`proposed-${event.index}`} className={`rounded-xl border-l-4 p-3 shadow-sm ${documentType === 'class' ? 'border-l-emerald-500 bg-emerald-50' : documentType === 'cat' ? 'border-l-amber-500 bg-amber-50' : 'border-l-red-500 bg-red-50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-gray-950">{event.courseUnit}</span>
                        {clashes.length > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Clash</span>}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-gray-700">{displayClock(event.previewStart)}-{displayClock(event.endTime)}</div>
                      {documentType !== 'class' && <div className="mt-1 text-xs text-gray-600">Official start: {displayClock(event.startTime)}</div>}
                      <div className="mt-1 text-xs text-gray-600">{event.venue}</div>
                      {clashes.map(clash => <div key={clash.id} className="mt-2 rounded bg-white/80 px-2 py-1 text-xs font-semibold text-red-700">Overlaps: {clash.summary}</div>)}
                    </div>
                  );
                })}
                {calendarCompared && dayExisting.slice(0, 12).map(existing => (
                  <div key={`existing-${existing.id}`} className="rounded-xl border border-gray-300 bg-white p-3 text-gray-700">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Already in Google</div>
                    <div className="mt-1 font-semibold">{existing.summary}</div>
                    <div className="text-xs">{existing.allDay ? 'All day' : `${displayClock(existing.start.slice(11, 16))}-${displayClock(existing.end.slice(11, 16))}`}</div>
                  </div>
                ))}
                {calendarCompared && dayExisting.length > 12 && <div className="text-xs font-semibold text-gray-500">+{dayExisting.length - 12} more existing events</div>}
              </div>
            </div>
          );
        })}
      </div>
      {calendarCompared && clashCount === 0 && <p className="mt-4 text-sm font-semibold text-emerald-700">No direct time clashes were detected against the loaded Google Calendar range.</p>}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
      <input type={type} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
    </label>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-red-700"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span className="text-sm">{message}</span></div>;
}
