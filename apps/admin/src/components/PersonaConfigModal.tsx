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
  ArrowLeft,
  Maximize2,
  Minimize2
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
  const [isPromptExpanded, setIsPromptExpanded] = useState<boolean>(false);
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
      onNotify?.(err.message || 'Error loading persona profiles', 'error');
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
      onNotify?.('Persona profile activated successfully!', 'success');
      onSuccess?.();
    } catch (err: any) {
      onNotify?.(err.message || 'Error activating persona profile', 'error');
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
      onNotify?.('Please enter a Messenger conversation link to analyze', 'error');
      return;
    }

    setIsLearning(true);
    setLearningStep('Opening Messenger conversation...');

    const stepTimer1 = setTimeout(() => {
      setLearningStep('Scrolling chat history and extracting your messages...');
    }, 4000);

    const stepTimer2 = setTimeout(() => {
      setLearningStep('Gemini AI is analyzing communication style, tone, and catchphrases...');
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
          setFormName(`Persona ${res.persona.tone || 'Natural'}`);
        }

        onNotify?.('Persona learned successfully! AI has captured your communication style.', 'success');
        onSuccess?.();
      }
    } catch (err: any) {
      onNotify?.(err.message || 'Error learning persona style', 'error');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsLearning(false);
      setLearningStep('');
    }
  };

  // Delete profile
  const handleDeleteProfile = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete persona "${name}"?`)) {
      return;
    }

    setIsDeletingId(id);
    try {
      await api.deletePersonaProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (editingProfileId === id) {
        setEditingProfileId(null);
      }
      onNotify?.(`Deleted persona "${name}"!`, 'success');
      onSuccess?.();
    } catch (err: any) {
      onNotify?.(err.message || 'Error deleting persona', 'error');
    } finally {
      setIsDeletingId(null);
    }
  };

  // Duplicate profile
  const handleDuplicateProfile = async (profile: PersonaProfile) => {
    try {
      const newName = `${profile.name} (Copy)`;
      const created = await api.createPersonaProfile({
        name: newName,
        persona: profile.persona,
        sourceThread: profile.sourceThread,
        makeActive: false
      });
      setProfiles((prev) => [...prev, created]);
      setFocusedProfileId(created.id);
      onNotify?.(`Duplicated persona as "${created.name}"!`, 'success');
      onSuccess?.();
    } catch (err: any) {
      onNotify?.(err.message || 'Error duplicating persona', 'error');
    }
  };

  // Save new or edited profile
  const handleSaveForm = async () => {
    const finalName = formName.trim();
    if (!finalName) {
      onNotify?.('Please enter a name for the persona profile', 'error');
      return;
    }

    const personaData: LearnedPersona = {
      tone: formTone.trim() || 'Natural & friendly',
      pronouns: formPronouns.trim() || 'I - you',
      styleSummary: formSummary.trim() || 'Natural, concise, and approachable communication style.',
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
        onNotify?.(`Created persona profile "${created.name}" successfully!`, 'success');
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
        onNotify?.(`Saved changes to persona profile "${updated.name}"!`, 'success');
      }
      onSuccess?.();
    } catch (err: any) {
      onNotify?.(err.message || 'Error saving persona profile', 'error');
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
          <span className="hidden sm:inline">Back to list</span>
          <span className="sm:hidden text-xs">Back</span>
        </button>

        <h4 className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-[170px] sm:max-w-[280px]">
          {isNew ? 'Create New Persona' : `Edit: ${formName || 'Persona'}`}
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
          <span className="hidden sm:inline">Close</span>
        </Button>
      </div>

      {/* Profile Name */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
          Persona Profile Name: <span className="text-destructive">*</span>
        </Label>
        <Input
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="e.g. Friendly & Casual, Professional Consultant, Playful Companion..."
          className="text-sm sm:text-xs h-10 sm:h-8.5 bg-background font-medium focus-visible:ring-purple-500/30"
          autoFocus={isNew}
        />
      </div>

      {/* Auto-learn from thread link */}
      <div className="p-3 bg-muted/30 dark:bg-muted/20 rounded-xl border border-border/80 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <Label className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
            <Link2 className="w-3 h-3 text-muted-foreground" />
            Auto-learn from Messenger link (optional):
          </Label>
          {defaultThreadUrl && defaultThreadUrl !== formThreadUrl && (
            <button
              type="button"
              onClick={() => setFormThreadUrl(defaultThreadUrl)}
              className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-medium"
            >
              Use current thread link
            </button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Paste Messenger chat URL for AI to analyze messages..."
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
            <span>{isLearning ? 'Learning...' : 'Auto Learn'}</span>
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
          <Label className="text-xs font-medium text-foreground">Primary Tone:</Label>
          <Input
            value={formTone}
            onChange={(e) => setFormTone(e.target.value)}
            placeholder="e.g. Humorous, warm, friendly, polite..."
            className="text-sm sm:text-xs h-10 sm:h-8.5 bg-background"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">Addressing & Pronouns:</Label>
          <Input
            value={formPronouns}
            onChange={(e) => setFormPronouns(e.target.value)}
            placeholder="e.g. I - you, buddy, first name..."
            className="text-sm sm:text-xs h-10 sm:h-8.5 bg-background"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">Style Summary:</Label>
        <Input
          value={formSummary}
          onChange={(e) => setFormSummary(e.target.value)}
          placeholder="Brief summary of persona and speech habits..."
          className="text-sm sm:text-xs h-10 sm:h-8.5 bg-background"
        />
      </div>

      {/* Catchphrases (Interactive Tag Editor) */}
      <div className="space-y-2 p-3 bg-background rounded-xl border border-border/80">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            Catchphrases & Speech Habits ({formCatchphrases.length}):
          </Label>
          <span className="text-[10px] text-muted-foreground">Click × to remove</span>
        </div>

        {/* Tag Cloud */}
        <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-muted/20 rounded-lg border border-border/60 items-center">
          {formCatchphrases.length === 0 ? (
            <span className="text-[11px] text-muted-foreground italic px-1">No catchphrases added yet. Type below to add!</span>
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
                  title="Remove phrase"
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
            placeholder="Type catchphrase and press Enter (e.g. got it, haha, sure)..."
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
            <span>Add</span>
          </Button>
        </div>
      </div>

      {/* Sample Messages (Interactive Editor) */}
      <div className="space-y-2 p-3 bg-background rounded-xl border border-border/80">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Quote className="w-3.5 h-3.5 text-muted-foreground" />
            Sample Quotes & Phrases ({formSampleMessages.length}):
          </Label>
          <span className="text-[10px] text-muted-foreground">Edit inline or remove</span>
        </div>

        {/* List of sample quotes */}
        <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
          {formSampleMessages.length === 0 ? (
            <div className="p-3 bg-muted/20 rounded-lg border border-dashed text-center">
              <p className="text-xs text-muted-foreground italic">
                No sample quotes yet. Add below or auto-learn from a conversation link.
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
                  placeholder="Sample quote content..."
                />
                <button
                  type="button"
                  onClick={() => handleRemoveSampleMessage(i)}
                  className="w-8 h-8 rounded-md hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive active:scale-95 transition-colors shrink-0"
                  title="Remove sample quote"
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
            placeholder="Type a sample quote and press Enter..."
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
            <span>Add Quote</span>
          </Button>
        </div>
      </div>

      {/* Prompt Instruction */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-muted-foreground" />
            Additional System Prompt Instructions:
          </Label>
          <button
            type="button"
            onClick={() => setIsPromptExpanded(!isPromptExpanded)}
            className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-medium cursor-pointer transition-colors"
          >
            {isPromptExpanded ? (
              <>
                <Minimize2 className="w-3 h-3" />
                <span>Collapse</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3" />
                <span>Expand View</span>
              </>
            )}
          </button>
        </div>
        <Textarea
          rows={isPromptExpanded ? 12 : 6}
          value={formInstruction}
          onChange={(e) => setFormInstruction(e.target.value)}
          className={`text-xs font-mono bg-background resize-y leading-relaxed focus-visible:ring-purple-500/30 transition-all ${
            isPromptExpanded ? 'min-h-[280px]' : 'min-h-[130px]'
          }`}
          placeholder="Additional instructions for AI roleplay (e.g., custom persona guidelines, boundaries, specific behaviors...)"
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
          <span>Tip: Drag the bottom-right corner to resize freely</span>
          <span>{formInstruction.length} characters</span>
        </div>
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
          Cancel
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={handleSaveForm}
          disabled={isSaving || isLearning || !formName.trim()}
          className="text-xs h-10 sm:h-8.5 px-5 gap-1.5 font-medium shadow-xs flex-1 sm:flex-none active:scale-[0.98]"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{isSaving ? 'Saving...' : isNew ? 'Save Persona' : 'Save Changes'}</span>
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
                Manage Conversation Personas
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 font-medium text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10 shrink-0">
                  AI Voice
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed line-clamp-2 sm:line-clamp-1">
                {isCreatingNew
                  ? 'Create a new conversation persona and train the AI.'
                  : editingProfileId !== null
                  ? 'Fine-tune tone, catchphrases, and sample messages.'
                  : 'List of conversation styles. Select to activate or edit.'}
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
                    Persona Profiles ({profiles.length})
                  </span>
                  {isLoading && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                      Loading...
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
                  <span>Create New</span>
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
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground shrink-0">
                                Ready
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
                              title="Edit this persona profile"
                            >
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                              <span>Edit</span>
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
                              title="Duplicate this persona profile"
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
                              title="Delete this persona profile"
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
                                title="Activate this persona for the Bot"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{isActivating ? 'Applying...' : 'Apply'}</span>
                              </Button>
                            ) : (
                              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 px-1.5 shrink-0 ml-0.5 h-7">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Active</span>
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
                            <span className="text-[10px] text-muted-foreground mr-0.5 shrink-0">Catchphrases:</span>
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
                              <span className="truncate">{isActivating ? 'Activating...' : 'Apply'}</span>
                            </Button>
                          ) : (
                            <div className="flex-1 min-w-0 h-9 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate">Active</span>
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
                            <span>Edit</span>
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
                            title="Duplicate"
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
                            title="Delete"
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
                    <p className="text-xs font-medium text-foreground">No persona profiles yet</p>
                    <p className="text-[11px] text-muted-foreground">
                      Click <strong>"Create New"</strong> to personalize AI conversation style.
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
            Total: <strong className="font-medium text-foreground">{profiles.length}</strong> persona profiles
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs h-8 px-4"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
