import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles,
  Link2,
  Bot,
  User,
  Quote,
  Trash2,
  Check,
  RefreshCw,
  Plus,
  X,
  CheckCircle2,
  Copy,
  Pencil,
  ArrowLeft
} from 'lucide-react';
import type { LearnedPersona, PersonaProfile } from '@messenger/shared';
import { api } from '@/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultThreadUrl?: string;
  onNotify?: (message: string, type: 'success' | 'error' | 'info') => void;
  onSuccess?: () => void;
}

export const PersonaConfigModal: React.FC<Props> = ({
  isOpen,
  onClose,
  defaultThreadUrl = '',
  onNotify,
  onSuccess
}) => {
  // Profiles list
  const [profiles, setProfiles] = useState<PersonaProfile[]>([]);
  const [focusedProfileId, setFocusedProfileId] = useState<string | null>(null);

  // Panel state: 'none', or 'create', or editing a specific profile ID
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  // Loading & Action states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isActivatingId, setIsActivatingId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLearning, setIsLearning] = useState<boolean>(false);
  const [learningStep, setLearningStep] = useState<string>('');

  // Form fields for Creating / Editing
  const [formName, setFormName] = useState<string>('');
  const [formThreadUrl, setFormThreadUrl] = useState<string>('');
  const [formTone, setFormTone] = useState<string>('');
  const [formPronouns, setFormPronouns] = useState<string>('');
  const [formSummary, setFormSummary] = useState<string>('');
  const [formCatchphrases, setFormCatchphrases] = useState<string[]>([]);
  const [formSampleMessages, setFormSampleMessages] = useState<string[]>([]);
  const [formInstruction, setFormInstruction] = useState<string>('');
  const [newCatchphraseInput, setNewCatchphraseInput] = useState<string>('');
  const [newSampleMessageInput, setNewSampleMessageInput] = useState<string>('');

  const isSystemNotice = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      lower.includes('đã xóa') ||
      lower.includes('đã xoá') ||
      lower.includes('đã thu hồi') ||
      lower.includes('tin nhắn đã bị') ||
      lower.includes('đã gỡ') ||
      lower.includes('unsent') ||
      lower.includes('removed a message')
    );
  };

  // Initial load on modal open: sort so active is on top
  const loadProfilesInitial = async () => {
    setIsLoading(true);
    try {
      const list = await api.getPersonaProfiles();
      // On modal open, sort so active profile is at the very top
      const sorted = [...list].sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return 0;
      });
      setProfiles(sorted);

      const active = sorted.find((p) => p.isActive);
      if (active) {
        setFocusedProfileId(active.id);
      }
    } catch (err: any) {
      console.warn('Could not load persona profiles:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsCreatingNew(false);
      setEditingProfileId(null);
      loadProfilesInitial();
    }
  }, [isOpen]);

  // Open "Tạo bộ mới" with completely empty / blank form
  const handleOpenCreateNew = () => {
    setEditingProfileId(null);
    setFormName('');
    setFormThreadUrl(defaultThreadUrl || '');
    setFormTone('');
    setFormPronouns('');
    setFormSummary('');
    setFormCatchphrases([]);
    setFormSampleMessages([]);
    setFormInstruction('');
    setNewCatchphraseInput('');
    setNewSampleMessageInput('');
    setIsCreatingNew(true);
  };

  // Open "Sửa" for a specific profile
  const handleOpenEdit = (profile: PersonaProfile) => {
    if (editingProfileId === profile.id) {
      // Toggle off if already editing
      setEditingProfileId(null);
      return;
    }
    setIsCreatingNew(false);
    setFocusedProfileId(profile.id);
    setFormName(profile.name);
    setFormThreadUrl(profile.sourceThread || defaultThreadUrl || '');
    setFormTone(profile.persona?.tone || '');
    setFormPronouns(profile.persona?.pronouns || '');
    setFormSummary(profile.persona?.styleSummary || '');
    setFormCatchphrases(
      (Array.isArray(profile.persona?.catchphrases)
        ? [...profile.persona.catchphrases]
        : []
      ).filter((phrase) => !isSystemNotice(phrase))
    );
    setFormSampleMessages(
      (Array.isArray(profile.persona?.sampleMessages)
        ? [...profile.persona.sampleMessages]
        : []
      ).filter((msg) => !isSystemNotice(msg))
    );
    setFormInstruction(profile.persona?.rawPromptInstruction || '');
    setNewCatchphraseInput('');
    setNewSampleMessageInput('');
    setEditingProfileId(profile.id);
  };

  // Tag / Catchphrase editor helpers
  const handleAddCatchphrase = () => {
    const raw = newCatchphraseInput.trim();
    if (!raw) return;

    const splitted = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const nextList = [...formCatchphrases];
    for (const item of splitted) {
      if (!nextList.includes(item)) {
        nextList.push(item);
      }
    }

    setFormCatchphrases(nextList);
    setNewCatchphraseInput('');
  };

  const handleRemoveCatchphrase = (indexToRemove: number) => {
    setFormCatchphrases((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Sample Messages editor helpers
  const handleAddSampleMessage = () => {
    const raw = newSampleMessageInput.trim();
    if (!raw) return;
    setFormSampleMessages((prev) => [...prev, raw]);
    setNewSampleMessageInput('');
  };

  const handleRemoveSampleMessage = (indexToRemove: number) => {
    setFormSampleMessages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleUpdateSampleMessage = (index: number, newText: string) => {
    setFormSampleMessages((prev) => prev.map((item, idx) => (idx === index ? newText : item)));
  };

  // Learn from thread URL
  const handleStartLearning = async () => {
    const target = formThreadUrl.trim();
    if (!target) {
      onNotify?.('Vui lòng nhập link cuộc hội thoại Messenger để bot phân tích', 'error');
      return;
    }

    setIsLearning(true);
    setLearningStep('Đang mở hội thoại Messenger...');

    const stepTimer1 = setTimeout(() => {
      setLearningStep('Đang cuộn tải lịch sử và trích xuất tin nhắn của bạn...');
    }, 4000);

    const stepTimer2 = setTimeout(() => {
      setLearningStep('Gemini AI đang phân tích văn phong, giọng điệu và từ cửa miệng...');
    }, 12000);

    try {
      const res = await api.learnPersona(target);
      if (res && res.persona) {
        setFormTone(res.persona.tone || '');
        setFormPronouns(res.persona.pronouns || '');
        setFormSummary(res.persona.styleSummary || '');
        const cleanCatch = (Array.isArray(res.persona.catchphrases) ? res.persona.catchphrases : [])
          .filter((s) => !isSystemNotice(s));
        const cleanSample = (Array.isArray(res.persona.sampleMessages) ? res.persona.sampleMessages : [])
          .filter((s) => !isSystemNotice(s));
        setFormCatchphrases(cleanCatch);
        setFormSampleMessages(cleanSample);
        setFormInstruction(res.persona.rawPromptInstruction || '');

        if (!formName.trim()) {
          setFormName(`Văn phong ${res.persona.tone || 'tự nhiên'}`);
        }

        onNotify?.('Học văn phong thành công! AI đã ghi nhớ phong cách nói chuyện của bạn.', 'success');
        onSuccess?.();
      }
    } catch (err: any) {
      onNotify?.(err.message || 'Học văn phong thất bại. Vui lòng kiểm tra lại link hội thoại!', 'error');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsLearning(false);
      setLearningStep('');
    }
  };

  // Activate specific profile without moving its position in the list
  const handleActivateProfile = async (profileId: string) => {
    setIsActivatingId(profileId);
    try {
      const activated = await api.activatePersonaProfile(profileId);
      // Keep existing list order! Only update isActive flag and focus
      setProfiles((prev) =>
        prev.map((p) => ({
          ...p,
          isActive: p.id === profileId
        }))
      );
      setFocusedProfileId(profileId);
      onNotify?.(`Đã áp dụng bộ văn phong "${activated.name}" cho AI Bot!`, 'success');
      onSuccess?.();
    } catch (err: any) {
      onNotify?.(err.message || 'Lỗi khi kích hoạt bộ cấu hình', 'error');
    } finally {
      setIsActivatingId(null);
    }
  };

  // Delete profile
  const handleDeleteProfile = async (profileId: string, name: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa bộ cấu hình "${name}" không?`)) {
      return;
    }

    setIsDeletingId(profileId);
    try {
      await api.deletePersonaProfile(profileId);
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
      if (editingProfileId === profileId) {
        setEditingProfileId(null);
      }
      onNotify?.(`Đã xóa bộ cấu hình "${name}".`, 'info');
      onSuccess?.();
    } catch (err: any) {
      onNotify?.(err.message || 'Lỗi khi xóa bộ cấu hình', 'error');
    } finally {
      setIsDeletingId(null);
    }
  };

  // Duplicate profile
  const handleDuplicateProfile = async (profile: PersonaProfile) => {
    try {
      const newName = `${profile.name} (Bản sao)`;
      const created = await api.createPersonaProfile({
        name: newName,
        persona: profile.persona,
        sourceThread: profile.sourceThread,
        makeActive: false
      });
      setProfiles((prev) => [...prev, created]);
      setFocusedProfileId(created.id);
      onNotify?.(`Đã nhân bản bộ cấu hình thành "${created.name}"!`, 'success');
      onSuccess?.();
    } catch (err: any) {
      onNotify?.(err.message || 'Lỗi khi nhân bản bộ cấu hình', 'error');
    }
  };

  // Save new or edited profile
  const handleSaveForm = async () => {
    const finalName = formName.trim();
    if (!finalName) {
      onNotify?.('Vui lòng nhập tên cho bộ văn phong', 'error');
      return;
    }

    const personaData: LearnedPersona = {
      tone: formTone.trim() || 'Tự nhiên, thân mật',
      pronouns: formPronouns.trim() || 'mình - bạn',
      styleSummary: formSummary.trim() || 'Nói chuyện tự nhiên, ngắn gọn và gần gũi.',
      catchphrases: formCatchphrases,
      sampleMessages: formSampleMessages,
      rawPromptInstruction: formInstruction.trim()
    };

    setIsSaving(true);
    try {
      if (isCreatingNew) {
        const created = await api.createPersonaProfile({
          name: finalName,
          persona: personaData,
          sourceThread: formThreadUrl.trim(),
          makeActive: profiles.length === 0 // Active by default only if first one
        });
        setProfiles((prev) => [...prev, created]);
        setFocusedProfileId(created.id);
        setIsCreatingNew(false);
        onNotify?.(`Đã tạo thành công bộ cấu hình "${created.name}"!`, 'success');
      } else if (editingProfileId) {
        const updated = await api.updatePersonaProfile(editingProfileId, {
          name: finalName,
          persona: personaData,
          sourceThread: formThreadUrl.trim()
        });
        setProfiles((prev) =>
          prev.map((p) => (p.id === editingProfileId ? { ...updated, isActive: p.isActive } : p))
        );
        setEditingProfileId(null);
        onNotify?.(`Đã lưu thay đổi bộ cấu hình "${updated.name}"!`, 'success');
      }
      onSuccess?.();
    } catch (err: any) {
      onNotify?.(err.message || 'Lỗi khi lưu cấu hình', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Reusable sub-component for the editor form
  const renderEditorForm = (isNew: boolean) => (
    <div className="p-4 bg-muted/40 rounded-xl border border-purple-200 dark:border-purple-800/80 space-y-3.5 animate-in fade-in-50 duration-200 shadow-xs">
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <button
          type="button"
          onClick={() => {
            setIsCreatingNew(false);
            setEditingProfileId(null);
          }}
          className="inline-flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 font-semibold hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại danh sách</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
          <h4 className="text-xs font-bold text-foreground truncate max-w-[280px]">
            {isNew ? 'Tạo bộ văn phong mới hoàn toàn' : `Chỉnh sửa: ${formName || 'Bộ văn phong'}`}
          </h4>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setIsCreatingNew(false);
            setEditingProfileId(null);
          }}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5 mr-1" />
          <span>Đóng</span>
        </Button>
      </div>

      {/* Profile Name */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-purple-600" />
          Tên bộ văn phong: <span className="text-red-500">*</span>
        </Label>
        <Input
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="Ví dụ: Thân mật (anh - em), Tư vấn bán hàng, Lầy lội bạn bè..."
          className="text-xs h-8 bg-background font-medium"
          autoFocus={isNew}
        />
      </div>

      {/* Auto-learn from thread link */}
      <div className="p-3 bg-background/80 rounded-lg border border-border/80 space-y-2">
        <Label className="text-[11px] font-semibold flex items-center justify-between text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Link2 className="w-3 h-3 text-purple-600" />
            Học tự động từ link Messenger (tùy chọn):
          </span>
          {defaultThreadUrl && defaultThreadUrl !== formThreadUrl && (
            <button
              type="button"
              onClick={() => setFormThreadUrl(defaultThreadUrl)}
              className="text-[10px] text-purple-600 hover:underline font-normal"
            >
              Dùng link đang theo dõi
            </button>
          )}
        </Label>
        <div className="flex gap-2">
          <Input
            placeholder="Dán link đoạn chat Messenger để AI tự quét câu chữ..."
            value={formThreadUrl}
            onChange={(e) => setFormThreadUrl(e.target.value)}
            disabled={isLearning}
            className="text-xs font-mono h-8 bg-background"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleStartLearning}
            disabled={isLearning || !formThreadUrl.trim()}
            className="gap-1.5 h-8 px-3 shrink-0 text-xs bg-purple-600 hover:bg-purple-700 text-white shadow-2xs font-medium"
          >
            <RefreshCw className={`w-3 h-3 ${isLearning ? 'animate-spin' : ''}`} />
            <span>{isLearning ? 'Đang học...' : 'Học tự động'}</span>
          </Button>
        </div>
        {isLearning && (
          <div className="p-2 bg-purple-50 dark:bg-purple-950/40 rounded border border-purple-200 dark:border-purple-800 text-xs text-purple-700 dark:text-purple-300 flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <span className="animate-pulse">{learningStep}</span>
          </div>
        )}
      </div>

      {/* Tone & Pronouns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] font-medium text-muted-foreground">Giọng điệu chủ đạo (Tone):</Label>
          <Input
            value={formTone}
            onChange={(e) => setFormTone(e.target.value)}
            placeholder="Ví dụ: Vui vẻ, ấm áp, thân thiện, lịch sự..."
            className="text-xs h-8 bg-background"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-medium text-muted-foreground">Quy tắc xưng hô (Pronouns):</Label>
          <Input
            value={formPronouns}
            onChange={(e) => setFormPronouns(e.target.value)}
            placeholder="Ví dụ: anh - em, mình - bạn, tao - mày..."
            className="text-xs h-8 bg-background"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-1">
        <Label className="text-[11px] font-medium text-muted-foreground">Tóm tắt phong cách giao tiếp:</Label>
        <Input
          value={formSummary}
          onChange={(e) => setFormSummary(e.target.value)}
          placeholder="Tóm tắt ngắn gọn cá tính hoặc cách nói..."
          className="text-xs h-8 bg-background"
        />
      </div>

      {/* Catchphrases (Interactive Tag Editor) */}
      <div className="space-y-2 p-2.5 bg-background rounded-lg border border-border/80">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-purple-600" />
            Từ ngữ cửa miệng, icon & thói quen câu chữ ({formCatchphrases.length}):
          </Label>
          <span className="text-[10px] text-muted-foreground">Bấm dấu × để xóa</span>
        </div>

        {/* Tag Cloud */}
        <div className="flex flex-wrap gap-1.5 min-h-[30px] p-1.5 bg-muted/30 rounded-md border border-border/60 items-center">
          {formCatchphrases.length === 0 ? (
            <span className="text-[11px] text-muted-foreground italic px-1">Chưa có từ cửa miệng nào. Nhập thêm phía dưới!</span>
          ) : (
            formCatchphrases.map((phrase, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
              >
                <span>{phrase}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveCatchphrase(i)}
                  className="w-3.5 h-3.5 rounded-full hover:bg-purple-200 dark:hover:bg-purple-800 flex items-center justify-center text-purple-600 dark:text-purple-400 hover:text-red-500 transition-colors"
                  title="Xóa từ này"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))
          )}
        </div>

        {/* Inline input to add catchphrase */}
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={newCatchphraseInput}
            onChange={(e) => setNewCatchphraseInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCatchphrase();
              }
            }}
            placeholder="Gõ từ cửa miệng mới rồi nhấn Enter (ví dụ: ok em nhé, đợi tí, =))..."
            className="text-xs h-7 bg-background"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCatchphrase}
            disabled={!newCatchphraseInput.trim()}
            className="h-7 px-2.5 text-xs gap-1 font-medium shrink-0 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-50"
          >
            <Plus className="w-3 h-3" />
            <span>Thêm</span>
          </Button>
        </div>
      </div>

      {/* Sample Messages (Interactive Editor) */}
      <div className="space-y-2 p-2.5 bg-background rounded-lg border border-border/80">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <Quote className="w-3.5 h-3.5 text-purple-600" />
            Câu nói mẫu tiêu biểu ({formSampleMessages.length}):
          </Label>
          <span className="text-[10px] text-muted-foreground">Sửa trực tiếp câu chữ hoặc bấm × để xóa</span>
        </div>

        {/* List of sample quotes */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {formSampleMessages.length === 0 ? (
            <div className="p-2.5 bg-muted/20 rounded-md border border-dashed text-center">
              <p className="text-[11px] text-muted-foreground italic">
                Chưa có câu nói mẫu nào. Thêm bên dưới hoặc học tự động từ link hội thoại.
              </p>
            </div>
          ) : (
            formSampleMessages.map((msg, i) => (
              <div
                key={i}
                className="group flex items-center gap-1.5 p-1 bg-muted/30 hover:bg-muted/50 rounded-md border border-border/60 transition-colors"
              >
                <div className="w-1 h-5 bg-purple-500 rounded-full shrink-0 ml-1" />
                <Input
                  value={msg}
                  onChange={(e) => handleUpdateSampleMessage(i, e.target.value)}
                  className="text-xs h-7 bg-background border-none focus-visible:ring-1 focus-visible:ring-purple-500 text-foreground/90 font-sans"
                  placeholder="Nội dung câu nói mẫu..."
                />
                <button
                  type="button"
                  onClick={() => handleRemoveSampleMessage(i)}
                  className="w-6 h-6 rounded-md hover:bg-red-100 dark:hover:bg-red-950/50 flex items-center justify-center text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                  title="Xóa câu nói mẫu này"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Inline input to add a new sample quote */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <Input
            value={newSampleMessageInput}
            onChange={(e) => setNewSampleMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSampleMessage();
              }
            }}
            placeholder="Gõ câu nói mẫu mới rồi nhấn Enter (ví dụ: Alo check tin nhắn tao gửi nhé!)..."
            className="text-xs h-7 bg-background"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddSampleMessage}
            disabled={!newSampleMessageInput.trim()}
            className="h-7 px-2.5 text-xs gap-1 font-medium shrink-0 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-50"
          >
            <Plus className="w-3 h-3" />
            <span>Thêm câu</span>
          </Button>
        </div>
      </div>

      {/* Prompt Instruction */}
      <div className="space-y-1">
        <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          <Bot className="w-3 h-3 text-purple-600" />
          Chỉ thị bổ sung trực tiếp vào System Prompt:
        </Label>
        <Textarea
          rows={2}
          value={formInstruction}
          onChange={(e) => setFormInstruction(e.target.value)}
          className="text-xs font-mono bg-background resize-none"
          placeholder="Chỉ dẫn bổ sung cho AI khi đóng vai..."
        />
      </div>

      {/* Form Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setIsCreatingNew(false);
            setEditingProfileId(null);
          }}
          className="text-xs h-8 px-3"
        >
          Hủy
        </Button>

        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={handleSaveForm}
          disabled={isSaving || isLearning || !formName.trim()}
          className="text-xs h-8 px-4 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-2xs font-semibold"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{isSaving ? 'Đang lưu...' : isNew ? 'Lưu bộ cấu hình' : 'Lưu thay đổi'}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLearning && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[92vh] overflow-y-auto p-5">
        <DialogHeader className="space-y-1.5 pb-3 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-purple-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                Quản Lý & Học Văn Phong Nói Chuyện
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-300 font-mono">
                  AI Persona
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isCreatingNew
                  ? 'Tạo mới bộ phong cách trò chuyện và huấn luyện AI.'
                  : editingProfileId !== null
                  ? 'Chỉnh sửa chi tiết ngữ điệu, từ ngữ cửa miệng và câu mẫu.'
                  : 'Danh sách các bộ phong cách trò chuyện. Chọn áp dụng, chỉnh sửa hoặc tạo mới.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* If creating new or editing an existing profile, ONLY render that editor form! */}
          {isCreatingNew ? (
            renderEditorForm(true)
          ) : editingProfileId !== null ? (
            renderEditorForm(false)
          ) : (
            <>
              {/* Top Control Bar: Total count + Create Button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Danh sách bộ văn phong ({profiles.length})
                  </span>
                  {isLoading && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin text-purple-600" />
                      Đang tải...
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleOpenCreateNew}
                  className="h-8 px-3 text-xs gap-1.5 font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Tạo bộ mới</span>
                </Button>
              </div>

              {/* Vertical List of Profiles (1 list dọc) */}
              <div className="space-y-2.5">
                {profiles.map((profile) => {
                  const isActive = profile.isActive;
                  const isFocused = focusedProfileId === profile.id;
                  const isActivating = isActivatingId === profile.id;
                  const catchphrases = (profile.persona?.catchphrases || []).filter((p) => !isSystemNotice(p));

                  return (
                    <div key={profile.id} className="space-y-2">
                      {/* The Profile Card Row */}
                      <div
                        onClick={() => setFocusedProfileId(profile.id)}
                        className={`rounded-xl p-3.5 border transition-all cursor-pointer ${
                          isActive
                            ? 'border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/30 ring-2 ring-purple-500/30 shadow-xs'
                            : isFocused
                            ? 'border-purple-200 dark:border-purple-800 bg-muted/30 ring-1 ring-purple-300/40'
                            : 'border-border bg-card hover:border-purple-200/80 dark:hover:border-purple-800/80 shadow-2xs'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {/* Left: Info details */}
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-foreground truncate" title={profile.name}>
                                {profile.name}
                              </h4>

                              {isActive ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  ĐANG DÙNG
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground">
                                  Sẵn sàng
                                </span>
                              )}

                              {profile.persona?.tone && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-100/70 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300">
                                  {profile.persona.tone}
                                </span>
                              )}

                              {profile.persona?.pronouns && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-100/70 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                                  {profile.persona.pronouns}
                                </span>
                              )}
                            </div>

                            {profile.persona?.styleSummary && (
                              <p className="text-[11px] text-muted-foreground line-clamp-1 leading-relaxed">
                                {profile.persona.styleSummary}
                              </p>
                            )}

                            {catchphrases.length > 0 && (
                              <div className="flex flex-wrap gap-1 items-center pt-0.5">
                                <span className="text-[10px] font-semibold text-muted-foreground mr-1">Từ cửa miệng:</span>
                                {catchphrases.slice(0, 5).map((phrase, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-block px-1.5 py-0.2 rounded text-[10px] bg-muted/80 text-foreground/80 font-medium"
                                  >
                                    {phrase}
                                  </span>
                                ))}
                                {catchphrases.length > 5 && (
                                  <span className="inline-block px-1.5 py-0.2 rounded text-[10px] bg-muted/70 text-muted-foreground font-mono">
                                    +{catchphrases.length - 5}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right: Actions */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(profile);
                              }}
                              className="h-7 px-2.5 text-xs gap-1 font-medium hover:border-purple-300 hover:text-purple-700"
                              title="Chỉnh sửa chi tiết bộ văn phong này"
                            >
                              <Pencil className="w-3 h-3 text-purple-600" />
                              <span>Sửa</span>
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateProfile(profile);
                              }}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              title="Nhân bản bộ cấu hình này"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={isDeletingId === profile.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProfile(profile.id, profile.name);
                              }}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                              title="Xóa bộ cấu hình này"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>

                            {/* Apply button */}
                            {!isActive ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                disabled={isActivating}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleActivateProfile(profile.id);
                                }}
                                className="h-7 px-3 text-xs gap-1 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs shrink-0"
                                title="Bấm để kích hoạt áp dụng bộ này cho Bot"
                              >
                                <Check className="w-3 h-3" />
                                <span>{isActivating ? 'Đang áp dụng...' : 'Chọn áp dụng'}</span>
                              </Button>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 px-2 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Đang dùng</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {profiles.length === 0 && !isLoading && (
                  <div className="py-8 text-center bg-muted/20 rounded-xl border border-dashed p-4 space-y-2">
                    <Bot className="w-8 h-8 text-muted-foreground mx-auto stroke-1" />
                    <p className="text-xs font-semibold text-foreground">Chưa có bộ văn phong nào</p>
                    <p className="text-[11px] text-muted-foreground">
                      Bấm vào nút <strong>"+ Tạo bộ mới"</strong> ở góc trên để tạo bộ phong cách trò chuyện bạn nhé!
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <DialogFooter className="pt-3 border-t sm:justify-between items-center">
          <span className="text-xs text-muted-foreground">
            Tổng cộng: <strong className="font-semibold text-foreground">{profiles.length}</strong> bộ cấu hình
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs h-8 px-4"
          >
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
