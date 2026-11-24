import test from 'node:test';
import assert from 'node:assert/strict';

import { chatSendSchema, chatReadSchema } from '../src/shared/schemas.js';

test('chatSend accepts a text-only message', () => {
  const value = chatSendSchema.parse({ text: '  Hello  ' });
  assert.equal(value.text, 'Hello');
  assert.equal(value.imageMediaId, undefined);
});

test('chatSend accepts an image-only message', () => {
  const value = chatSendSchema.parse({ imageMediaId: 123 });
  assert.equal(value.text, '');
  assert.equal(value.imageMediaId, 123);
});

test('chatSend accepts a message with both text and an image', () => {
  const value = chatSendSchema.parse({ text: 'Caption', imageMediaId: 123, replyToId: 7 });
  assert.equal(value.text, 'Caption');
  assert.equal(value.imageMediaId, 123);
  assert.equal(value.replyToId, 7);
});

test('chatSend rejects an empty message', () => {
  assert.throws(() => chatSendSchema.parse({ text: '   ' }));
});

test('chatRead accepts a specific message id or the whole thread', () => {
  assert.equal(chatReadSchema.parse({ messageId: 9 }).messageId, 9);
  assert.equal(chatReadSchema.parse({}).messageId, undefined);
});
