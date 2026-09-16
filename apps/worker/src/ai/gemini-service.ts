import { getLocalTimeParts } from '@messenger/shared';

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

      reminderPayload = {
        title,
        content,
        actionType,
        targetDate,
        windowStart,
        windowEnd,
        intervalMinutes,
        maxRuns
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
    imageAttachments?: ImageAttachment[]
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
      hasImages ? imageAttachments.length : 0
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

  private buildPrompt(
    incomingMessage: string,
    senderName?: string,
    conversationHistory?: ConversationMessage[],
    existingRemindersInfo?: string,
    imageCount: number = 0
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

QUY TẮC NÓI CHUYỆN:
- Trả lời bằng tiếng Việt một cách tự nhiên, ngắn gọn, ấm áp và gần gũi như người thật (không dùng định dạng markdown tiêu đề, không in đậm lạm dụng, không xưng là mô hình AI).
- Xưng hô lịch sự, thân mật (ví dụ: mình/em - bạn/anh/chị hoặc tao/mày tuỳ giọng điệu bối cảnh khách).

--- TRẠNG THÁI LỊCH NHẮC THỰC TẾ TRONG HỆ THỐNG MÁY CHỦ CỦA KHÁCH NÀY ---
${existingRemindersInfo && existingRemindersInfo.trim() ? existingRemindersInfo.trim() : '(HIỆN TẠI CHƯA CÓ LỊCH NHẮC NÀO ĐƯỢC TẠO HOẶC CHỜ CHẠY CHO KHÁCH NÀY!)'}
--- HẾT TRẠNG THÁI LỊCH NHẮC ---

QUY TẮC BẮT BUỘC: TỰ ĐỘNG HỖ TRỢ LÊN LỊCH & NHẮC NHỞ (CHỐNG HỨA LÈO / MÕM)
Khi khách có ý định muốn được nhắc nhở, hẹn giờ, lên lịch làm một việc gì đó (ví dụ chứa các từ như "nhắc", "nhắc nhở", "hẹn giờ", "lên lịch", "nhớ nhắc", "mai nhắc tao", "mai nhớ gọi", "gọi dậy",...):
1. Các thông tin BẮT BUỘC cần có để tạo lịch nhắc:
   - Nội dung việc cần nhắc (Ví dụ: Uống thuốc, đi đón con, gọi dậy, họp công ty,...).
   - Thời gian cần nhắc: Ngày nào (quy đổi ra ngày cụ thể theo định dạng YYYY-MM-DD dựa vào ngày hiện tại ${todayFormatted}) và Giờ nào (định dạng 24h HH:mm, ví dụ 6h sáng là 06:00, 8h tối là 20:00).
   - Hình thức nhắc (actionType):
     • Nếu khách có nói các từ như "gọi", "call", "gọi điện", "nhá máy", "alo cho tôi" ➔ actionType là "MESSAGE_AND_CALL" (Cả gọi điện và nhắn tin).
     • Nếu khách KHÔNG yêu cầu gọi ➔ actionType là "MESSAGE" (Chỉ nhắn tin).
   - Số lần lặp (maxRuns): Mặc định nếu khách không nói gì thì nhắc 1 lần (maxRuns = 1, intervalMinutes = 1, windowEnd = windowStart). Nếu khách yêu cầu nhắc lại nhiều lần thì đặt maxRuns tương ứng.
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
  "maxRuns": 1
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

