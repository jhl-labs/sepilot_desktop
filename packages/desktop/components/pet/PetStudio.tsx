'use client'
import { useEffect, useState } from 'react'
import type { PetAssistantActions } from '@/lib/pet/assistant'
import { Palette, MessageCircle, Sparkles, Bell, Check, RotateCcw, Upload } from 'lucide-react'
import styles from './PetStudio.module.css'
import { Button } from '@/components/ui/button'
import { getDesktopPlatform } from '@/lib/electron/bridge'
import {
  DEFAULT_PET,
  normalizePet,
  PET_COLORS,
  PET_MOODS,
  type PetConfig,
  type PetMood,
} from '@/lib/pet/model'
import { readPetImage } from '@/lib/pet/image'
import { PetAvatar } from './PetAvatar'
import { PetChat } from './PetChat'

const LABELS: Record<PetMood, string> = {
  idle: '기본',
  working: '작업 중',
  waiting: '확인 대기',
  happy: '실행 종료',
  sleeping: '휴식',
}
export function PetStudio({
  config,
  save,
  actions,
  initialTab = 'design',
  chatDraft,
  onChatDraftChange,
  replyTitle,
  onNewRequest,
}: {
  config: PetConfig
  save: (config: PetConfig) => boolean
  actions?: PetAssistantActions
  initialTab?: 'design' | 'chat'
  chatDraft: string
  onChatDraftChange: (value: string) => void
  replyTitle?: string
  onNewRequest?: () => void
}) {
  const [tab, setTab] = useState<string>(initialTab)
  useEffect(() => setTab(initialTab), [initialTab])
  const [draft, setDraft] = useState(config)
  const [mood, setMood] = useState<PetMood>('idle')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  function update(patch: Partial<PetConfig>) {
    setDraft((previous) => ({ ...previous, ...patch }))
    setNotice('')
  }
  const [useCustom, setUseCustom] = useState(Object.keys(config.images).length > 0)
  const preview = useCustom ? draft : { ...draft, images: {} }
  const dirty = JSON.stringify(preview) !== JSON.stringify(config)
  const inputClass = 'w-full rounded-md border bg-background px-2 py-1.5 text-sm'
  return (
    <div className={styles.root}>
      <nav aria-label="펫 설정" className="mb-4 flex gap-1">
        {(
          [
            ['design', '외형', Palette],
            ['persona', '성격', Sparkles],
            ['reactions', '반응', Bell],
            ['chat', '대화', MessageCircle],
          ] as const
        ).map(([id, label, Icon]) => (
          <Button
            key={id}
            aria-pressed={tab === id}
            variant={tab === id ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTab(id)}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </Button>
        ))}
      </nav>
      {tab === 'chat' ? (
        <div className={styles.chat}>
          {dirty && (
            <p className="mb-3 text-xs text-muted-foreground">
              대화에는 저장된 성격이 적용됩니다. 편집한 설정은 아래에서 저장해 주세요.
            </p>
          )}
          <PetChat
            config={config}
            actions={actions}
            input={chatDraft}
            onInputChange={onChatDraftChange}
            replyTitle={replyTitle}
            onNewRequest={onNewRequest}
          />
        </div>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.preview} aria-label="펫 미리보기">
            <span className={styles.eyebrow}>LIVE PREVIEW · {LABELS[mood]}</span>
            <div className={styles.previewBubble}>
              {mood === 'sleeping'
                ? '잠깐 쉬고 있어요…'
                : draft.phrases[mood] || '이 상태의 반응 문구를 입력해 보세요.'}
            </div>
            <div className={styles.stage}>
              <div
                style={{ width: draft.size, height: draft.size }}
                className={styles.avatar}
                data-motion={draft.motion}
              >
                <PetAvatar config={preview} mood={mood} />
              </div>
            </div>
            <strong>{draft.name || '이름 없는 펫'}</strong>
            <span className="text-xs text-muted-foreground">
              {draft.size}px · {useCustom ? '커스텀 외형' : '기본 캐릭터'}
            </span>
            <div className={styles.states} aria-label="미리보기 상태">
              {PET_MOODS.map((state) => (
                <button
                  key={state}
                  type="button"
                  aria-pressed={state === mood}
                  onClick={() => setMood(state)}
                >
                  {LABELS[state]}
                  {draft.images[state] && <span aria-label="이미지 등록됨"> ·</span>}
                </button>
              ))}
            </div>
            <label className={styles.toggle}>
              <span>
                펫 표시<small>다른 창 위에서 함께해요</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="펫 표시"
                checked={draft.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
              />
            </label>
          </aside>
          <div className={styles.editor}>
            <label className="block text-xs">
              이름
              <input
                className={inputClass}
                maxLength={32}
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            {tab === 'design' ? (
              <>
                <h3 className={styles.heading}>함께할 친구를 골라보세요</h3>
                <div className={styles.characters}>
                  {(['cat', 'fox', 'robot'] as const).map((species, i) => (
                    <Button
                      size="sm"
                      key={species}
                      variant={!useCustom && draft.species === species ? 'secondary' : 'outline'}
                      aria-pressed={!useCustom && draft.species === species}
                      className={styles.character}
                      onClick={() => {
                        update({ species, color: PET_COLORS[species] })
                        setUseCustom(false)
                      }}
                    >
                      <span style={{ width: 54, height: 54 }}>
                        <PetAvatar
                          config={{ ...draft, species, color: PET_COLORS[species], images: {} }}
                          mood="idle"
                        />
                      </span>
                      {['고양이', '여우', '로봇'][i]}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  데스크톱에서는 항상 위에 표시됩니다. 손잡이로 이동하고 ⚙ 또는 우클릭으로 설정을 열
                  수 있어요. 외형 변경은 저장 후 실제 펫에 적용됩니다.
                </p>
                {Object.keys(draft.images).length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-pressed={useCustom}
                    onClick={() => setUseCustom(true)}
                  >
                    등록한 커스텀 외형 사용
                  </Button>
                )}
                {!useCustom && Object.keys(draft.images).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    기본 캐릭터로 저장하면 등록한 이미지를 제거합니다. 유지하려면 커스텀 외형을 다시
                    선택하세요.
                  </p>
                )}
                <div className={styles.swatches} aria-label="추천 색상">
                  {['#93c5fd', '#c4b5fd', '#f9a8d4', '#fdba74', '#86efac', '#cbd5e1'].map(
                    (color) => (
                      <button
                        type="button"
                        key={color}
                        aria-label={`색상 ${color}`}
                        aria-pressed={draft.color === color}
                        style={{ backgroundColor: color }}
                        onClick={() => update({ color })}
                      >
                        {draft.color === color && <Check size={16} />}
                      </button>
                    ),
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <label className="text-xs">
                    색상{' '}
                    <input
                      aria-label="펫 색상"
                      type="color"
                      value={draft.color}
                      onChange={(e) => update({ color: e.target.value })}
                    />
                  </label>
                  <label className="flex-1 text-xs">
                    크기 · {draft.size}px
                    <input
                      className="w-full"
                      type="range"
                      min="64"
                      max="144"
                      value={draft.size}
                      onChange={(e) => update({ size: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.motion}
                    onChange={(e) => update({ motion: e.target.checked })}
                  />
                  움직임 표시 (시스템 동작 줄이기 우선)
                </label>
                <div className="space-y-2 rounded-lg border p-3">
                  <label className="block text-xs">
                    커스텀 외형 상태
                    <select
                      className={inputClass}
                      value={mood}
                      onChange={(e) => setMood(e.target.value as PetMood)}
                    >
                      {PET_MOODS.map((m) => (
                        <option key={m} value={m}>
                          {LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs">
                    <span className={styles.upload}>
                      <Upload size={18} aria-hidden="true" />
                      <strong>
                        {loading ? '이미지 처리 중…' : `${LABELS[mood]} 이미지 업로드`}
                      </strong>
                      <span>PNG · JPEG · WebP 파일 선택</span>
                    </span>
                    <input
                      className="sr-only"
                      aria-label="이미지 업로드"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={loading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        setLoading(true)
                        try {
                          const image = await readPetImage(file)
                          setUseCustom(true)
                          setDraft((previous) => ({
                            ...previous,
                            images: { ...previous.images, [mood]: image },
                          }))
                          setNotice('이미지를 적용했습니다. 저장하면 펫에 반영됩니다.')
                        } catch (error) {
                          setNotice(error instanceof Error ? error.message : '이미지 처리 실패')
                        } finally {
                          setLoading(false)
                        }
                      }}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    투명 PNG 권장 · 최대 5MB · 256px로 최적화. 상태별 이미지가 없으면 기본 이미지를
                    사용합니다.
                  </p>
                  {draft.images[mood] && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const images = { ...draft.images }
                        delete images[mood]
                        update({ images })
                      }}
                    >
                      이 상태 이미지 지우기
                    </Button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={getDesktopPlatform() !== null}
                  onClick={() => update({ position: DEFAULT_PET.position })}
                >
                  {getDesktopPlatform() ? '위치 초기화는 펫 우클릭 메뉴에서' : '위치 초기화'}
                </Button>
              </>
            ) : tab === 'persona' ? (
              <>
                <h3 className={styles.heading}>어떤 성격의 친구인가요?</h3>
                <p className="text-xs text-muted-foreground">
                  말투와 응답 방식을 적으면 펫 전용 AI 대화에 반영됩니다.
                </p>
                <label className="block text-xs">
                  페르소나
                  <textarea
                    aria-label="페르소나"
                    className={inputClass}
                    rows={5}
                    maxLength={4000}
                    value={draft.persona}
                    onChange={(e) => update({ persona: e.target.value })}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  말투, 성격, 좋아하는 것, 응답 방식을 자유롭게 적어주세요. 저장 후 펫 대화에
                  반영됩니다.
                </p>
                <p className="text-right text-xs text-muted-foreground">
                  {draft.persona.length.toLocaleString()} / 4,000
                </p>
              </>
            ) : (
              <>
                <h3 className={styles.heading}>상황에 맞는 한마디</h3>
                <p className="text-xs text-muted-foreground">
                  종료·승인 대기 문구는 자동 알림에 쓰입니다. 작업 알림은 도착한 제목과 내용을
                  표시합니다.
                </p>
                {(['idle', 'working', 'waiting', 'happy'] as const).map((m) => (
                  <label key={m} className="block text-xs">
                    {LABELS[m]} 반응 문구
                    <input
                      className={inputClass}
                      maxLength={160}
                      value={draft.phrases[m]}
                      onFocus={() => setMood(m)}
                      onChange={(e) =>
                        update({ phrases: { ...draft.phrases, [m]: e.target.value } })
                      }
                    />
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  상태 문구는 직접 정한 문구이며 작업 성공 판정이 아닙니다.
                </p>
              </>
            )}
          </div>
        </div>
      )}
      <footer className={styles.footer}>
        <span className="text-xs text-muted-foreground">
          {loading ? '이미지 처리 중…' : dirty ? '저장하지 않은 변경사항' : '모든 변경사항 저장됨'}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={loading || (!dirty && useCustom === Object.keys(config.images).length > 0)}
            onClick={() => {
              setDraft(config)
              setUseCustom(Object.keys(config.images).length > 0)
              setNotice('변경사항을 되돌렸습니다.')
            }}
          >
            <RotateCcw size={14} />
            변경 취소
          </Button>
          <Button
            size="sm"
            disabled={loading}
            onClick={() => {
              const next = normalizePet(preview)
              if (save(next)) {
                setDraft(next)
                setUseCustom(Object.keys(next.images).length > 0)
                setNotice('저장했습니다.')
              }
            }}
          >
            <Check size={14} />
            저장
          </Button>
        </div>
      </footer>
      {notice && (
        <p role="status" className="px-1 text-xs">
          {notice}
        </p>
      )}
      <details className={styles.backup}>
        <summary>설정 백업 · 가져오기</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(normalizePet(preview), null, 2)], {
                  type: 'application/json',
                }),
              )
              const a = document.createElement('a')
              a.href = url
              a.download = 'sepilot-pet.json'
              a.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}
          >
            내보내기
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-md border px-3 text-xs focus-within:ring-2 focus-within:ring-ring">
            가져오기
            <input
              aria-label="펫 설정 가져오기"
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  if (file.size > 2_100_000) throw new Error('펫 파일은 최대 2MB입니다.')
                  const next = normalizePet(JSON.parse(await file.text()))
                  setDraft(next)
                  setUseCustom(Object.keys(next.images).length > 0)
                  setNotice('가져왔습니다. 미리보기를 확인한 뒤 저장하세요.')
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : '파일을 불러올 수 없습니다.')
                }
              }}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          설정과 이미지는 이 기기에 저장됩니다. 내보내기 파일에는 외형과 성격이 포함됩니다.
        </p>
      </details>
    </div>
  )
}
