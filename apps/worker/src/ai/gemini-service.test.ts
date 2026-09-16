import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiService } from './gemini-service.js';

test('GeminiService - configuration check', () => {
  const unconfigured = new GeminiService({ apiKey: '' });
  assert.strictEqual(unconfigured.isConfigured(), false);

  const configured = new GeminiService({ apiKey: 'test_key', model: 'custom-model' });
  assert.strictEqual(configured.isConfigured(), true);
  assert.strictEqual(configured.getModel(), 'custom-model');
});

test('GeminiService - validation on empty key or empty message', async () => {
  const unconfigured = new GeminiService({ apiKey: '' });
  await assert.rejects(
    async () => unconfigured.generateReply('Xin chào'),
    /Gemini API key is not configured/
  );

  const configured = new GeminiService({ apiKey: 'test_key' });
  await assert.rejects(
    async () => configured.generateReply('   '),
    /Incoming message is empty/
  );
});

test('GeminiService - successful reply generation via mock fetch', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url: any, options: any) => {
      const parsedBody = JSON.parse(options.body);
      assert.ok(parsedBody.contents[0].parts[0].text.includes('Hôm nay bạn thế nào?'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Mình khỏe, cảm ơn bạn nhiều nha!' }]
              }
            }
          ]
        })
      } as any;
    }) as any;

    const gemini = new GeminiService({ apiKey: 'dummy_key' });
    const reply = await gemini.generateReply('Hôm nay bạn thế nào?');
    assert.strictEqual(reply, 'Mình khỏe, cảm ơn bạn nhiều nha!');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GeminiService - API error handling', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 403,
        text: async () => 'API key invalid'
      } as any;
    }) as any;

    const gemini = new GeminiService({ apiKey: 'invalid_key' });
    await assert.rejects(
      async () => gemini.generateReply('Alo shop ơi'),
      /Gemini API error \(HTTP 403\): API key invalid/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GeminiService - multi-turn context / conversation history included in prompt', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url: any, options: any) => {
      const parsedBody = JSON.parse(options.body);
      const promptText = parsedBody.contents[0].parts[0].text;
      assert.ok(promptText.includes('--- LỊCH SỬ / BỐI CẢNH HỘI THOẠI TRƯỚC ĐÓ ---'));
      assert.ok(promptText.includes('Bạn có bán iPhone không?'));
      assert.ok(promptText.includes('Dạ có bên mình có iPhone 15'));
      assert.ok(promptText.includes('Giá bao nhiêu vậy?'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Dạ iPhone 15 giá 18 triệu ạ!' }]
              }
            }
          ]
        })
      } as any;
    }) as any;

    const gemini = new GeminiService({ apiKey: 'dummy_key' });
    const reply = await gemini.generateReply(
      'Giá bao nhiêu vậy?',
      'Khách A',
      [
        { role: 'user', text: 'Bạn có bán iPhone không?' },
        { role: 'model', text: 'Dạ có bên mình có iPhone 15' }
      ]
    );
    assert.strictEqual(reply, 'Dạ iPhone 15 giá 18 triệu ạ!');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

