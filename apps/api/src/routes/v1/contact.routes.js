import { Router } from 'express';
import { v } from '../../middleware/schemas.js';
import { contactLimiter } from '../../middleware/rateLimit.js';
import { submitInquiry, formNonce } from '../../services/inquiry.service.js';

/**
 * Public contact endpoint.
 *
 * Unauthenticated and rate limited, since it is the one write path open to the
 * internet. Everything it returns is deliberately unremarkable: a caller learns
 * nothing about whether a submission was flagged as spam.
 */
/**
 * Validation for the body lives in the shared schema map under the key
 * `publicContact`, so the same definition serves the form, the API, and the tests.
 */
const router = Router();

/**
 * GET /api/v1/contact/nonce
 *
 * Returns a timestamp the form posts back, so the server can tell an implausible
 * submission time from a human one. Not a security token — the real defences are
 * the rate limiter, the honeypot, and the scoring heuristics.
 */
router.get('/nonce', (request, response) => {
  response.json({ data: { nonce: formNonce(), loadedAt: Date.now() } });
});

/**
 * POST /api/v1/contact
 *
 * Success returns 201 with only an id. A spam submission returns the same shape,
 * so a bot learns nothing from the response.
 */
router.post('/', contactLimiter, v('publicContact'), async (request, response) => {
  const result = await submitInquiry(request.body, request);

  response.status(201).json({
    data: {
      id: result.id,
      message: 'Thank you. Your message has been received and we will be in touch.',
    },
  });
});

export default router;