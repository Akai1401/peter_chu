import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiService, extractReminderPayload } from './gemini-service.js';

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

test('extractReminderPayload - returns null when no reminder tag present', () => {
  const text = 'Chào bạn, chúc bạn một ngày tốt lành nhé!';
  const res = extractReminderPayload(text);
  assert.strictEqual(res.cleanReplyText, text);
  assert.strictEqual(res.reminderPayload, null);
});

test('extractReminderPayload - extracts reminder payload with MESSAGE_AND_CALL and cleans text', () => {
  const text = `Dạ mình đã lên lịch nhắc bạn uống thuốc vào lúc 20:00 tối nay kèm gọi điện rồi nhé! Đến giờ mình sẽ gọi và nhắn nhắc bạn nha! 😊
<<<CREATE_REMINDER
{
  "title": "Nhắc uống thuốc",
  "content": "Đã 20:00 rồi, nhớ uống thuốc nhé!",
  "actionType": "MESSAGE_AND_CALL",
  "targetDate": "2026-09-16",
  "windowStart": "20:00",
  "windowEnd": "20:00",
  "intervalMinutes": 1,
  "maxRuns": 1
}
>>>`;

  const res = extractReminderPayload(text);
  assert.ok(res.reminderPayload !== null);
  assert.strictEqual(res.reminderPayload?.title, 'Nhắc uống thuốc');
  assert.strictEqual(res.reminderPayload?.content, 'Đã 20:00 rồi, nhớ uống thuốc nhé!');
  assert.strictEqual(res.reminderPayload?.actionType, 'MESSAGE_AND_CALL');
  assert.strictEqual(res.reminderPayload?.targetDate, '2026-09-16');
  assert.strictEqual(res.reminderPayload?.windowStart, '20:00');
  assert.strictEqual(res.reminderPayload?.windowEnd, '20:00');
  assert.strictEqual(res.reminderPayload?.intervalMinutes, 1);
  assert.strictEqual(res.reminderPayload?.maxRuns, 1);
  assert.strictEqual(res.cleanReplyText, 'Dạ mình đã lên lịch nhắc bạn uống thuốc vào lúc 20:00 tối nay kèm gọi điện rồi nhé! Đến giờ mình sẽ gọi và nhắn nhắc bạn nha! 😊');
});

test('extractReminderPayload - handles markdown code fence inside tag and normalizes time', () => {
  const text = `Dạ em đã đặt lịch nhắc họp lúc 8h sáng mai cho anh rồi ạ!
<<<CREATE_REMINDER
\`\`\`json
{
  "title": "Họp công ty",
  "content": "Họp team đầu tuần!",
  "actionType": "MESSAGE",
  "targetDate": "2026-09-17",
  "windowStart": "8:30",
  "windowEnd": "8:30"
}
\`\`\`
>>>`;

  const res = extractReminderPayload(text);
  assert.ok(res.reminderPayload !== null);
  assert.strictEqual(res.reminderPayload?.title, 'Họp công ty');
  assert.strictEqual(res.reminderPayload?.actionType, 'MESSAGE');
  assert.strictEqual(res.reminderPayload?.windowStart, '08:30');
  assert.strictEqual(res.reminderPayload?.windowEnd, '08:30');
  assert.strictEqual(res.reminderPayload?.maxRuns, 1);
  assert.strictEqual(res.cleanReplyText, 'Dạ em đã đặt lịch nhắc họp lúc 8h sáng mai cho anh rồi ạ!');
});

