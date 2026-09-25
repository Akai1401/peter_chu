import { getLocalTimeParts, LearnedPersona } from '@messenger/shared';

export interface ConversationMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AiCreatedReminderPayload {
  title: string;
  content: string;
  actionType: 'MESSAGE' | 'MESSAGE_AND_CALL';
  targetDate?: string | null; // YYYY-MM-DD or null for daily recurring
  windowStart: string; // HH:mm
  windowEnd: string; // HH:mm
  intervalMinutes: number;
  maxRuns: number; // 0 for unlimited daily recurring
  wakeUpMode?: boolean;
  isDaily?: boolean;
}

export interface ImageAttachment {
  mimeType: string;
  data: string; // base64 representation
}

export interface CancelReminderPayload {
  reminderId?: string;
  title?: string;
  cancelAll?: boolean;
  reason?: string;
}

export interface ParseAiReplyResult {
  cleanReplyText: string;
  reminderPayloads: AiCreatedReminderPayload[];
  cancelPayloads: CancelReminderPayload[];
  reminderPayload: AiCreatedReminderPayload | null;
}

function parseSingleReminderObject(rawObj: any, defaultDate: string): AiCreatedReminderPayload | null {
  if (!rawObj || typeof rawObj !== 'object') return null;

  const title = String(rawObj.title || 'Reminder').trim();
  const content = String(rawObj.content || title).trim();
  const actionType: 'MESSAGE' | 'MESSAGE_AND_CALL' =
    rawObj.actionType === 'MESSAGE_AND_CALL' ? 'MESSAGE_AND_CALL' : 'MESSAGE';

  const isDaily =
    rawObj.isDaily === true ||
    rawObj.targetDate === null ||
    rawObj.targetDate === '' ||
    String(rawObj.targetDate).toUpperCase() === 'DAILY';

  let targetDate: string | null = null;
  if (!isDaily) {
    if (typeof rawObj.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawObj.targetDate.trim())) {
      targetDate = rawObj.targetDate.trim();
    } else {
      targetDate = defaultDate;
    }
  }

  const normalizeTime = (t?: string): string => {
    if (!t || typeof t !== 'string') return '08:00';
    const parts = t.trim().split(':');
    if (parts.length >= 2) {
      const h = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
      const m = String(parseInt(parts[1], 10) || 0).padStart(2, '0');
      return `${h}:${m}`;
    }
    return '08:00';
  };

  const windowStart = normalizeTime(rawObj.windowStart);
  const windowEnd = normalizeTime(rawObj.windowEnd || rawObj.windowStart);
  const intervalMinutes = Math.max(1, Number(rawObj.intervalMinutes) || 1);
  const maxRuns = isDaily
    ? (rawObj.maxRuns !== undefined && Number(rawObj.maxRuns) >= 0 ? Number(rawObj.maxRuns) : 0)
    : Math.max(1, Number(rawObj.maxRuns) || 1);
  const wakeUpMode = Boolean(rawObj.wakeUpMode);

  return {
    title,
    content,
    actionType,
    targetDate,
    windowStart,
    windowEnd,
    intervalMinutes,
    maxRuns,
    wakeUpMode,
    isDaily
  };
}

/**
 * Safely extracts individual complete JSON objects from a potentially truncated or malformed JSON text.
 */
export function extractCompleteJsonObjects(text: string): any[] {
  const results: any[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let startIndex = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') {
      if (depth === 0) startIndex = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && startIndex !== -1) {
        const candidate = text.slice(startIndex, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object') {
            results.push(parsed);
          }
        } catch {
          // ignore malformed snippet
        }
        startIndex = -1;
      } else if (depth < 0) {
        depth = 0;
        startIndex = -1;
      }
    }
  }
  return results;
}

/**
 * Extracts and parses <<<CREATE_REMINDER ... >>> and <<<CANCEL_REMINDER ... >>> payloads from AI generated reply.
 * Resilient against token truncation, unclosed tags, and multiline formatting.
 */
