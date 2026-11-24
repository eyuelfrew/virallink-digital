/**
 * Update-schema tests.
 *
 * An update endpoint must only change the fields it was given. In Zod 4,
 * `z.object(...).partial()` does NOT remove an inner `.default()`, so a schema
 * built that way still writes the default onto every omitted field. The API
 * writes the parsed body straight onto the row, so the effect was silent:
 *
 *   - moving a task on the board reset its priority to "medium";
 *   - editing a published service or post unpublished it;
 *   - editing a client's phone number reset its status and un-published it;
 *   - editing an issued invoice reverted it to a draft and zeroed its tax.
 *
 * These tests parse a minimal body against every update schema and assert that
 * nothing extra appears in the result.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  updateEmployeeSchema,
  updateShareholderSchema,
  updateClientSchema,
  updateDeliverableSchema,
  updateMetricSchema,
  updateContentItemSchema,
  updateProposalSchema,
  updateServiceSchema,
  updateProjectSchema,
  updateTransactionSchema,
  updateInvoiceSchema,
  updateTaskSchema,
  updateBlogPostSchema,
  updateTestimonialSchema,
  updateCompanyStatSchema,
  updateJobSchema,
  updateTelegramCatalogSchema,
  updateTelegramRuleSchema,
  updateTelegramMenuButtonSchema,
} from '../src/shared/schemas.js';

/** One representative field per schema, chosen because it is not defaulted. */
const CASES = [
  ['updateEmployeeSchema', updateEmployeeSchema, { position: 'Developer' }],
  ['updateShareholderSchema', updateShareholderSchema, { name: 'X' }],
  ['updateClientSchema', updateClientSchema, { phone: '1' }],
  ['updateDeliverableSchema', updateDeliverableSchema, { title: 'X' }],
  ['updateMetricSchema', updateMetricSchema, { views: 5 }],
  ['updateContentItemSchema', updateContentItemSchema, { title: 'X' }],
  ['updateProposalSchema', updateProposalSchema, { title: 'X' }],
  ['updateServiceSchema', updateServiceSchema, { title: 'X' }],
  ['updateProjectSchema', updateProjectSchema, { title: 'X' }],
  ['updateTransactionSchema', updateTransactionSchema, { amount: '10.00' }],
  ['updateInvoiceSchema', updateInvoiceSchema, { status: 'issued' }],
  ['updateTaskSchema', updateTaskSchema, { status: 'done' }],
  ['updateBlogPostSchema', updateBlogPostSchema, { title: 'X' }],
  ['updateTestimonialSchema', updateTestimonialSchema, { authorName: 'X' }],
  ['updateCompanyStatSchema', updateCompanyStatSchema, { label: 'X' }],
  ['updateJobSchema', updateJobSchema, { title: 'X' }],
  ['updateTelegramCatalogSchema', updateTelegramCatalogSchema, { name: 'X' }],
  ['updateTelegramRuleSchema', updateTelegramRuleSchema, { name: 'X' }],
  ['updateTelegramMenuButtonSchema', updateTelegramMenuButtonSchema, { label: 'X' }],
];

test('an update schema injects no default for a field the caller omitted', () => {
  for (const [name, schema, input] of CASES) {
    const result = schema.safeParse(input);

    assert.equal(result.success, true, `${name} rejected a valid partial body`);

    const injected = Object.keys(result.data).filter((key) => !(key in input));
    assert.deepEqual(
      injected,
      [],
      `${name} injected ${injected.join(', ')} for a body that did not mention it`,
    );
  }
});

test('an update schema rejects an empty body', () => {
  for (const [name, schema] of CASES) {
    const result = schema.safeParse({});

    assert.equal(result.success, false, `${name} accepted an empty body`);
  }
});
