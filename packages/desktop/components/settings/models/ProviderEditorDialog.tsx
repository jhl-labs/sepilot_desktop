'use client'
import { useEffect, useId, useRef } from 'react'
import { DownloadCloud, Plus, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import { cn } from '@/lib/utils/cn'
import {
  addDraftModel,
  PROVIDER_TYPE_SUGGESTIONS,
  providerTypeRequiresApiKey,
  providerTypeSupportsDiscovery,
  type ProviderDraft,
} from './model-settings-view'

interface ProviderEditorDialogProps {
  draft: ProviderDraft
  busy: boolean
  discovering: boolean
  purpose?: 'settings' | 'setup'
  validationModel?: string
  onChange(draft: ProviderDraft): void
  onValidationModelChange?(modelId: string): void
  onClose(): void
  onSave(): void
  onDiscover(): void
}

export function ProviderEditorDialog({
  draft,
  busy,
  discovering,
  purpose = 'settings',
  validationModel = '',
  onChange,
  onValidationModelChange,
  onClose,
  onSave,
  onDiscover,
}: ProviderEditorDialogProps) {
  useModalViewportLock(true)
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(busy || discovering)
  const closeRef = useRef(onClose)

  busyRef.current = busy || discovering
  closeRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const first =
      dialog?.querySelector<HTMLElement>('input:not([disabled])') ??
      dialog?.querySelector<HTMLElement>('button:not([disabled])')
    requestAnimationFrame(() => first?.focus())

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!busyRef.current) closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, select:not([disabled])',
        ),
      )
      if (focusable.length === 0) return
      const firstFocusable = focusable[0]
      const lastFocusable = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault()
        lastFocusable.focus()
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault()
        firstFocusable.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [])

  const apiKeyRequired = providerTypeRequiresApiKey(draft.type)
  const canDiscover = providerTypeSupportsDiscovery(draft.type)
  const isSetup = purpose === 'setup'

  function addModel() {
    onChange(addDraftModel(draft))
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 backdrop-blur-sm',
        isSetup ? 'p-4' : 'p-3',
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && !discovering) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-density={isSetup ? 'comfortable' : 'compact'}
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden border border-border bg-background shadow-2xl',
          isSetup ? 'rounded-xl' : 'rounded-lg',
        )}
      >
        <header
          className={cn(
            'flex shrink-0 items-start border-b border-border',
            isSetup ? 'gap-3 px-5 py-4' : 'gap-2 px-4 py-3',
          )}
        >
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-sm font-semibold">
              {isSetup && draft.isNew
                ? '새 AI Provider 연결'
                : draft.isNew
                  ? 'Provider 연결 추가'
                  : `${draft.id} 설정`}
            </h3>
            <p id={descriptionId} className="mt-1 text-xs text-muted-foreground">
              {isSetup
                ? '모델을 가져오고 실제 연결을 확인한 뒤 daemon 설정에 저장합니다.'
                : '연결 정보와 모델을 설정합니다. 비밀값은 daemon에 저장되며 다시 표시되지 않습니다.'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            disabled={busy || discovering}
            aria-label="Provider 편집 닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div
          role="region"
          aria-label="Provider 연결 설정"
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
            isSetup ? 'space-y-5 px-5 py-4' : 'space-y-3 px-4 py-3',
          )}
        >
          <section
            aria-labelledby={`${titleId}-connection`}
            className={isSetup ? 'space-y-3' : 'space-y-2'}
          >
            <div>
              <h4
                id={`${titleId}-connection`}
                className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                연결 정보
              </h4>
              <p className="mt-1 text-[11px] text-muted-foreground">
                저장된 ID는 자격증명과 참조 무결성의 기준이므로 변경할 수 없습니다.
              </p>
            </div>
            <div className={cn('grid md:grid-cols-2', isSetup ? 'gap-3' : 'gap-2')}>
              <label className="space-y-1 text-xs" htmlFor={`${titleId}-id`}>
                <span className="font-medium">Provider ID</span>
                <Input
                  id={`${titleId}-id`}
                  value={draft.id}
                  onChange={(event) => onChange({ ...draft, id: event.target.value })}
                  placeholder="예: openai-main"
                  disabled={busy || discovering || !draft.isNew}
                  required
                  aria-describedby={!draft.isNew ? `${titleId}-id-hint` : undefined}
                />
                {!draft.isNew ? (
                  <span
                    id={`${titleId}-id-hint`}
                    className="block text-[10px] text-muted-foreground"
                  >
                    기존 Provider ID는 고정됩니다.
                  </span>
                ) : null}
              </label>
              <label className="space-y-1 text-xs" htmlFor={`${titleId}-type`}>
                <span className="font-medium">Provider 유형</span>
                <Input
                  id={`${titleId}-type`}
                  list={`${titleId}-types`}
                  value={draft.type}
                  onChange={(event) => onChange({ ...draft, type: event.target.value })}
                  placeholder="openai / anthropic / ollama"
                  disabled={busy || discovering}
                  required
                />
                <datalist id={`${titleId}-types`}>
                  {PROVIDER_TYPE_SUGGESTIONS.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </label>
              <label className="space-y-1 text-xs md:col-span-2" htmlFor={`${titleId}-base-url`}>
                <span className="font-medium">
                  Base URL{' '}
                  {draft.type === 'custom' ? (
                    <span className="text-destructive">필수</span>
                  ) : (
                    <span className="text-muted-foreground">선택</span>
                  )}
                </span>
                <Input
                  id={`${titleId}-base-url`}
                  type="url"
                  value={draft.baseUrl}
                  onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })}
                  placeholder={
                    draft.type === 'ollama'
                      ? 'http://localhost:11434'
                      : 'Provider 기본 endpoint 사용'
                  }
                  disabled={busy || discovering}
                  required={draft.type === 'custom'}
                />
              </label>
              <label className="space-y-1 text-xs md:col-span-2" htmlFor={`${titleId}-api-key`}>
                <span className="font-medium">
                  API Key{' '}
                  {apiKeyRequired ? (
                    <span className="text-destructive">필수</span>
                  ) : (
                    <span className="text-muted-foreground">선택</span>
                  )}
                </span>
                <Input
                  id={`${titleId}-api-key`}
                  type="password"
                  autoComplete="new-password"
                  value={draft.apiKey}
                  onChange={(event) => onChange({ ...draft, apiKey: event.target.value })}
                  placeholder={draft.apiKeyStored ? '저장된 API Key 유지' : '새 API Key 입력'}
                  disabled={busy || discovering}
                  required={apiKeyRequired && !draft.apiKeyStored}
                />
              </label>
            </div>
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] text-[11px] text-muted-foreground',
                isSetup ? 'px-3 py-2.5 leading-5' : 'px-2.5 py-2 leading-4',
              )}
            >
              <ShieldCheck
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300"
                aria-hidden="true"
              />
              <span>
                API Key는 브라우저 저장소에 보관하지 않습니다. 저장 후에는 daemon이 비밀값을 가려서
                반환합니다.
              </span>
            </div>
          </section>

          <section
            aria-labelledby={`${titleId}-models`}
            className={cn(
              'border-t border-border',
              isSetup ? 'space-y-3 pt-4' : 'space-y-2 pt-3',
            )}
          >
            <div className={cn('flex items-start justify-between', isSetup ? 'gap-3' : 'gap-2')}>
              <div>
                <h4
                  id={`${titleId}-models`}
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  사용 모델
                </h4>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isSetup
                    ? '연결 확인에 사용할 모델을 하나 이상 가져오거나 직접 추가하세요.'
                    : '비어 있는 provider도 저장할 수 있지만 채팅에는 준비되지 않은 상태로 표시됩니다.'}
                </p>
              </div>
              {canDiscover ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onDiscover}
                  disabled={busy || discovering}
                >
                  <DownloadCloud className="h-3.5 w-3.5" />
                  {discovering ? '가져오는 중…' : '모델 가져오기'}
                </Button>
              ) : null}
            </div>
            {draft.models.length > 0 ? (
              <ul
                className={cn(
                  'flex flex-wrap gap-1.5 overflow-y-auto rounded-md border border-border',
                  isSetup ? 'max-h-44 p-2' : 'max-h-36 p-1.5',
                )}
                aria-label="구성된 모델"
              >
                {draft.models.map((model) => (
                  <li
                    key={model}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono text-[11px]"
                  >
                    <span>{model}</span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...draft,
                          models: draft.models.filter((item) => item !== model),
                        })
                      }
                      className="inline-grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`${model} 제거`}
                      disabled={busy || discovering}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                아직 모델이 없습니다. 자동으로 가져오거나 모델 ID를 직접 추가하세요.
              </div>
            )}
            {isSetup && draft.models.length > 0 ? (
              <label className="block space-y-1.5 text-xs" htmlFor={`${titleId}-validation-model`}>
                <span className="font-semibold">연결 확인 모델</span>
                <select
                  id={`${titleId}-validation-model`}
                  className={cn(
                    'w-full rounded-md border border-border bg-background px-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    isSetup ? 'h-9' : 'h-8',
                  )}
                  value={validationModel}
                  onChange={(event) => onValidationModelChange?.(event.target.value)}
                  disabled={busy || discovering}
                  required
                >
                  <option value="">채팅 응답이 가능한 모델을 선택하세요</option>
                  {draft.models.map((modelId) => (
                    <option key={modelId} value={modelId}>
                      {modelId}
                    </option>
                  ))}
                </select>
                <span className="block text-[10px] leading-4 text-muted-foreground">
                  저장 전에 이 모델로 실제 응답을 확인합니다.
                </span>
              </label>
            ) : null}
            <div className="flex gap-2">
              <Input
                value={draft.modelInput}
                onChange={(event) => onChange({ ...draft, modelInput: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addModel()
                  }
                }}
                placeholder="모델 ID 입력 (예: gpt-5)"
                aria-label="모델 ID"
                disabled={busy || discovering}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addModel}
                disabled={busy || !draft.modelInput.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                추가
              </Button>
            </div>
          </section>

          <details className="group rounded-lg border border-border">
            <summary
              className={cn(
                'cursor-pointer select-none text-xs font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                isSetup ? 'px-3 py-2.5' : 'px-2.5 py-2',
              )}
            >
              고급 설정
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                헤더 · 토큰 제한 · 기능 · 모델별 설정
              </span>
            </summary>
            <div
              className={cn(
                'border-t border-border',
                isSetup ? 'space-y-4 p-3' : 'space-y-3 p-2.5',
              )}
            >
              <div className={isSetup ? 'space-y-2' : 'space-y-1.5'}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">사용자 지정 헤더</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onChange({
                        ...draft,
                        headers: [...draft.headers, { key: '', value: '', stored: false }],
                      })
                    }
                    disabled={busy || discovering}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    헤더 추가
                  </Button>
                </div>
                {draft.headers.map((header, index) => (
                  <div
                    key={`${header.key}-${index}`}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <Input
                      value={header.key}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          headers: draft.headers.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, key: event.target.value } : item,
                          ),
                        })
                      }
                      placeholder="X-Custom-Header"
                      aria-label={`헤더 ${index + 1} 이름`}
                      disabled={busy || discovering}
                    />
                    <Input
                      type="password"
                      value={header.value}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          headers: draft.headers.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, value: event.target.value } : item,
                          ),
                        })
                      }
                      placeholder={header.stored ? '저장된 값 유지' : '값'}
                      aria-label={`헤더 ${index + 1} 값`}
                      disabled={busy || discovering}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={cn(
                        'justify-self-end sm:justify-self-auto',
                        isSetup ? 'h-9 w-9' : 'h-8 w-8',
                      )}
                      onClick={() =>
                        onChange({
                          ...draft,
                          headers: draft.headers.filter((_, itemIndex) => itemIndex !== index),
                        })
                      }
                      aria-label={`헤더 ${index + 1} 제거`}
                      disabled={busy || discovering}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className={cn('grid md:grid-cols-2', isSetup ? 'gap-3' : 'gap-2')}>
                <label className="space-y-1 text-xs" htmlFor={`${titleId}-context-window`}>
                  <span>기본 컨텍스트 길이</span>
                  <Input
                    id={`${titleId}-context-window`}
                    type="number"
                    min={1}
                    value={draft.defaultContextWindow}
                    onChange={(event) =>
                      onChange({ ...draft, defaultContextWindow: event.target.value })
                    }
                    placeholder="128000"
                    disabled={busy || discovering}
                  />
                </label>
                <label className="space-y-1 text-xs" htmlFor={`${titleId}-max-output`}>
                  <span>기본 최대 출력 토큰</span>
                  <Input
                    id={`${titleId}-max-output`}
                    type="number"
                    min={1}
                    value={draft.defaultMaxOutputTokens}
                    onChange={(event) =>
                      onChange({ ...draft, defaultMaxOutputTokens: event.target.value })
                    }
                    placeholder="8192"
                    disabled={busy || discovering}
                  />
                </label>
              </div>
              {draft.type.trim().toLowerCase() === 'opencode' ? (
                <label
                  className="flex items-start gap-2 text-xs"
                  htmlFor={`${titleId}-disable-default-plugins`}
                >
                  <input
                    id={`${titleId}-disable-default-plugins`}
                    type="checkbox"
                    className="mt-0.5"
                    checked={draft.disableDefaultPlugins}
                    onChange={(event) =>
                      onChange({ ...draft, disableDefaultPlugins: event.target.checked })
                    }
                    disabled={busy || discovering}
                  />
                  <span>
                    OpenCode 기본 플러그인 비활성화
                    <span className="block text-muted-foreground">
                      OPENCODE_DISABLE_DEFAULT_PLUGINS (기본 켜짐). 환경에 따라 기본 플러그인이
                      필요하면 끄세요.
                    </span>
                  </span>
                </label>
              ) : null}
              <label className="block space-y-1 text-xs" htmlFor={`${titleId}-capabilities`}>
                <span>지원 기능 JSON</span>
                <textarea
                  id={`${titleId}-capabilities`}
                  rows={4}
                  value={draft.capabilitiesText}
                  onChange={(event) => onChange({ ...draft, capabilitiesText: event.target.value })}
                  placeholder={'{\n  "toolUse": true,\n  "vision": true\n}'}
                  spellCheck={false}
                  className="w-full rounded-md border border-border bg-transparent p-2 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={busy || discovering}
                />
              </label>
              <label className="block space-y-1 text-xs" htmlFor={`${titleId}-overrides`}>
                <span>모델별 설정 JSON</span>
                <textarea
                  id={`${titleId}-overrides`}
                  rows={5}
                  value={draft.modelOverridesText}
                  onChange={(event) =>
                    onChange({ ...draft, modelOverridesText: event.target.value })
                  }
                  placeholder={
                    '[\n  {\n    "id": "gpt-5-mini",\n    "contextWindow": 128000\n  }\n]'
                  }
                  spellCheck={false}
                  className="w-full rounded-md border border-border bg-transparent p-2 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={busy || discovering}
                />
              </label>
            </div>
          </details>
        </div>

        <footer
          className={cn(
            'flex shrink-0 items-center justify-end gap-2 border-t border-border',
            isSetup ? 'px-5 py-3' : 'px-4 py-2',
          )}
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClose}
            disabled={busy || discovering}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={
              busy ||
              discovering ||
              !draft.id.trim() ||
              !draft.type.trim() ||
              (isSetup && (draft.models.length === 0 || !validationModel))
            }
          >
            {busy
              ? isSetup
                ? '연결 확인 중…'
                : '저장 중…'
              : isSetup
                ? '연결 확인 후 저장'
                : '변경사항 저장'}
          </Button>
        </footer>
      </div>
    </div>
  )
}