test('GeminiService - existing reminders status included in prompt context', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url: any, options: any) => {
      const parsedBody = JSON.parse(options.body);
      const promptText = parsedBody.contents[0].parts[0].text;
      assert.ok(promptText.includes('--- TRẠNG THÁI LỊCH NHẮC THỰC TẾ TRONG HỆ THỐNG MÁY CHỦ CỦA KHÁCH NÀY ---'));
      assert.ok(promptText.includes('1. "Gọi dậy" (MESSAGE_AND_CALL) - Ngày: 2026-09-17, Giờ: 06:00'));
      assert.ok(promptText.includes('CHỐNG HỨA LÈO / MÕM'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Yên tâm, mai 6h sáng tôi gọi dậy đúng giờ!' }]
              }
            }
          ]
        })
      } as any;
    }) as any;

    const gemini = new GeminiService({ apiKey: 'dummy_key' });
    const reply = await gemini.generateReply(
      'mai nhớ gì chưa',
      'Khách A',
      [{ role: 'user', text: 'mai 6h gọi tao dậy' }],
      '1. "Gọi dậy" (MESSAGE_AND_CALL) - Ngày: 2026-09-17, Giờ: 06:00 - Trạng thái: ĐANG CHỜ CHẠY'
    );
    assert.strictEqual(reply, 'Yên tâm, mai 6h sáng tôi gọi dậy đúng giờ!');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GeminiService - multimodal image attachments included in request payload as inlineData', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let capturedBody: any = null;
    globalThis.fetch = (async (_url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Đã nhận được ảnh bill chuyển khoản 500k của bạn rồi nhé!' }]
              }
            }
          ]
        })
      } as any;
    }) as any;

    const gemini = new GeminiService({ apiKey: 'dummy_key' });
    const reply = await gemini.generateReply(
      'check bill này hộ tao',
      'Khách A',
      [],
      '',
      [
        {
          mimeType: 'image/jpeg',
          data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD...'
        }
      ]
    );

    assert.strictEqual(reply, 'Đã nhận được ảnh bill chuyển khoản 500k của bạn rồi nhé!');
    assert.ok(capturedBody);
    const parts = capturedBody.contents[0].parts;
    assert.strictEqual(parts.length, 2);
    assert.ok(parts[0].text.includes('check bill này hộ tao'));
    assert.ok(parts[0].text.includes('Khách có gửi kèm 1 hình ảnh'));
    assert.strictEqual(parts[1].inlineData.mimeType, 'image/jpeg');
    assert.strictEqual(parts[1].inlineData.data, '/9j/4AAQSkZJRgABAQEASABIAAD/2wBD...');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GeminiService - analyzePersonaFromMessages parses JSON response', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url: any, options: any) => {
      const parsedBody = JSON.parse(options.body);
      const prompt = parsedBody.contents[0].parts[0].text;
      assert.ok(prompt.includes('Phân tích tỉ mỉ và sâu sắc văn phong'));
      assert.ok(prompt.includes('alo anh ơi'));
      assert.ok(prompt.includes('ok em nhé để anh gửi'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '```json\n{\n  "styleSummary": "Thân mật, xưng anh gọi em",\n  "pronouns": "anh - em",\n  "tone": "Nhiệt tình, nhanh gọn",\n  "catchphrases": ["ok em nhé", "inbox anh"],\n  "sampleMessages": ["ok em nhé để anh gửi"],\n  "rawPromptInstruction": "Luôn xưng anh với khách, trả lời ngắn gọn và thân thiện."\n}\n```'
                  }
                ]
              }
            }
          ]
        })
      } as any;
    }) as any;

    const gemini = new GeminiService({ apiKey: 'dummy_key' });
    const persona = await gemini.analyzePersonaFromMessages(
      ['alo anh ơi', 'ok em nhé để anh gửi'],
      'Context snippet'
    );

    assert.strictEqual(persona.tone, 'Nhiệt tình, nhanh gọn');
    assert.strictEqual(persona.pronouns, 'anh - em');
    assert.deepStrictEqual(persona.catchphrases, ['ok em nhé', 'inbox anh']);
    assert.ok(persona.rawPromptInstruction.includes('Luôn xưng anh với khách'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GeminiService - learned persona is injected into generateReply prompt', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let promptCaptured = '';
    globalThis.fetch = (async (_url: any, options: any) => {
      const parsedBody = JSON.parse(options.body);
      promptCaptured = parsedBody.contents[0].parts[0].text;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Ok em nhé, để anh xem liền nè!' }]
              }
            }
          ]
        })
      } as any;
    }) as any;

    const gemini = new GeminiService({ apiKey: 'dummy_key' });
    const reply = await gemini.generateReply(
      'anh xem giúp em giá với',
      'Khách A',
      [],
      '',
      undefined,
      {
        styleSummary: 'Hài hước, thân mật',
        pronouns: 'anh - em',
        tone: 'Vui vẻ, nhiệt tình',
        catchphrases: ['nè', 'ok em nhé'],
        sampleMessages: ['Ok em nhé để anh check'],
        rawPromptInstruction: 'Xưng anh gọi em cực kỳ thân mật.'
      }
    );

    assert.strictEqual(reply, 'Ok em nhé, để anh xem liền nè!');
    assert.ok(promptCaptured.includes('HỒ SƠ PHONG CÁCH & VĂN PHONG GIAO TIẾP CỦA TÔI'));
    assert.ok(promptCaptured.includes('Vui vẻ, nhiệt tình'));
    assert.ok(promptCaptured.includes('anh - em'));
    assert.ok(promptCaptured.includes('Xưng anh gọi em cực kỳ thân mật.'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