export function extractReminderPayload(rawReplyText: string): ParseAiReplyResult {
  if (!rawReplyText) {
    return { cleanReplyText: '', reminderPayloads: [], cancelPayloads: [], reminderPayload: null };
  }

  const nowParts = getLocalTimeParts(new Date());
  const defaultDate = `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-${String(nowParts.day).padStart(2, '0')}`;

  const reminderPayloads: AiCreatedReminderPayload[] = [];
  const cancelPayloads: CancelReminderPayload[] = [];

  // 1. Extract all <<<CREATE_REMINDER ... >>> blocks (handles closed >>> as well as truncated/unclosed at EOF)
  const createRegex = /<<<\s*CREATE_REMINDER\s*([\s\S]*?)(?:>>>|$)/gi;
  let createMatch: RegExpExecArray | null;
  while ((createMatch = createRegex.exec(rawReplyText)) !== null) {
    const rawJson = createMatch[1]
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    if (!rawJson) continue;

    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const itemPayload = parseSingleReminderObject(item, defaultDate);
          if (itemPayload) reminderPayloads.push(itemPayload);
        }
      } else if (parsed && typeof parsed === 'object') {
        const itemPayload = parseSingleReminderObject(parsed, defaultDate);
        if (itemPayload) reminderPayloads.push(itemPayload);
      }
    } catch (err: any) {
      // Fallback: recover complete JSON objects if array was truncated or malformed
      const recoveredObjects = extractCompleteJsonObjects(rawJson);
      if (recoveredObjects.length > 0) {
        for (const item of recoveredObjects) {
          const itemPayload = parseSingleReminderObject(item, defaultDate);
          if (itemPayload) reminderPayloads.push(itemPayload);
        }
        console.warn(`[GeminiService] Recovered ${recoveredObjects.length} reminder(s) from truncated/malformed CREATE_REMINDER payload.`);
      } else {
        console.warn('[GeminiService] Failed to parse CREATE_REMINDER JSON payload:', err.message, rawJson);
      }
    }
  }

  // 2. Extract all <<<CANCEL_REMINDER ... >>> blocks (handles closed >>> as well as truncated/unclosed at EOF)
  const cancelRegex = /<<<\s*CANCEL_REMINDER\s*([\s\S]*?)(?:>>>|$)/gi;
  let cancelMatch: RegExpExecArray | null;
  while ((cancelMatch = cancelRegex.exec(rawReplyText)) !== null) {
    const rawJson = cancelMatch[1]
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    if (!rawJson) continue;

    const processCancelItem = (item: any) => {
      if (!item || typeof item !== 'object') return;
      const reminderId = item.reminderId ? String(item.reminderId).trim() : undefined;
      const title = item.title ? String(item.title).trim() : undefined;
      const cancelAll = Boolean(item.cancelAll);
      const reason = item.reason ? String(item.reason).trim() : undefined;
      if (reminderId || title || cancelAll) {
        cancelPayloads.push({ reminderId, title, cancelAll, reason });
      }
    };

    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) processCancelItem(item);
      } else if (parsed && typeof parsed === 'object') {
        processCancelItem(parsed);
      }
    } catch (err: any) {
      const recoveredObjects = extractCompleteJsonObjects(rawJson);
      if (recoveredObjects.length > 0) {
        for (const item of recoveredObjects) processCancelItem(item);
        console.warn(`[GeminiService] Recovered ${recoveredObjects.length} cancel item(s) from truncated/malformed CANCEL_REMINDER payload.`);
      } else {
        console.warn('[GeminiService] Failed to parse CANCEL_REMINDER JSON payload:', err.message, rawJson);
      }
    }
  }

  // 3. Clean reply text by completely stripping all command blocks even if unclosed or truncated at EOF
  const cleanReplyText = rawReplyText
    .replace(/<<<\s*CREATE_REMINDER[\s\S]*?(?:>>>|$)/gi, '')
    .replace(/<<<\s*CANCEL_REMINDER[\s\S]*?(?:>>>|$)/gi, '')
    .trim();

  return {
    cleanReplyText,
    reminderPayloads,
    cancelPayloads,
    reminderPayload: reminderPayloads[0] || null
  };
}

export interface GeminiServiceOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export class GeminiService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options?: GeminiServiceOptions) {
    this.apiKey = options?.apiKey !== undefined
      ? options.apiKey
      : (process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '');
    this.model = options?.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    this.timeoutMs = options?.timeoutMs || 15000;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getModel(): string {
    return this.model;
  }

  async generateReply(
    incomingMessage: string,
    senderName?: string,
    conversationHistory?: ConversationMessage[],
    existingRemindersInfo?: string,
    imageAttachments?: ImageAttachment[],
    learnedPersona?: LearnedPersona | null
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured');
    }

    const hasImages = Array.isArray(imageAttachments) && imageAttachments.length > 0;
    let trimmedInput = incomingMessage.trim();
    if (!trimmedInput && !hasImages) {
      throw new Error('Incoming message is empty');
    }

    if (!trimmedInput && hasImages) {
      trimmedInput = '[Khách đã gửi một hình ảnh]';
    }

    const prompt = this.buildPrompt(
      trimmedInput,
      senderName,
      conversationHistory,
      existingRemindersInfo,
      hasImages ? imageAttachments.length : 0,
      learnedPersona
    );

    // Build multimodal contents parts
    const contentParts: any[] = [{ text: prompt }];
    if (hasImages) {
      for (const img of imageAttachments) {
        if (!img.data) continue;
        const cleanBase64 = img.data.replace(/^data:[^;]+;base64,/, '').trim();
        if (cleanBase64) {
          contentParts.push({
            inlineData: {
              mimeType: img.mimeType || 'image/jpeg',
              data: cleanBase64
            }
          });
        }
      }
    }

    const candidateModels = Array.from(new Set([
      this.model,
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.6-flash'
    ])).filter(Boolean);

    let lastError: Error | null = null;

