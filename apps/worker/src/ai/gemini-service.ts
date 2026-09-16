export interface ConversationMessage {
  role: 'user' | 'model';
  text: string;
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
    conversationHistory?: ConversationMessage[]
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured');
    }

    const trimmedInput = incomingMessage.trim();
    if (!trimmedInput) {
      throw new Error('Incoming message is empty');
    }

    const prompt = this.buildPrompt(trimmedInput, senderName, conversationHistory);
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
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 250
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
    conversationHistory?: ConversationMessage[]
  ): string {
    const sender = senderName || 'Khách';
    let prompt = `Bạn đang đóng vai "Tôi (Chủ tài khoản)" trên Facebook Messenger để trò chuyện với đối phương là "${sender} (Khách)".
Hãy trả lời tin nhắn mới nhất bằng tiếng Việt một cách tự nhiên, ngắn gọn, ấm áp và gần gũi như người thật (không dùng định dạng markdown tiêu đề, không xưng là mô hình AI, trả lời trực tiếp vào trọng tâm câu chuyện dựa trên toàn bộ bối cảnh cuộc trò chuyện).\n\n`;

    if (conversationHistory && conversationHistory.length > 0) {
      prompt += `--- LỊCH SỬ / BỐI CẢNH HỘI THOẠI TRƯỚC ĐÓ ---\n`;
      for (const msg of conversationHistory.slice(-10)) {
        const speaker = msg.role === 'model' ? 'Tôi (Chủ tài khoản)' : `${sender} (Khách)`;
        prompt += `${speaker}: "${msg.text}"\n`;
      }
      prompt += `--- HẾT BỐI CẢNH ---\n\n`;
    }

    prompt += `Tin nhắn mới nhất từ ${sender} (Khách): "${incomingMessage}"\n\nCâu trả lời của "Tôi (Chủ tài khoản)" ngắn gọn, phù hợp với ngữ cảnh:`;
    return prompt;
  }
}
