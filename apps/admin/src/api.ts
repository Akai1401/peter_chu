import type {
  BotState,
  SessionStatus,
  Reminder,
  AuditLog,
  ExecutionLog,
  UpcomingSlot,
  CreateReminderInput,
  UpdateReminderInput,
  LearnedPersona,
  PersonaProfile
} from '@messenger/shared';

const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  });

  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || (data.errors ? JSON.stringify(data.errors) : 'Request failed'));
  }
  return data.data !== undefined ? data.data : data;
}

export const api = {
  // Bot control
  getBotStatus: () => request<BotState>('/bot/status'),
  sendBotAction: (action: 'START' | 'STOP' | 'RESTART' | 'EMERGENCY_STOP', reason?: string) =>
    request<BotState>('/bot/action', {
      method: 'POST',
      body: JSON.stringify({ action, reason, actor: 'admin_dashboard' })
    }),
  checkSession: () =>
    request<{ sessionStatus: SessionStatus; lastHeartbeat: string | null }>('/bot/check-session', {
      method: 'POST'
    }),
  connectMessenger: () =>
    request<{ message: string }>('/bot/connect-messenger', {
      method: 'POST'
    }),
  disconnectMessenger: () =>
    request<{ message: string }>('/bot/disconnect', {
      method: 'POST'
    }),
  toggleAiAutoReply: (enabled: boolean) =>
    request<BotState>('/bot/ai-toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled, actor: 'admin_dashboard' })
    }),
  updateAiConfig: (config: { enabled?: boolean; targetThread?: string }) =>
    request<BotState>('/bot/ai-config', {
      method: 'POST',
      body: JSON.stringify({ ...config, actor: 'admin_dashboard' })
    }),
  checkIncomingMessages: () =>
    request<{ result: string; found: boolean; message: string }>('/bot/check-incoming', {
      method: 'POST'
    }),
  getPersona: () =>
    request<{ persona: LearnedPersona | null; sourceThread: string; updatedAt: string }>('/bot/persona'),
  learnPersona: (threadUrl: string) =>
    request<{ persona: LearnedPersona; sourceThread: string; message: string }>('/bot/learn-persona', {
      method: 'POST',
      body: JSON.stringify({ threadUrl })
    }),
  updatePersona: (persona: LearnedPersona, sourceThread?: string) =>
    request<{ message: string }>('/bot/persona', {
      method: 'PUT',
      body: JSON.stringify({ persona, sourceThread })
    }),
  resetPersona: () =>
    request<{ message: string }>('/bot/persona', {
      method: 'DELETE'
    }),
  getPersonaProfiles: () =>
    request<PersonaProfile[]>('/bot/personas'),
  createPersonaProfile: (input: { name: string; persona: LearnedPersona; sourceThread?: string; makeActive?: boolean }) =>
    request<PersonaProfile>('/bot/personas', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updatePersonaProfile: (id: string, input: { name?: string; persona?: LearnedPersona; sourceThread?: string }) =>
    request<PersonaProfile>(`/bot/personas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    }),
  activatePersonaProfile: (id: string) =>
    request<PersonaProfile>(`/bot/personas/${id}/activate`, {
      method: 'POST'
    }),
  deletePersonaProfile: (id: string) =>
    request<{ message: string }>(`/bot/personas/${id}`, {
      method: 'DELETE'
    }),

  // Reminders
  getReminders: () => request<Reminder[]>('/reminders'),
  createReminder: (input: CreateReminderInput) =>
    request<Reminder>('/reminders', {
      method: 'POST',
      body: JSON.stringify({ ...input, actor: 'admin_dashboard' })
    }),
  updateReminder: (id: string, input: UpdateReminderInput) =>
    request<Reminder>(`/reminders/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...input, actor: 'admin_dashboard' })
    }),
  toggleReminder: (id: string) =>
    request<Reminder>(`/reminders/${id}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ actor: 'admin_dashboard' })
    }),
  deleteReminder: (id: string) =>
    request<{ success: boolean }>(`/reminders/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ actor: 'admin_dashboard' })
    }),
  testReminder: (id: string) =>
    request<{ success: boolean; message: string; execution: ExecutionLog }>(`/reminders/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'admin_dashboard', actionType: 'MESSAGE' })
    }),
  callReminder: (id: string, callType: 'AUDIO' | 'VIDEO' = 'AUDIO', durationSeconds: number = 25) =>
    request<{ success: boolean; message: string; execution: ExecutionLog }>(`/reminders/${id}/call`, {
      method: 'POST',
      body: JSON.stringify({ callType, durationSeconds, actor: 'admin_dashboard' })
    }),

  // Schedules
  getUpcomingSlots: () => request<UpcomingSlot[]>('/schedules/upcoming'),

  // Logs
  getAuditLogs: (limit: number = 50) => request<AuditLog[]>(`/logs/audit?limit=${limit}`),
  getExecutionLogs: (limit: number = 50, reminderId?: string) =>
    request<ExecutionLog[]>(
      `/logs/execution?limit=${limit}${reminderId ? `&reminderId=${reminderId}` : ''}`
    )
};
