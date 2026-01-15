// src/lib/security.ts
// ✅ FIXED: Phone validation now optional

const rateLimitMap = new Map<string, number[]>();

export function rateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(ip) || [];
  
  const validRequests = requests.filter(time => now - time < windowMs);
  
  if (validRequests.length >= maxRequests) {
    return false;
  }
  
  validRequests.push(now);
  rateLimitMap.set(ip, validRequests);
  
  return true;
}

export function sanitizeInput(text: string): string {
  return text
    .replace(/<script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ✅ FIXED: Phone is now optional - return true if empty
export function validatePhone(phone: string): boolean {
  if (!phone || phone.trim() === '') return true; // Optional
  
  // If provided, must be valid Kenyan format
  const cleaned = phone.replace(/\s+/g, '').replace(/\+/g, '');
  return /^254\d{9}$/.test(cleaned);
}