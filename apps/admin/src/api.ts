import type {
  BotState,
  Reminder,
  AuditLog,
  ExecutionLog,
  UpcomingSlot,
  CreateReminderInput,
  UpdateReminderInput
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
  setDryRun: (dryRun: boolean) =>
    request<BotState>('/bot/dry-run', {
      method: 'POST',
      body: JSON.stringify({ dryRun, actor: 'admin_dashboard' })
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
      body: JSON.stringify({ actor: 'admin_dashboard' })
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
