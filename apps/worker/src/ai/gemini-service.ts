import { getLocalTimeParts, LearnedPersona } from '@messenger/shared';

export interface ConversationMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AiCreatedReminderPayload {
  title: string;
  content: string;
  actionType: 'MESSAGE' | 'MESSAGE_AND_CALL';
  targetDate: string; // YYYY-MM-DD
  windowStart: string; // HH:mm
  windowEnd: string; // HH:mm
  intervalMinutes: number;
  maxRuns: number;
  wakeUpMode?: boolean;
}

export interface ImageAttachment {
  mimeType: string;
  data: string; // base64 representation
}

export interface ParseAiReplyResult {
  cleanReplyText: string;
  reminderPayload: AiCreatedReminderPayload | null;
}

/**
 * Extracts and parses <<<CREATE_REMINDER { ... } >>> payload from AI generated reply
 */
export function extractReminderPayload(rawReplyText: string): ParseAiReplyResult {
  if (!rawReplyText) {
    return { cleanReplyText: '', reminderPayload: null };
  }

  const reminderRegex = /<<<CREATE_REMINDER\s*([\s\S]*?)\s*>>>/i;
  const match = rawReplyText.match(reminderRegex);

  if (!match) {
    return { cleanReplyText: rawReplyText.trim(), reminderPayload: null };
  }

  const rawJson = match[1]
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let reminderPayload: AiCreatedReminderPayload | null = null;
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === 'object') {
      const nowParts = getLocalTimeParts(new Date());
      const defaultDate = `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-${String(nowParts.day).padStart(2, '0')}`;

      const title = String(parsed.title || 'Nhắc nhở').trim();
      const content = String(parsed.content || title).trim();
      const actionType: 'MESSAGE' | 'MESSAGE_AND_CALL' =
        parsed.actionType === 'MESSAGE_AND_CALL' ? 'MESSAGE_AND_CALL' : 'MESSAGE';

      // Validate or fallback targetDate (YYYY-MM-DD)
      let targetDate = defaultDate;
      if (typeof parsed.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.targetDate.trim())) {
        targetDate = parsed.targetDate.trim();
      }

      // Format HH:mm
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

      const windowStart = normalizeTime(parsed.windowStart);
      const windowEnd = normalizeTime(parsed.windowEnd || parsed.windowStart);
      const intervalMinutes = Math.max(1, Number(parsed.intervalMinutes) || 1);
      const maxRuns = Math.max(1, Number(parsed.maxRuns) || 1);
      const wakeUpMode = Boolean(parsed.wakeUpMode);

      reminderPayload = {
        title,
        content,
        actionType,
        targetDate,
        windowStart,
        windowEnd,
        intervalMinutes,
        maxRuns,
        wakeUpMode
      };
    }
  } catch (err: any) {
    console.warn('[GeminiService] Failed to parse CREATE_REMINDER JSON payload:', err.message, rawJson);
  }

  const cleanReplyText = rawReplyText.replace(reminderRegex, '').trim();
  return { cleanReplyText, reminderPayload };
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
              maxOutputTokens: 600
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
      prompt += `\n--- BỐI CẢNH VÀI TIN NHẮN GẦN ĐÂY TRONG HỘI THOẠI ---
${contextSnippet}
--- HẾT BỐI CẢNH (Lưu ý: Không lặp lại y hệt câu vừa nhắn trong quá khứ) ---\n`;
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
YÊU CẦU BẮT BUỘC: Bạn PHẢI trò chuyện bằng đúng phong cách, cá tính, cách xưng hô và sử dụng các từ ngữ thân quen như trên để đối phương cảm giác như đang trò chuyện với chính Tôi!
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