    for (const modelName of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: contentParts }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2500
            }
          })
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          lastError = new Error(`Gemini API error (HTTP ${response.status}): ${errorBody}`);
          if (response.status === 400 || response.status === 429 || response.status === 404) {
            console.warn(`[GeminiService] Model ${modelName} returned HTTP ${response.status}. Trying next fallback model...`);
            continue;
          }
          throw lastError;
        }

        const data = (await response.json()) as any;
        const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
        // Thinking models (gemini-2.5-flash) return parts with `thought: true` for reasoning.
        // The actual response is the last part that is NOT a thought.
        const responsePart = parts.filter((p: any) => !p.thought).pop();
        const reply = responsePart?.text?.trim();

        if (!reply) {
          lastError = new Error(`Empty response from Gemini API model ${modelName}`);
          continue;
        }

        return reply;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          lastError = new Error(`Gemini API request timed out after ${this.timeoutMs}ms for ${modelName}`);
        } else {
          lastError = err;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError || new Error('All Gemini candidate models failed to generate reply');
  }

  /**
   * Analyzes real outgoing messages sent by the account owner to extract their unique communication style,
   * tone of voice, pronouns, catchphrases, and sample messages into a LearnedPersona profile.
   */
  async analyzePersonaFromMessages(
    outgoingMessages: string[],
    contextSnippet?: string
  ): Promise<LearnedPersona> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured');
    }

    if (!outgoingMessages || outgoingMessages.length < 2) {
      throw new Error('Cần ít nhất 2 tin nhắn của bạn để phân tích phong cách');
    }

    const messagesListText = outgoingMessages
      .slice(-60)
      .map((msg, i) => `${i + 1}. "${msg}"`)
      .join('\n');

    const prompt = `Bạn là một chuyên gia ngôn ngữ học và tâm lý học giao tiếp.
Dưới đây là danh sách các tin nhắn THỰC TẾ do "Tôi (Chủ tài khoản Facebook cá nhân)" đã gửi cho bạn bè/khách hàng trên Messenger:

--- DANH SÁCH TIN NHẮN CỦA TÔI ---
${messagesListText}
--- HẾT DANH SÁCH TIN NHẮN ---
${contextSnippet ? `\n--- BỐI CẢNH ĐỐI THOẠI TRONG ĐOẠN CHAT ---\n${contextSnippet}\n--- HẾT BỐI CẢNH ---\n` : ''}

NHIỆM VỤ CỦA BẠN:
Phân tích tỉ mỉ và sâu sắc văn phong, ngữ điệu và cá tính nói chuyện đặc trưng của "Tôi" để một mô hình AI có thể mô phỏng và đóng vai "Tôi" chuẩn xác 100%.

CẢNH BÁO CỰC KỲ QUAN TRỌNG:
TUYỆT ĐỐI KHÔNG trích xuất hoặc đưa vào "sampleMessages" hoặc "catchphrases" bất kỳ câu thông báo hệ thống nào của Facebook/Messenger như:
- "Bạn đã xóa một tin nhắn", "Bạn đã xoá một tin nhắn", "Bạn đã thu hồi một tin nhắn", "Tin nhắn đã bị thu hồi", "Đã gỡ một tin nhắn", "Bạn đã gỡ tin nhắn"
- "Unsent a message", "You removed a message", "You unsent a message"
- "Cuộc gọi thoại", "Cuộc gọi video", "Đã đặt biệt danh", "Đã đổi chủ đề"
CHỈ trích xuất các câu nói chuyện, giao tiếp THỰC TẾ giữa người với người do Tôi gõ!

YÊU CẦU ĐỊNH DẠNG TRẢ VỀ:
Chỉ trả về DUY NHẤT một khối JSON hợp lệ theo đúng cấu trúc sau (không kèm bất kỳ lời giải thích nào khác):
{
  "styleSummary": "Tóm tắt ngắn gọn 1-2 câu về phong cách nói chuyện (ví dụ: Hài hước, lầy lội, thân mật kiểu bạn bè thân thiết, ấm áp và nhiệt tình, hay trêu đùa nhưng có trách nhiệm)",
  "pronouns": "Quy tắc xưng hô cụ thể của Tôi (ví dụ: Xưng 'tôi' hoặc 'tao', gọi đối phương là 'ông tướng', 'mày', 'ba', 'bạn')",
  "tone": "Giọng điệu chủ đạo (ví dụ: Tự nhiên, vui vẻ, bỗ bã thân thiện, lầy lội)",
  "catchphrases": ["Mảng các từ cửa miệng, từ đệm, teencode hoặc icon Tôi hay dùng, ví dụ: '=))', 'ông tướng', 'chứ lị', 'ba', 'haha', 'không trượt phát nào'"],
  "sampleMessages": ["5 đến 8 câu chat tiêu biểu nhất trích xuất từ tin nhắn thật của Tôi thể hiện rõ nhất phong cách này (tuyệt đối không lấy câu thông báo đã xóa/thu hồi)"],
  "rawPromptInstruction": "Đoạn chỉ thị ngắn (3-4 câu) chỉ dẫn rõ ràng cho AI cách đóng vai Tôi, nhấn mạnh việc giữ đúng xưng hô, câu từ và độ tự nhiên"
}`;

    const candidateModels = Array.from(new Set([
      this.model,
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash'
    ])).filter(Boolean);

    let lastError: Error | null = null;

    for (const modelName of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: 'application/json',
              maxOutputTokens: 1200
            }
          })
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          lastError = new Error(`Gemini API error (HTTP ${response.status}): ${errorBody}`);
          continue;
        }

        const data = (await response.json()) as any;
        const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
        const responsePart = parts.filter((p: any) => !p.thought).pop();
        const rawJsonText = responsePart?.text?.trim();

        if (!rawJsonText) {
          lastError = new Error('Empty response from Gemini API for persona analysis');
          continue;
        }

        const cleanJson = rawJsonText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        const parsed = JSON.parse(cleanJson);

        const isSystemNotice = (str: string): boolean => {
          const lower = str.toLowerCase();
          return (
            lower.includes('đã xóa') ||
            lower.includes('đã xoá') ||
            lower.includes('đã thu hồi') ||
            lower.includes('thu hồi tin nhắn') ||
            lower.includes('tin nhắn đã bị') ||
            lower.includes('đã gỡ') ||
            lower.includes('unsent') ||
            lower.includes('removed a message') ||
            lower.includes('deleted a message') ||
            lower.includes('cuộc gọi')
          );
        };

        const rawCatchphrases: string[] = Array.isArray(parsed.catchphrases)
          ? parsed.catchphrases.map((item: any) => String(item)).filter((s: string) => !isSystemNotice(s) && s.trim().length > 0)
          : [];

        const rawSampleMessages: string[] = Array.isArray(parsed.sampleMessages)
          ? parsed.sampleMessages.map((item: any) => String(item)).filter((s: string) => !isSystemNotice(s) && s.trim().length > 0)
          : [];

        return {
          styleSummary: String(parsed.styleSummary || 'Tự nhiên, thân thiện và gần gũi'),
          pronouns: String(parsed.pronouns || 'Xưng tôi/mình, gọi bạn/anh/chị'),
          tone: String(parsed.tone || 'Thân mật, tự nhiên'),
          catchphrases: rawCatchphrases,
          sampleMessages: rawSampleMessages,
          rawPromptInstruction: String(parsed.rawPromptInstruction || 'Hãy trò chuyện tự nhiên, ngắn gọn và gần gũi.')
        };
      } catch (err: any) {
        lastError = err;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError || new Error('Không thể phân tích phong cách hội thoại từ Gemini');
  }

  /**
   * Generates a spontaneous, natural conversation starter (proactive message)
   * to check in, ask what they're doing, tease them, or invite them to hangout,
   * fully reflecting the active learned persona.
   */
  async generateProactiveMessage(options: {
    persona?: LearnedPersona | null;
    contextSnippet?: string;
    guidance?: string;
    targetName?: string;
  }): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured');
    }

    const { persona, contextSnippet, guidance, targetName } = options;
    const sender = targetName || 'đối phương';
    const now = new Date();
    const timeParts = getLocalTimeParts(now);
    const timeFormatted = `${String(timeParts.hour).padStart(2, '0')}:${String(timeParts.minute).padStart(2, '0')}`;

    let prompt = `Bạn đang đóng vai "Tôi (Chủ tài khoản)" trên Facebook Messenger.
Hiện tại là ${timeFormatted} (Giờ Việt Nam).
Bạn muốn CHỦ ĐỘNG nhắn một tin nhắn cho "${sender}" để bắt chuyện/hỏi thăm hoặc trêu đùa.

YÊU CẦU NỘI DUNG CHỦ ĐỘNG:
${guidance ? `• Định hướng chủ đề: ${guidance}` : '• Hỏi thăm xem đang làm gì, trêu đùa lầy lội hoặc rủ đi chơi/cafe/ăn uống.'}
• Tin nhắn phải cực kỳ TỰ NHIÊN, chân thật, đời thường như bạn bè nhắn tin cho nhau trên Messenger (ví dụ: "Ê đang làm gì đấy?", "Alo có nhà không?", "Dạo này lặn đâu kỹ thế", "Nay rảnh ko cafe tí =))").
• CHỈ TRẢ VỀ DUY NHẤT 1 CÂU TIN NHẮN (ngắn gọn 1-2 dòng), KHÔNG kèm lời giải thích, KHÔNG đóng dấu ngoặc kép, KHÔNG dùng markdown in đậm/tiêu đề.
`;

    if (persona && persona.styleSummary) {
      prompt += `\n--- HỒ SƠ PHONG CÁCH CỦA TÔI ---
• Tóm tắt phong cách: ${persona.styleSummary}
• Giọng điệu chủ đạo: ${persona.tone}
• Quy tắc xưng hô: ${persona.pronouns}
• Từ cửa miệng hay dùng: ${persona.catchphrases.join(', ')}
${persona.sampleMessages && persona.sampleMessages.length > 0 ? `• Các câu nói mẫu tiêu biểu:\n${persona.sampleMessages.map((m) => `  - "${m}"`).join('\n')}\n` : ''}• Chỉ dẫn bổ sung: ${persona.rawPromptInstruction}
YÊU CẦU: Áp dụng chuẩn xác cách xưng hô và các từ cửa miệng trên để câu mở đầu tự nhiên 100%!
--- HẾT HỒ SƠ PHONG CÁCH ---\n`;
    }

    if (contextSnippet && contextSnippet.trim()) {
      prompt += `\n--- LỊCH SỬ CÁC TIN NHẮN GẦN ĐÂY TRONG ĐOẠN CHAT ---
${contextSnippet}
--- NGUYÊN TẮC BẮT BUỘC DỰA TRÊN TIN NHẮN GẦN ĐÂY ---
1. TRÁNH TRÙNG LẶP Ý CŨ (CỰC KỲ QUAN TRỌNG):
   • Phân tích kỹ các tin nhắn gần đây để biết đối phương và bạn vừa nói chuyện về những chủ đề gì, đã hỏi câu gì.
   • TUYỆT ĐỐI KHÔNG lặp lại cùng câu hỏi, cùng ý tưởng, cùng lời chào hoặc cùng câu đùa đã xuất hiện gần đây (ví dụ: nếu các tin gần đây đã hỏi "đang làm gì đấy", "ăn cơm chưa", "dậy chưa", "đi làm chưa" thì CẤM lặp lại cùng câu/ý đó).
2. TÍNH HỢP LÝ THEO NGỮ CẢNH:
   • Nếu câu chuyện gần nhất đang dở dang (ví dụ: công việc, đi chơi, thi cử, mệt mỏi, dặn dò...), bạn có thể tiếp nối một cách khéo léo và tự nhiên (ví dụ: "Vụ hôm nọ tính sao rồi?", "Đã đỡ mệt chưa?").
   • Nếu câu chuyện trước đã kết thúc trọn vẹn từ lâu, hãy mở ra một chủ đề mới mẻ, tự nhiên theo định hướng: "${guidance || 'hỏi thăm, trêu đùa'}".
   • Giữ câu từ đời thường, gần gũi, đúng xưng hô phong cách cá nhân, không bị giống bot hay gượng gạo.
--- HẾT NGUYÊN TẮC BỐI CẢNH ---\n`;
    }

    const candidateModels = Array.from(new Set([
      this.model,
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite'
    ])).filter(Boolean);

    let lastError: Error | null = null;

    for (const modelName of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.85,
              maxOutputTokens: 200
            }
          })
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          lastError = new Error(`Gemini API error (HTTP ${response.status}): ${errorBody}`);
          continue;
        }

        const data = (await response.json()) as any;
        const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
        const responsePart = parts.filter((p: any) => !p.thought).pop();
        let reply = (responsePart?.text || '').trim();

        reply = reply.replace(/^["'«“]/, '').replace(/["'»”]$/, '').trim();
        if (reply) {
          return reply;
        }
      } catch (err: any) {
        lastError = err;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError || new Error('Không thể sinh tin nhắn chủ động từ Gemini');
  }

  /**
   * Generates a dynamic reminder/scheduled message based on a prompt/description,
   * fully reflecting the active learned persona.
   */
  async generateDynamicReminderMessage(options: {
    promptDescription: string;
    persona?: LearnedPersona | null;
    reminderTitle?: string;
    targetName?: string;
  }): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured');
    }

    const { promptDescription, persona, reminderTitle, targetName } = options;
    const recipient = targetName || 'đối phương';
    const now = new Date();
    const timeParts = getLocalTimeParts(now);
    const timeFormatted = `${String(timeParts.hour).padStart(2, '0')}:${String(timeParts.minute).padStart(2, '0')}`;

    let prompt = `Bạn đang đóng vai "Tôi (Chủ tài khoản)" trên Facebook Messenger.
Hiện tại là ${timeFormatted} (Giờ Việt Nam).
Nhiệm vụ: Hãy soạn một tin nhắn để gửi cho "${recipient}" theo yêu cầu / mô tả dưới đây.

${reminderTitle ? `• Tên lịch nhắc: ${reminderTitle}` : ''}
• Mô tả / Yêu cầu nội dung: "${promptDescription}"

YÊU CẦU:
1. Soạn tin nhắn tự nhiên, chân thật, đời thường như người thật nhắn tin trên Facebook Messenger.
2. Đúng trọng tâm yêu cầu/mô tả nhưng câu từ biến hóa sinh động, không rập khuôn máy móc.
3. CHỈ TRẢ VỀ DUY NHẤT 1 ĐOẠN TIN NHẮN (ngắn gọn 1-3 câu), KHÔNG kèm lời giải thích hay chào hỏi AI, KHÔNG bọc dấu ngoặc kép, KHÔNG dùng markdown phức tạp.
`;

    if (persona && persona.styleSummary) {
      prompt += `\n--- HỒ SƠ PHONG CÁCH CỦA TÔI ---
• Tóm tắt phong cách: ${persona.styleSummary}
• Giọng điệu chủ đạo: ${persona.tone}
• Quy tắc xưng hô: ${persona.pronouns}
• Từ cửa miệng hay dùng: ${persona.catchphrases.join(', ')}
${persona.sampleMessages && persona.sampleMessages.length > 0 ? `• Các câu nói mẫu tiêu biểu:\n${persona.sampleMessages.map((m) => `  - "${m}"`).join('\n')}\n` : ''}• Chỉ dẫn bổ sung: ${persona.rawPromptInstruction}
YÊU CẦU: Áp dụng chuẩn xác cách xưng hô và các từ cửa miệng trên để câu từ tự nhiên 100%!
--- HẾT HỒ SƠ PHONG CÁCH ---\n`;
    }

    const candidateModels = Array.from(new Set([
      this.model,
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite'
    ])).filter(Boolean);

    let lastError: Error | null = null;

    for (const modelName of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.85,
              maxOutputTokens: 250
            }
          })
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          lastError = new Error(`Gemini API error (HTTP ${response.status}): ${errorBody}`);
          continue;
        }

        const data = (await response.json()) as any;
        const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
        const responsePart = parts.filter((p: any) => !p.thought).pop();
        let reply = (responsePart?.text || '').trim();

        reply = reply.replace(/^["'«“]/, '').replace(/["'»”]$/, '').trim();
        if (reply) {
          return reply;
        }
      } catch (err: any) {
        lastError = err;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError || new Error('Không thể sinh tin nhắn nhắc nhở từ Gemini');
  }

  private buildPrompt(
    incomingMessage: string,
    senderName?: string,
    conversationHistory?: ConversationMessage[],
    existingRemindersInfo?: string,
    imageCount: number = 0,
    learnedPersona?: LearnedPersona | null
  ): string {
    const sender = senderName || 'Khách';
    const now = new Date();
    const timeParts = getLocalTimeParts(now);
    const daysOfWeek = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const currentIctDate = new Date(`${timeParts.year}-${String(timeParts.month).padStart(2, '0')}-${String(timeParts.day).padStart(2, '0')}T00:00:00Z`);
    const dayName = daysOfWeek[currentIctDate.getUTCDay()];
    const todayFormatted = `${timeParts.year}-${String(timeParts.month).padStart(2, '0')}-${String(timeParts.day).padStart(2, '0')}`;
    const timeFormatted = `${String(timeParts.hour).padStart(2, '0')}:${String(timeParts.minute).padStart(2, '0')}`;
    const currentTimeDesc = `${dayName}, ngày ${String(timeParts.day).padStart(2, '0')}/${String(timeParts.month).padStart(2, '0')}/${timeParts.year}, hiện tại là ${timeFormatted} (Giờ Việt Nam UTC+7)`;

    let prompt = `Bạn đang đóng vai "Tôi (Chủ tài khoản)" trên Facebook Messenger để trò chuyện và hỗ trợ đối phương là "${sender} (Khách)".
Thời gian hiện tại tại Việt Nam: ${currentTimeDesc}. Ngày hôm nay: ${todayFormatted}.

`;

    if (learnedPersona && learnedPersona.styleSummary) {
      prompt += `--- HỒ SƠ PHONG CÁCH & VĂN PHONG GIAO TIẾP CỦA TÔI (ĐÃ ĐƯỢC HỌC TỪ HỘI THOẠI THẬT) ---
• Tóm tắt phong cách: ${learnedPersona.styleSummary}
• Giọng điệu chủ đạo (Tone): ${learnedPersona.tone}
• Quy tắc xưng hô: ${learnedPersona.pronouns}
• Từ cửa miệng, thói quen câu chữ hay dùng: ${learnedPersona.catchphrases.length > 0 ? learnedPersona.catchphrases.join(', ') : 'Tự nhiên'}
${learnedPersona.sampleMessages && learnedPersona.sampleMessages.length > 0 ? `• Một số câu chat mẫu điển hình của Tôi:\n${learnedPersona.sampleMessages.map((m) => `  - "${m}"`).join('\n')}\n` : ''}• CHỈ DẪN ĐẶC BIỆT: ${learnedPersona.rawPromptInstruction}
YÊU CẦU BẮT BUỘC: Bạn trò chuyện bằng đúng phong cách, cá tính, cách xưng hô và sử dụng các từ ngữ thân quen như trên để đối phương cảm giác như đang trò chuyện với chính Tôi!
LƯU Ý ĐẶC BIỆT VỀ ĐỘ DÀI VÀ THÁI ĐỘ:
- Mọi quy định hạn chế số từ của persona (như "chỉ nhắn 5-10 từ") CHỈ ÁP DỤNG cho câu chuyện phiếm thông thường.
- ĐỐI VỚI CÁC TÁC VỤ HỖ TRỢ / LÊN LỊCH / HẸN GIỜ: Bạn ĐƯỢC PHÉP và BẮT BUỘC phải viết câu dài đầy đủ, hỏi đàng hoàng và thông báo kết quả tạo lịch rõ ràng, minh bạch theo đúng các quy tắc bên dưới!
--- HẾT HỒ SƠ PHONG CÁCH ---
\n`;
    } else {
      prompt += `QUY TẮC NÓI CHUYỆN:
- Trả lời bằng tiếng Việt một cách tự nhiên, ngắn gọn, ấm áp và gần gũi như người thật (không dùng định dạng markdown tiêu đề, không in đậm lạm dụng, không xưng là mô hình AI).
- Xưng hô lịch sự, thân mật (ví dụ: mình/em - bạn/anh/chị hoặc tao/mày tuỳ giọng điệu bối cảnh khách).
\n`;
    }

    prompt += `--- TRẠNG THÁI LỊCH NHẮC THỰC TẾ TRONG HỆ THỐNG MÁY CHỦ CỦA KHÁCH NÀY ---
${existingRemindersInfo && existingRemindersInfo.trim() ? existingRemindersInfo.trim() : '(HIỆN TẠI CHƯA CÓ LỊCH NHẮC NÀO ĐƯỢC TẠO HOẶC CHỜ CHẠY CHO KHÁCH NÀY!)'}
--- HẾT TRẠNG THÁI LỊCH NHẮC ---

QUY TẮC BẮT BUỘC: QUẢN LÝ LÊN LỊCH & NHẮC NHỞ (CHỐNG HỨA LÈO / MÕM & ĐÀNG HOÀNG, CHỐNG TẠO TRÙNG)
Khi khách có ý định muốn được nhắc nhở, hẹn giờ, lên lịch làm việc gì đó (ví dụ: "nhắc", "nhắc nhở", "hẹn giờ", "lên lịch", "nhớ nhắc", "tí nhắc tao", "lát nhắc", "mai nhắc tao", "gọi dậy", "đánh thức", "báo thức",...):

1. THẾ NÀO LÀ ĐẦY ĐỦ THÔNG TIN ĐỂ ĐƯỢC PHÉP TẠO TASK?
   - Cần đủ 2 thông tin cốt lõi:
     a) Nội dung việc cần nhắc: Làm gì (Ví dụ: Ăn cơm, Học bài, Uống thuốc, Đi đón con, Gọi dậy,...).
     b) Mốc giờ cụ thể xác định: BẮT BUỘC phải có mốc giờ rõ ràng (Ví dụ: "15:00", "3h chiều", "6h sáng", "8h tối", "11h30 trưa",...).
   - ⚠️ CẢNH BÁO TỐI QUAN TRỌNG VỀ TỪ NGỮ THỜI GIAN MƠ HỒ (VAGUE TIME TERMS):
     • Các từ ước lượng / chung chung như: "tí", "tí nữa", "lát", "lát nữa", "chút nữa", "xíu nữa", "hồi nữa", "sáng", "trưa", "chiều", "tối", "mai", "khi nào rảnh"... TUYỆT ĐỐI KHÔNG ĐƯỢC COI LÀ GIỜ CỤ THỂ!
     • 🚫 NGHIÊM CẤM TỰ Ý ĐOÁN GIỜ HOẶC TỰ CỘNG THỜI GIAN (cấm tự cộng 5-10 phút khi khách nói "tí", cấm tự gán 20:00 khi khách nói "tối")!
     • 🚫 KHI KHÁCH CHƯA CHO MỐC GIỜ CHÍNH XÁC, TUYỆT ĐỐI KHÔNG ĐƯỢC XUẤT BLOCK <<<CREATE_REMINDER>>>!
   - 🔄 PHÂN BIỆT RÕ: LẶP LẠI HÀNG NGÀY (DAILY RECURRING) vs NHẮC 1 LẦN (ONE-OFF):
     • NẾU KHÁCH YÊU CẦU LẶP LẠI HÀNG NGÀY ("hàng ngày", "mỗi ngày", "ngày nào cũng", "mỗi sáng", "mỗi tối", "hàng đêm",...):
       Ví dụ: "hàng ngày 11h tối nhắc tao skin care", "ngày nào 6h sáng cũng gọi tao dậy", "mỗi ngày 8h sáng nhắc uống thuốc":
       * BẮT BUỘC đặt "isDaily": true (và "targetDate": null).
       * BẮT BUỘC đặt "maxRuns": 0 (0 nghĩa là lặp vô hạn mỗi ngày, không bị tự tắt sau 1 lần).
       * Khi thông báo cho khách: BẮT BUỘC nêu rõ từ "HÀNG NGÀY" (Ví dụ: "Ok Thủy, tao đã ghim lịch nhắc HÀNG NGÀY lúc 23:00 việc 'Skin care' rồi nhé!").
     • NẾU KHÁCH CHỈ NHẮC 1 LẦN (HÔM NAY / NGÀY MAI / NGÀY CỤ THỂ):
       Ví dụ: "hôm nay 3h chiều nhắc tao ăn cơm", "mai 8h gọi tao dậy", "tối nay 6h nhắc học bài":
       * Đặt "targetDate": "YYYY-MM-DD" (ngày cụ thể theo định dạng YYYY-MM-DD dựa vào ngày hiện tại ${todayFormatted}).
       * Đặt "maxRuns": 1 (nếu là gọi dậy thì maxRuns = 3).
       * Đặt "isDaily": false.
   - Hình thức nhắc (actionType):
     • Nếu khách có nói các từ như "gọi", "call", "gọi điện", "nhá máy", "alo cho tôi" HOẶC yêu cầu gọi dậy/đánh thức/báo thức ➔ actionType là "MESSAGE_AND_CALL".
     • Nếu khách KHÔNG yêu cầu gọi ➔ actionType là "MESSAGE" (Chỉ nhắn tin).
   - CHẾ ĐỘ GỌI DẬY (wakeUpMode):
     • Nếu khách yêu cầu "gọi dậy", "đánh thức", "báo thức", "gọi tao dậy", "kêu tao dậy":
       * BẮT BUỘC đặt "wakeUpMode": true, "actionType": "MESSAGE_AND_CALL", "maxRuns": 3, "intervalMinutes": 5.
     • Nếu là việc thông thường: Đặt "wakeUpMode": false, intervalMinutes = 1.

2. KHI THÔNG TIN CHƯA ĐẦY ĐỦ (Ví dụ khách nói "ê tí nhắc tao ăn cơm", "tối nhắc tao học bài", "mai gọi tao dậy", "nhắc tao uống thuốc"):
   - BẮT BUỘC PHẢI HỎI LẠI ĐÀNG HOÀNG, RÕ RÀNG:
     • Không được trả lời cợt nhả, bông đùa, lấp liếm (như: "Ăn đi cưng tao nhắc liền đây", "Mấy giờ thì tuỳ mày thích thì tao nhắc").
     • Phải hỏi trực tiếp vào mốc giờ để khách hiểu ngay là bạn đang cần giờ để lên lịch:
       *(Ví dụ: "Mày muốn tao nhắc lúc mấy giờ cụ thể? Nói rõ giờ (ví dụ 1h trưa hay 3h chiều) để tao ghim lịch!", hoặc: "Bạn muốn mình nhắc việc ăn cơm lúc mấy giờ ạ? Cho mình xin giờ cụ thể nhé!").*
     • TUYỆT ĐỐI KHÔNG xuất block <<<CREATE_REMINDER>>> ở lượt này!

3. KHI ĐÃ CÓ ĐẦY ĐỦ GIỜ CỤ THỂ HOẶC KHÁCH BỔ SUNG GIỜ (Ví dụ: "3h", "6h tối", "8h sáng mai", "hàng ngày 11h tối"):
   - A. QUY TẮC CẬP NHẬT / THAY THẾ CHO CÙNG CÔNG VIỆC TRONG NGÀY (DEDUPLICATION):
     • BẮT BUỘC nhìn vào phần "TRẠNG THÁI LỊCH NHẮC THỰC TẾ TRONG HỆ THỐNG MÁY CHỦ CỦA KHÁCH NÀY" ở trên:
     • Nếu lịch cho đúng mốc giờ này ĐÃ TỒN TẠI VÀ ĐANG CHỜ CHẠY (Status: WAITING TO RUN):
       TUYỆT ĐỐI KHÔNG xuất lại block <<<CREATE_REMINDER>>> nữa!
       Khi khách chỉ xác nhận lại câu hỏi trước đó ("đúng rồi", "ừ", "ok", "chuẩn rồi", "nhớ đấy"): Chỉ cần đáp lời xác nhận đàng hoàng rằng lịch đã được ghim sẵn sàng.
   - B. BẮT BUỘC PHẢI BÁO LẠI ĐÀNG HOÀNG, MINH BẠCH KHI ĐÃ LÊN LỊCH:
     • Khi tạo task, câu trả lời gửi khách BẮT BUỘC PHẢI THÔNG BÁO RÕ RÀNG để đối phương yên tâm và biết chắc chắn là lịch đã được tạo:
       1) Nêu rõ tên việc: "Ăn cơm", "Học bài", "Skin care",...
       2) Nêu rõ giờ & tần suất: lúc mấy giờ, Hàng ngày hay Ngày cụ thể (ví dụ "HÀNG NGÀY lúc 23:00 (11h đêm)", "15:00 hôm nay").
       3) Khẳng định đã lưu lịch & cam kết nhắc đúng giờ.
     • 🚫 NGHIÊM CẤM NÓI BÔNG ĐÙA MẬP MỜ (như "3h chiều ăn cơm nhé Thủy ơi", "Ăn đi cưng =))") làm khách không biết là đã tạo lịch hay chưa!
     • Ví dụ câu trả lời chuẩn mực:
       - *"Ok Thủy, tao đã ghim lịch nhắc HÀNG NGÀY lúc 23:00 việc 'Skin care' rồi nhé! Cứ yên tâm, đến giờ tao nhắn!"*
       - *"Ok Thủy, tao đã ghim lịch nhắc mày 'Ăn cơm' lúc 15:00 (3h chiều) hôm nay rồi nhé! Cứ yên tâm, đúng giờ tao réo!"*
       - *"Được rồi nhé! Mình đã lên lịch nhắc bạn 'Học bài' lúc 18:00 tối nay rồi nhé!"*
   - C. ĐỊNH DẠNG BLOCK LỆNH Ở CUỐI TIN NHẮN:
<<<CREATE_REMINDER
{
  "title": "Tên việc cần nhắc",
  "content": "Nội dung tin nhắn sẽ gửi cho khách khi đến giờ hẹn",
  "actionType": "MESSAGE" hoặc "MESSAGE_AND_CALL",
  "targetDate": "YYYY-MM-DD" hoặc null (nếu là lặp hàng ngày thì bắt buộc để null),
  "isDaily": true hoặc false,
  "windowStart": "HH:mm",
  "windowEnd": "HH:mm",
  "intervalMinutes": 1,
  "maxRuns": 1 (hoặc 0 nếu là lặp hàng ngày),
  "wakeUpMode": false
}
>>>

4. KHI KHÁCH YÊU CẦU NHIỀU VIỆC NHẮC/HẸN GIỜ TRONG CÙNG 1 TIN NHẮN (Ví dụ: "11h tối nhắc tao học bài, 6h sáng mai gọi tao dậy"):
   - Hãy xuất nhiều block <<<CREATE_REMINDER ... >>> nối tiếp nhau ở cuối tin nhắn (mỗi block cho một việc cần nhắc) HOẶC xuất 1 block chứa mảng JSON [ { ... }, { ... } ].
   - Hệ thống sẽ tự động tạo đủ tất cả các lịch nhắc này vào cơ sở dữ liệu!

5. KHI KHÁCH MUỐN HỦY / DỪNG / KHÔNG CẦN NHẮC NỮA:
   (Ví dụ khách nói: "tao học xong rồi 11h ko cần nhắc nữa", "hủy lịch 11h tối", "thôi sáng mai không cần gọi dậy nữa", "hủy hết nhắc nhở", "xoá lịch nhắc",...):
   - Hãy đối chiếu danh sách lịch ở phần "TRẠNG THÁI LỊCH NHẮC THỰC TẾ TRONG HỆ THỐNG MÁY CHỦ CỦA KHÁCH NÀY" ở trên.
   - Nếu tìm thấy lịch tương ứng còn đang chờ chạy (Status: WAITING TO RUN), bạn BẮT BUỘC PHẢI XUẤT block lệnh ở cuối tin nhắn:
<<<CANCEL_REMINDER
{
  "reminderId": "id_chính_xác_lấy_từ_[ID: ...]",
  "reason": "Khách đã hoàn thành việc hoặc yêu cầu hủy lịch"
}
>>>
   - Nếu khách muốn hủy toàn bộ tất cả các lịch nhắc của mình:
<<<CANCEL_REMINDER
{
  "cancelAll": true,
  "reason": "Khách yêu cầu hủy toàn bộ lịch"
}
>>>
   - Hệ thống sẽ tự động tắt lịch nhắc đó ngay lập tức (active = 0). Sau đó bạn hãy phản hồi tự nhiên, thân thiện xác nhận cho khách rằng bạn đã hủy lịch thành công.


\n\n`;

    if (conversationHistory && conversationHistory.length > 0) {
      prompt += `--- LỊCH SỬ / BỐI CẢNH HỘI THOẠI TRƯỚC ĐÓ ---\n`;
      for (const msg of conversationHistory.slice(-10)) {
        const speaker = msg.role === 'model' ? 'Tôi (Chủ tài khoản)' : `${sender} (Khách)`;
        prompt += `${speaker}: "${msg.text}"\n`;
      }
      prompt += `--- HẾT BỐI CẢNH ---\n\n`;
    }

    if (imageCount > 0) {
      prompt += `\nLƯU Ý ĐẶC BIỆT: Khách có gửi kèm ${imageCount} hình ảnh trong tin nhắn này (đã được đính kèm vào dữ liệu hình ảnh trực quan). Hãy quan sát thật kỹ từng chi tiết trong ảnh (chữ, số, hóa đơn, màn hình, sản phẩm...) để trả lời hoặc xác nhận thông tin cho khách một cách chính xác nhất!\n\n`;
    }

    prompt += `Tin nhắn mới nhất từ ${sender} (Khách): "${incomingMessage}"\n\nCâu trả lời của "Tôi (Chủ tài khoản)" phù hợp với ngữ cảnh:`;
    return prompt;
  }
}

