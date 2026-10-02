import crypto from 'node:crypto';
import { models } from '../models/index.js';
import { publicContactSchema } from '@virallink/shared/schemas';
import { hashIp } from './media.service.js';
import { logAuth } from '../middleware/audit.js';
import { invalidatePublicContent } from './public.service.js';

/**
 * Contact form intake.
 *
 * This is the only unauthenticated write endpoint, so it carries extra care:
 *
 *  - a honeypot field (`website`) that a human never sees and a bot usually fills
 *  - a heuristic spam score combining several weak signals
 *  - the submitter's IP stored only as a salted HMAC, never in the clear
 *  - the raw error never reveals whether an address already exists
 *
 * Spam is scored rather than blocked outright, because a false positive means
 * losing a real lead. High-scoring submissions are stored and hidden from the
 * default inbox view instead of being discarded.
 */

const { ContactInquiry, Service } = models;

/**
 * Heuristic spam scoring.
 *
 * Every signal is weak on its own; together they separate a form submission from
 * a bot. Each contributes a few points and a total above the threshold marks the
 * row as spam.
 */
export function scoreSpam({ body, honeypot, ipHash, request, elapsedMs }) {
  let score = 0;
  const reasons = [];

  // A filled honeypot is the strongest single signal.
  if (honeypot) {
    score += 100;
    reasons.push('honeypot');
  }

  const text = JSON.stringify(body).toLowerCase();

  if (/(https?:\/\/|www\.)/.test(text)) {
    score += 15;
    reasons.push('links');
  }

  // Repeated characters are a common bot tell.
  if (/(.)\1{9,}/.test(text)) {
    score += 20;
    reasons.push('repeated_characters');
  }

  if (/<[^>]*>|\bdiv\b|\bscript\b/i.test(text)) {
    score += 25;
    reasons.push('markup');
  }

  // Submitted implausibly fast, which no human types.
  if (elapsedMs !== null && elapsedMs < 1500) {
    score += 15;
    reasons.push('too_fast');
  }

  // Missing a User-Agent is unusual for a browser.
  if (!request?.get?.('user-agent')) {
    score += 10;
    reasons.push('no_user_agent');
  }

  if (!ipHash) {
    score += 5;
    reasons.push('no_ip');
  }

  return { score: Math.min(score, 100), reasons };
}

/**
 * Accept a contact form submission.
 *
 * Returns a neutral result either way: the response never reveals that a
 * submission was flagged as spam, which would let a bot tune itself.
 */
export async function submitInquiry(payload, request) {
  const data = publicContactSchema.parse(payload);

  // Referrer and UTM values are stored for attribution.
  const referrer = request.get('referer') || null;
  const utmSource = request.query?.utm_source || null;
  const utmMedium = request.query?.utm_medium || null;
  const utmCampaign = request.query?.utm_campaign || null;

  const ip = request.ip;
  const ipHash = hashIp(ip);

  // The form renders a hidden timestamp; a submission that arrives faster than a
  // human could type is almost certainly automated.
  const formLoadedAt = Number(request.get('x-form-loaded-at'));
  const elapsedMs = Number.isFinite(formLoadedAt) && formLoadedAt > 0 ? Date.now() - formLoadedAt : null;

  const { score, reasons } = scoreSpam({
    body: data,
    honeypot: data.website,
    ipHash,
    request,
    elapsedMs,
  });

  // Only reference a service that is actually published, so a spammer cannot
  // probe unpublished service ids.
  let serviceId = null;
  if (data.serviceId) {
    const service = await Service.findOne({ where: { id: data.serviceId, isPublished: true }, attributes: ['id'] });
    serviceId = service?.id || null;
  }

  const inquiry = await ContactInquiry.create({
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    company: data.company || null,
    subject: data.subject || null,
    serviceId,
    message: data.message,
    status: 'new',
    isRead: false,
    isArchived: false,
    ipHash,
    spamScore: score,
    utmSource,
    utmMedium,
    utmCampaign,
    referrer,
  });

  await logAuth(request, {
    action: 'contact_submitted',
    userEmail: data.email,
    metadata: { inquiryId: inquiry.id, spamScore: score, ...(reasons.length ? { reasons } : {}) },
  });

  // A new lead changes the dashboard's unread count and recent-inquiries feed.
  invalidatePublicContent();

  return { id: inquiry.id };
}

/**
 * Cheap, deterministic nonce used by the contact form to time submissions.
 * Not a security control: the real protection is the rate limiter plus scoring.
 */
export function formNonce() {
  return crypto.randomBytes(8).toString('hex');
}

export default submitInquiry;