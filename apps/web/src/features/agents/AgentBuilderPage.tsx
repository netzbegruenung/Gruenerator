import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useCreateUserAgent, useUpdateUserAgent, useUserAgent, type UserAgentInput } from './api';

interface FormState {
  identifier: string;
  title: string;
  description: string;
  systemRole: string;
  avatar: string;
  backgroundColor: string;
  tags: string;
  openingMessage: string;
  openingQuestions: string;
  model: string;
  provider: 'mistral' | 'anthropic' | 'litellm' | 'regolo';
  maxTokens: number;
  temperature: number;
}

const EMPTY: FormState = {
  identifier: '',
  title: '',
  description: '',
  systemRole: '',
  avatar: '✨',
  backgroundColor: '#316049',
  tags: '',
  openingMessage: '',
  openingQuestions: '',
  model: 'mistral-large-latest',
  provider: 'mistral',
  maxTokens: 3000,
  temperature: 0.5,
};

export default function AgentBuilderPage() {
  const navigate = useNavigate();
  const { identifier } = useParams<{ identifier?: string }>();
  const isEdit = !!identifier;
  const { data: existing } = useUserAgent(identifier);
  const createMut = useCreateUserAgent();
  const updateMut = useUpdateUserAgent(identifier ?? '');

  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setForm({
        identifier: existing.identifier,
        title: existing.title,
        description: existing.description,
        systemRole: existing.systemRole,
        avatar: existing.avatar,
        backgroundColor: existing.backgroundColor,
        tags: existing.tags.join(', '),
        openingMessage: existing.openingMessage,
        openingQuestions: existing.openingQuestions.join('\n'),
        model: existing.model,
        provider: existing.provider,
        maxTokens: existing.params.max_tokens,
        temperature: existing.params.temperature,
      });
    }
  }, [existing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload: UserAgentInput = {
      identifier: form.identifier.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      systemRole: form.systemRole.trim(),
      avatar: form.avatar.trim(),
      backgroundColor: form.backgroundColor,
      tags: form.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      model: form.model,
      provider: form.provider,
      params: { max_tokens: form.maxTokens, temperature: form.temperature },
      openingMessage: form.openingMessage,
      openingQuestions: form.openingQuestions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      locale: 'de-DE',
      author: 'Eigene*r Agent*in',
    };

    try {
      if (isEdit) {
        const { identifier: _ignored, ...patch } = payload;
        void _ignored;
        await updateMut.mutateAsync(patch);
      } else {
        await createMut.mutateAsync(payload);
      }
      void navigate('/skills');
    } catch (err) {
      const e2 = err as { response?: { data?: { message?: string; error?: string } } };
      setError(
        e2.response?.data?.message ?? e2.response?.data?.error ?? 'Speichern fehlgeschlagen.'
      );
    }
  };

  const inputCls =
    'w-full rounded border border-grey-300 bg-background px-sm py-xs focus:border-primary-600 focus:outline-none dark:border-grey-700';

  return (
    <div className="mx-auto max-w-3xl p-md">
      <h1 className="mb-lg text-2xl font-semibold">
        {isEdit ? 'Agent*in bearbeiten' : 'Neue*r Agent*in'}
      </h1>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-md">
        <label className="flex flex-col gap-xs">
          <span className="font-medium">Bezeichner (Slug)</span>
          <input
            type="text"
            className={inputCls}
            value={form.identifier}
            onChange={(e) => set('identifier', e.target.value)}
            disabled={isEdit}
            required
            pattern="[a-z0-9-]+"
            placeholder="mein-agent"
          />
          <span className="text-xs text-foreground-muted">
            Nur Kleinbuchstaben, Ziffern, Bindestriche. Wird in URLs verwendet.
          </span>
        </label>

        <label className="flex flex-col gap-xs">
          <span className="font-medium">Titel</span>
          <input
            type="text"
            className={inputCls}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            required
            maxLength={100}
          />
        </label>

        <label className="flex flex-col gap-xs">
          <span className="font-medium">Beschreibung</span>
          <input
            type="text"
            className={inputCls}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            required
            maxLength={500}
          />
        </label>

        <div className="flex gap-md">
          <label className="flex flex-col gap-xs">
            <span className="font-medium">Avatar (Emoji)</span>
            <input
              type="text"
              className={`${inputCls} w-24 text-center text-2xl`}
              value={form.avatar}
              onChange={(e) => set('avatar', e.target.value)}
              required
              maxLength={8}
            />
          </label>

          <label className="flex flex-col gap-xs">
            <span className="font-medium">Hintergrundfarbe</span>
            <input
              type="color"
              className="h-10 w-24 cursor-pointer rounded border border-grey-300 dark:border-grey-700"
              value={form.backgroundColor}
              onChange={(e) => set('backgroundColor', e.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-xs">
          <span className="font-medium">System-Prompt</span>
          <textarea
            className={`${inputCls} min-h-[200px] font-mono text-sm`}
            value={form.systemRole}
            onChange={(e) => set('systemRole', e.target.value)}
            required
            rows={10}
            placeholder="Du bist ein*e ..."
          />
        </label>

        <label className="flex flex-col gap-xs">
          <span className="font-medium">Begrüßungstext (optional)</span>
          <textarea
            className={`${inputCls} min-h-[80px]`}
            value={form.openingMessage}
            onChange={(e) => set('openingMessage', e.target.value)}
            rows={3}
          />
        </label>

        <label className="flex flex-col gap-xs">
          <span className="font-medium">Beispielfragen (eine pro Zeile, optional)</span>
          <textarea
            className={`${inputCls} min-h-[80px]`}
            value={form.openingQuestions}
            onChange={(e) => set('openingQuestions', e.target.value)}
            rows={4}
          />
        </label>

        <label className="flex flex-col gap-xs">
          <span className="font-medium">Tags (kommagetrennt)</span>
          <input
            type="text"
            className={inputCls}
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="Klima, Verkehr"
          />
        </label>

        <details className="rounded border border-grey-200 p-md dark:border-grey-700">
          <summary className="cursor-pointer font-medium">Erweiterte Einstellungen</summary>
          <div className="mt-md flex flex-col gap-md">
            <label className="flex flex-col gap-xs">
              <span className="font-medium">Modell</span>
              <input
                type="text"
                className={inputCls}
                value={form.model}
                onChange={(e) => set('model', e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-xs">
              <span className="font-medium">Provider</span>
              <select
                className={inputCls}
                value={form.provider}
                onChange={(e) => set('provider', e.target.value as FormState['provider'])}
              >
                <option value="mistral">Mistral</option>
                <option value="anthropic">Anthropic</option>
                <option value="litellm">LiteLLM</option>
                <option value="regolo">Regolo</option>
              </select>
            </label>
            <div className="flex gap-md">
              <label className="flex flex-1 flex-col gap-xs">
                <span className="font-medium">Max. Tokens</span>
                <input
                  type="number"
                  className={inputCls}
                  value={form.maxTokens}
                  min={100}
                  max={8000}
                  onChange={(e) => set('maxTokens', Number(e.target.value))}
                />
              </label>
              <label className="flex flex-1 flex-col gap-xs">
                <span className="font-medium">Temperatur</span>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={form.temperature}
                  min={0}
                  max={1}
                  onChange={(e) => set('temperature', Number(e.target.value))}
                />
              </label>
            </div>
          </div>
        </details>

        {error && <p className="text-red-600">{error}</p>}

        <div className="flex gap-sm">
          <button
            type="submit"
            className="rounded bg-primary-600 px-md py-sm text-white hover:bg-primary-700 disabled:opacity-50"
            disabled={createMut.isPending || updateMut.isPending}
          >
            {isEdit ? 'Speichern' : 'Erstellen'}
          </button>
          <button
            type="button"
            className="rounded border border-grey-300 px-md py-sm hover:bg-hover-alt dark:border-grey-700"
            onClick={() => void navigate('/skills')}
          >
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
