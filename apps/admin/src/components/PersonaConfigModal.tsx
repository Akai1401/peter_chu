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
      onNotify?.(err.message || 'Lỗi khi tải danh sách bộ văn phong', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadProfilesInitial();
      setIsCreatingNew(false);
      setEditingProfileId(null);
    }
  }, [isOpen]);

  // Activate profile
  const handleActivateProfile = async (id: string) => {
    setIsActivatingId(id);
    try {
      await api.activatePersonaProfile(id);
      setProfiles((prev) =>
        prev.map((p) => ({
          ...p,
          isActive: p.id === id
        }))
      );
      setFocusedProfileId(id);
      onNotify?.('Đã kích hoạt áp dụng bộ văn phong thành công!', 'success');
      onSuccess?.();
    } catch (err: any) {
      onNotify?.(err.message || 'Lỗi khi kích hoạt bộ cấu hình', 'error');
    } finally {
      setIsActivatingId(null);
    }
  };

  // Open Create Form (Blank)
  const handleOpenCreateNew = () => {
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
    setEditingProfileId(null);
    setIsCreatingNew(true);
  };

  // Open Edit Form
  const handleOpenEdit = (profile: PersonaProfile) => {
    setIsCreatingNew(false);
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

  // Catchphrase helpers
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

  // Sample Messages helpers
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
      onNotify?.(err.message || 'Lỗi khi học văn phong', 'error');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsLearning(false);
      setLearningStep('');
    }
  };

  // Delete profile
  const handleDeleteProfile = async (id: string, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa bộ văn phong "${name}"?`)) {
      return;
    }

    setIsDeletingId(id);
    try {
      await api.deletePersonaProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (editingProfileId === id) {
        setEditingProfileId(null);
      }
      onNotify?.(`Đã xóa bộ văn phong "${name}"!`, 'success');
      onSuccess?.();
    } catch (err: any) {
      onNotify?.(err.message || 'Lỗi khi xóa bộ văn phong', 'error');
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
          makeActive: profiles.length === 0
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
    <div className="p-3.5 sm:p-4 bg-muted/40 dark:bg-muted/20 rounded-2xl sm:rounded-xl border border-border space-y-3.5 shadow-2xs">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/80">
        <button
          type="button"
          onClick={() => {
            setIsCreatingNew(false);
            setEditingProfileId(null);
          }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium p-1.5 -ml-1 rounded active:scale-95 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Quay lại danh sách</span>
          <span className="sm:hidden text-xs">Quay lại</span>
        </button>

        <h4 className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-[170px] sm:max-w-[280px]">
          {isNew ? 'Tạo bộ văn phong mới' : `Sửa: ${formName || 'Bộ văn phong'}`}
        </h4>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setIsCreatingNew(false);
            setEditingProfileId(null);
          }}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground active:scale-95"
        >
          <X className="w-4 h-4 mr-0.5 sm:mr-1" />
          <span className="hidden sm:inline">Đóng</span>
        </Button>
      </div>

      {/* Profile Name */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
          Tên bộ văn phong: <span className="text-destructive">*</span>
        </Label>
        <Input
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="VD: Thân mật (anh - em), Tư vấn bán hàng, Bạn bè lầy lội..."
          className="text-sm sm:text-xs h-10 sm:h-8.5 bg-background font-medium focus-visible:ring-purple-500/30"
          autoFocus={isNew}
        />
      </div>

      {/* Auto-learn from thread link */}
      <div className="p-3 bg-muted/30 dark:bg-muted/20 rounded-xl border border-border/80 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <Label className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
            <Link2 className="w-3 h-3 text-muted-foreground" />
            Học tự động từ link Messenger (tùy chọn):
          </Label>
          {defaultThreadUrl && defaultThreadUrl !== formThreadUrl && (
            <button
              type="button"
              onClick={() => setFormThreadUrl(defaultThreadUrl)}
              className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-medium"
            >
              Dùng link đang theo dõi
            </button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Dán link chat Messenger để AI tự học câu chữ..."
            value={formThreadUrl}
            onChange={(e) => setFormThreadUrl(e.target.value)}
            disabled={isLearning}
            className="text-xs font-mono h-10 sm:h-8.5 bg-background flex-1 min-w-0"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleStartLearning}
            disabled={isLearning || !formThreadUrl.trim()}
            className="gap-1.5 h-10 sm:h-8.5 px-4 shrink-0 text-xs font-medium w-full sm:w-auto active:scale-[0.98] transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLearning ? 'animate-spin' : ''}`} />
            <span>{isLearning ? 'Đang học...' : 'Học tự động'}</span>
          </Button>
        </div>
        {isLearning && (
          <div className="p-2.5 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800 text-xs text-foreground flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="animate-pulse text-purple-700 dark:text-purple-300 font-medium">{learningStep}</span>
          </div>
        )}
      </div>

      {/* Tone & Pronouns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">Giọng điệu chủ đạo (Tone):</Label>
          <Input
            value={formTone}
            onChange={(e) => setFormTone(e.target.value)}
            placeholder="VD: Hài hước, gần gũi, thân thiện, lịch sự..."
            className="text-sm sm:text-xs h-10 sm:h-8.5 bg-background"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">Quy tắc xưng hô (Pronouns):</Label>
          <Input
            value={formPronouns}
            onChange={(e) => setFormPronouns(e.target.value)}
            placeholder="VD: anh - em, mình - bạn, tao - mày..."
            className="text-sm sm:text-xs h-10 sm:h-8.5 bg-background"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">Tóm tắt phong cách giao tiếp:</Label>
        <Input
          value={formSummary}
          onChange={(e) => setFormSummary(e.target.value)}
          placeholder="Tóm tắt ngắn gọn cá tính hoặc cách nói..."
          className="text-sm sm:text-xs h-10 sm:h-8.5 bg-background"
        />
      </div>

      {/* Catchphrases (Interactive Tag Editor) */}
      <div className="space-y-2 p-3 bg-background rounded-xl border border-border/80">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            Từ ngữ cửa miệng & thói quen câu chữ ({formCatchphrases.length}):
          </Label>
          <span className="text-[10px] text-muted-foreground">Bấm × để xóa</span>
        </div>

        {/* Tag Cloud */}
        <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-muted/20 rounded-lg border border-border/60 items-center">
          {formCatchphrases.length === 0 ? (
            <span className="text-[11px] text-muted-foreground italic px-1">Chưa có từ cửa miệng nào. Nhập thêm phía dưới!</span>
          ) : (
            formCatchphrases.map((phrase, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md text-xs font-medium bg-muted text-foreground border border-border/80"
              >
                <span>{phrase}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveCatchphrase(i)}
                  className="w-5 h-5 rounded hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive active:scale-95 transition-all p-0.5"
                  title="Xóa từ này"
                >
                  <X className="w-3.5 h-3.5" />
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
            placeholder="Gõ từ mới rồi nhấn Enter (VD: ok em, dạ, =))..."
            className="text-sm sm:text-xs h-10 sm:h-8.5 bg-background flex-1 min-w-0"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCatchphrase}
            disabled={!newCatchphraseInput.trim()}
            className="h-10 sm:h-8.5 px-3.5 text-xs gap-1 font-medium shrink-0 active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm</span>
          </Button>
        </div>
      </div>

      {/* Sample Messages (Interactive Editor) */}
      <div className="space-y-2 p-3 bg-background rounded-xl border border-border/80">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Quote className="w-3.5 h-3.5 text-muted-foreground" />
            Câu nói mẫu tiêu biểu ({formSampleMessages.length}):
          </Label>
          <span className="text-[10px] text-muted-foreground">Sửa trực tiếp hoặc xóa</span>
        </div>

        {/* List of sample quotes */}
        <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
          {formSampleMessages.length === 0 ? (
            <div className="p-3 bg-muted/20 rounded-lg border border-dashed text-center">
              <p className="text-xs text-muted-foreground italic">
                Chưa có câu nói mẫu nào. Thêm bên dưới hoặc học tự động từ link hội thoại.
              </p>
            </div>
          ) : (
            formSampleMessages.map((msg, i) => (
              <div
                key={i}
                className="group flex items-center gap-1.5 p-1 bg-muted/20 hover:bg-muted/40 rounded-lg border border-border/60 transition-colors"
              >
                <Input
                  value={msg}
                  onChange={(e) => handleUpdateSampleMessage(i, e.target.value)}
                  className="text-sm sm:text-xs h-9 sm:h-8 bg-background border border-border/50 text-foreground font-sans flex-1 min-w-0"
                  placeholder="Nội dung câu nói mẫu..."
                />
                <button
                  type="button"
                  onClick={() => handleRemoveSampleMessage(i)}
                  className="w-8 h-8 rounded-md hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive active:scale-95 transition-colors shrink-0"
                  title="Xóa câu nói mẫu này"
                >
                  <X className="w-4 h-4" />
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
            placeholder="Gõ câu nói mẫu mới rồi nhấn Enter..."
            className="text-sm sm:text-xs h-10 sm:h-8.5 bg-background flex-1 min-w-0"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddSampleMessage}
            disabled={!newSampleMessageInput.trim()}
            className="h-10 sm:h-8.5 px-3.5 text-xs gap-1 font-medium shrink-0 active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm câu</span>
          </Button>
        </div>
      </div>

      {/* Prompt Instruction */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-muted-foreground" />
          Chỉ thị bổ sung vào System Prompt:
        </Label>
        <Textarea
          rows={2}
          value={formInstruction}
          onChange={(e) => setFormInstruction(e.target.value)}
          className="text-xs font-mono bg-background resize-none min-h-[60px]"
          placeholder="Chỉ dẫn bổ sung cho AI khi đóng vai..."
        />
      </div>

      {/* Form Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setIsCreatingNew(false);
            setEditingProfileId(null);
          }}
          className="text-xs h-10 sm:h-8.5 px-4 flex-1 sm:flex-none active:scale-[0.98]"
        >
          Hủy
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={handleSaveForm}
          disabled={isSaving || isLearning || !formName.trim()}
          className="text-xs h-10 sm:h-8.5 px-5 gap-1.5 font-medium shadow-xs flex-1 sm:flex-none active:scale-[0.98]"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{isSaving ? 'Đang lưu...' : isNew ? 'Lưu bộ cấu hình' : 'Lưu thay đổi'}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLearning && onClose()}>
      <DialogContent className="w-[calc(100vw-20px)] sm:max-w-[660px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-xl">
        <DialogHeader className="p-4 sm:p-5 border-b shrink-0 text-left space-y-1">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 mt-0.5 sm:mt-0 shadow-2xs">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div className="space-y-0.5 min-w-0 flex-1 pr-6">
              <DialogTitle className="text-sm sm:text-base font-semibold flex items-center gap-2 text-foreground truncate">
                Quản lý Văn phong Hội thoại (Persona)
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 font-medium text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10 shrink-0">
                  AI Voice
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed line-clamp-2 sm:line-clamp-1">
                {isCreatingNew
                  ? 'Tạo mới bộ phong cách trò chuyện và huấn luyện AI.'
                  : editingProfileId !== null
                  ? 'Chỉnh sửa chi tiết ngữ điệu, từ ngữ cửa miệng và câu mẫu.'
                  : 'Danh sách các bộ phong cách trò chuyện. Chọn áp dụng hoặc chỉnh sửa.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto overflow-x-hidden p-4 sm:p-5 flex-1 min-h-0 space-y-4">
          {/* If creating new or editing an existing profile, ONLY render that editor form */}
          {isCreatingNew ? (
            renderEditorForm(true)
          ) : editingProfileId !== null ? (
            renderEditorForm(false)
          ) : (
            <>
              {/* Top Control Bar: Total count + Create Button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-foreground">
                    Bộ văn phong ({profiles.length})
                  </span>
                  {isLoading && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                      Đang tải...
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleOpenCreateNew}
                  className="h-8 sm:h-7 px-3 sm:px-2.5 text-xs gap-1.5 font-medium shadow-xs active:scale-[0.98]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tạo bộ mới</span>
                </Button>
              </div>

              {/* Vertical List of Profiles */}
              <div className="space-y-3">
                {profiles.map((profile) => {
                  const isActive = profile.isActive;
                  const isFocused = focusedProfileId === profile.id;
                  const isActivating = isActivatingId === profile.id;
                  const catchphrases = (profile.persona?.catchphrases || []).filter((p) => !isSystemNotice(p));

                  return (
                    <div
                      key={profile.id}
                      onClick={() => setFocusedProfileId(profile.id)}
                      className={`rounded-xl p-3.5 sm:p-4 border transition-all cursor-pointer w-full max-w-full overflow-hidden ${
                        isActive
                          ? 'border-purple-500/40 dark:border-purple-500/30 bg-purple-50/20 dark:bg-purple-950/15 shadow-2xs'
                          : isFocused
                          ? 'border-border bg-muted/20'
                          : 'border-border/80 bg-card hover:bg-muted/15'
                      }`}
                    >
                      <div className="flex flex-col gap-2.5 w-full min-w-0">
                        {/* Top row: Title + Active/Ready Badge + Desktop Actions */}
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <h4 className="text-xs sm:text-sm font-semibold text-foreground truncate" title={profile.name}>
                              {profile.name}
                            </h4>

                            {isActive ? (
                              <Badge variant="default" className="text-[10px] px-2 py-0 h-4.5 font-medium shrink-0 gap-1 bg-emerald-600 hover:bg-emerald-600 text-white">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                Đang dùng
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground shrink-0">
                                Sẵn sàng
                              </Badge>
                            )}
                          </div>

                          {/* Desktop Actions Row */}
                          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(profile);
                              }}
                              className="h-7 px-2.5 text-xs gap-1 font-medium"
                              title="Chỉnh sửa chi tiết bộ văn phong này"
                            >
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
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
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title="Nhân bản bộ cấu hình này"
                            >
                              <Copy className="w-3.5 h-3.5" />
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
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              title="Xóa bộ cấu hình này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>

                            {!isActive ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isActivating}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleActivateProfile(profile.id);
                                }}
                                className="h-7 px-3 text-xs gap-1 font-medium hover:bg-primary hover:text-primary-foreground transition-colors shrink-0 ml-0.5"
                                title="Kích hoạt áp dụng bộ này cho Bot"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{isActivating ? 'Đang áp dụng...' : 'Áp dụng'}</span>
                              </Button>
                            ) : (
                              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 px-1.5 shrink-0 ml-0.5 h-7">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Đang dùng</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Tone & Pronouns Tags */}
                        {(profile.persona?.tone || profile.persona?.pronouns) && (
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            {profile.persona?.tone && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border/50 max-w-[280px] truncate"
                                title={profile.persona.tone}
                              >
                                {profile.persona.tone}
                              </span>
                            )}
                            {profile.persona?.pronouns && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border/50 max-w-[220px] truncate"
                                title={profile.persona.pronouns}
                              >
                                {profile.persona.pronouns}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Style Summary */}
                        {profile.persona?.styleSummary && (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed break-words">
                            {profile.persona.styleSummary}
                          </p>
                        )}

                        {/* Catchphrases */}
                        {catchphrases.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center pt-0.5 min-w-0">
                            <span className="text-[10px] text-muted-foreground mr-0.5 shrink-0">Cửa miệng:</span>
                            {catchphrases.slice(0, 5).map((phrase, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-muted/80 text-foreground font-medium border border-border/40 max-w-[150px] truncate"
                                title={phrase}
                              >
                                {phrase}
                              </span>
                            ))}
                            {catchphrases.length > 5 && (
                              <span className="inline-block px-1 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground font-mono shrink-0">
                                +{catchphrases.length - 5}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Mobile Dedicated Touch Action Bar */}
                        <div className="flex sm:hidden items-center gap-2 pt-2 border-t border-border/60 w-full min-w-0">
                          {!isActive ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={isActivating}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleActivateProfile(profile.id);
                              }}
                              className="flex-1 min-w-0 h-9 text-xs gap-1.5 font-semibold active:scale-[0.98] shadow-xs"
                            >
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{isActivating ? 'Đang kích hoạt...' : 'Áp dụng'}</span>
                            </Button>
                          ) : (
                            <div className="flex-1 min-w-0 h-9 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate">Đang sử dụng</span>
                            </div>
                          )}

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(profile);
                            }}
                            className="h-9 px-3 text-xs gap-1 font-medium active:scale-[0.98] shrink-0"
                          >
                            <Pencil className="w-3.5 h-3.5" />
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
                            className="h-9 w-9 p-0 text-muted-foreground active:scale-95 shrink-0"
                            title="Nhân bản"
                          >
                            <Copy className="w-4 h-4" />
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
                            className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive active:scale-95 shrink-0"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {profiles.length === 0 && !isLoading && (
                  <div className="py-8 text-center bg-muted/20 rounded-lg border border-dashed p-4 space-y-2">
                    <Bot className="w-7 h-7 text-muted-foreground mx-auto stroke-1" />
                    <p className="text-xs font-medium text-foreground">Chưa có bộ văn phong nào</p>
                    <p className="text-[11px] text-muted-foreground">
                      Bấm vào nút <strong>"Tạo bộ mới"</strong> để bắt đầu cá nhân hoá AI.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <DialogFooter className="p-3 sm:px-5 sm:py-3.5 shrink-0 border-t flex flex-row items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Tổng cộng: <strong className="font-medium text-foreground">{profiles.length}</strong> bộ văn phong
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