QUY TẮC BẮT BUỘC: TỰ ĐỘNG HỖ TRỢ LÊN LỊCH & NHẮC NHỞ (CHỐNG HỨA LÈO / MÕM)
Khi khách có ý định muốn được nhắc nhở, hẹn giờ, lên lịch làm một việc gì đó (ví dụ chứa các từ như "nhắc", "nhắc nhở", "hẹn giờ", "lên lịch", "nhớ nhắc", "mai nhắc tao", "mai nhớ gọi", "gọi dậy", "đánh thức", "báo thức",...):
1. Các thông tin BẮT BUỘC cần có để tạo lịch nhắc:
   - Nội dung việc cần nhắc (Ví dụ: Uống thuốc, đi đón con, gọi dậy, họp công ty,...).
   - Thời gian cần nhắc: Ngày nào (quy đổi ra ngày cụ thể theo định dạng YYYY-MM-DD dựa vào ngày hiện tại ${todayFormatted}) và Giờ nào (định dạng 24h HH:mm, ví dụ 6h sáng là 06:00, 8h tối là 20:00).
   - Hình thức nhắc (actionType):
     • Nếu khách có nói các từ như "gọi", "call", "gọi điện", "nhá máy", "alo cho tôi" HOẶC yêu cầu gọi dậy/đánh thức/báo thức ➔ actionType là "MESSAGE_AND_CALL" (Cả gọi điện và nhắn tin).
     • Nếu khách KHÔNG yêu cầu gọi ➔ actionType là "MESSAGE" (Chỉ nhắn tin).
   - CHẾ ĐỘ GỌI DẬY (wakeUpMode):
     • Nếu khách yêu cầu "gọi dậy", "đánh thức", "báo thức", "gọi tao dậy", "kêu tao dậy":
       * BẮT BUỘC đặt "wakeUpMode": true.
       * BẮT BUỘC đặt "actionType": "MESSAGE_AND_CALL".
       * Để đảm bảo khách thức dậy, hãy đặt lịch gọi lặp lại: ví dụ "intervalMinutes": 5 (hoặc 10), "maxRuns": 3 (hoặc 5), và "windowEnd" cách "windowStart" tương ứng (ví dụ: windowStart "06:00", maxRuns 3 mỗi 5 phút thì windowEnd "06:15").
       * Lưu ý: Khi "wakeUpMode": true, hệ thống sẽ tự động dừng gọi ngay khi khách nghe máy, từ chối cuộc gọi, hoặc nhắn tin trả lời.
     • Nếu là nhắc nhở việc thông thường (không phải gọi dậy/đánh thức): Đặt "wakeUpMode": false.
   - Số lần lặp (maxRuns):
     • Nếu là việc thông thường và khách không yêu cầu lặp: maxRuns = 1, intervalMinutes = 1, windowEnd = windowStart.
     • Nếu là gọi dậy: Đặt maxRuns = 3 (mỗi 5 phút) để gọi lại nếu chưa dậy.
     • Nếu khách có yêu cầu lặp cụ thể: Đặt maxRuns và intervalMinutes tương ứng.
2. NẾU THÔNG TIN CHƯA ĐẦY ĐỦ:
   - Bạn PHẢI tiếp tục hỏi khách ngắn gọn về thông tin còn thiếu (ví dụ: hỏi mấy giờ, hoặc ngày nào).
   - TUYỆT ĐỐI KHÔNG xuất block <<<CREATE_REMINDER>>> khi thông tin thời gian chưa rõ ràng!
3. KHI ĐÃ CÓ ĐẦY ĐỦ THÔNG TIN HOẶC KHÁCH BỔ SUNG GIỜ / HỎI XÁC NHẬN LỊCH:
   - Khi khách vừa cung cấp giờ (ví dụ khách nói ngắn gọn "6h", "7h sáng mai") sau khi bạn đã hỏi giờ, HOẶC khách hỏi kiểm tra lại ("mai nhớ gì chưa?", "lên lịch chưa?", "sao chưa thấy lịch?",...):
   - CẢNH BÁO TỐI HẬU: Hệ thống CHỈ LƯU VÀO DATABASE KHI VÀ CHỈ KHI bạn xuất block lệnh <<<CREATE_REMINDER ... >>> ở cuối tin nhắn.
   - NẾU BẠN NÓI "tôi đã lên lịch rồi", "tôi nhớ rồi", "tôi ghim lịch rồi mai 6h tôi gọi" MÀ KHÔNG KÈM THEO block lệnh <<<CREATE_REMINDER ... >>>, THÌ HỆ THỐNG HOÀN TOÀN KHÔNG CÓ LỊCH và bạn sẽ bị khách phát hiện là "HỨA LÈO / MÕM"!
   - VÌ VẬY: Bất cứ khi nào bạn xác nhận đã/sẽ lên lịch nhắc/gọi cho khách mà lịch đó CHƯA CÓ trong phần "TRẠNG THÁI LỊCH NHẮC THỰC TẾ" ở trên, BẠN BẮT BUỘC PHẢI XUẤT BLOCK LỆNH Ở CUỐI TIN NHẮN THEO ĐÚNG ĐỊNH DẠNG:
<<<CREATE_REMINDER
{
  "title": "Tên việc cần nhắc",
  "content": "Nội dung tin nhắn sẽ gửi cho khách khi đến giờ hẹn",
  "actionType": "MESSAGE" hoặc "MESSAGE_AND_CALL",
  "targetDate": "YYYY-MM-DD",
  "windowStart": "HH:mm",
  "windowEnd": "HH:mm",
  "intervalMinutes": 1,
  "maxRuns": 1,
  "wakeUpMode": false
}
>>>

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

