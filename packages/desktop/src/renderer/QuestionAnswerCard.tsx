import { Check, Send } from 'lucide-react'
import React from 'react'
import type { DesktopQuestionActionError } from './desktop-chat'
import { useLocale } from './useLocale'

export interface QuestionAnswerCardQuestion {
  id: string
  prompt: string
  choices?: string[]
  answered?: boolean
}

interface QuestionAnswerCardProps {
  question: QuestionAnswerCardQuestion
  pendingQuestionId: string | null
  error: DesktopQuestionActionError | null
  onAnswer: (questionId: string, answer: string) => void | Promise<void>
  compact?: boolean
}

const QUESTION_CARD_COPY = {
  en: {
    awaiting: 'Awaiting answer',
    answered: 'Answer sent',
    sending: 'Sending...',
    placeholder: 'Type a response to continue',
    send: 'Send',
  },
  ko: {
    awaiting: '답변 대기 중',
    answered: '답변 전송됨',
    sending: '보내는 중...',
    placeholder: '응답을 입력해 진행하세요',
    send: '전송',
  },
} as const

export function QuestionAnswerCard({
  question,
  pendingQuestionId,
  error,
  onAnswer,
  compact = false,
}: QuestionAnswerCardProps) {
  const { locale } = useLocale()
  const copy = QUESTION_CARD_COPY[locale] ?? QUESTION_CARD_COPY.en
  const [draft, setDraft] = React.useState('')
  const pending = pendingQuestionId === question.id
  const answered = question.answered === true
  const errorMessage = error?.questionId === question.id ? error.message : null

  React.useEffect(() => {
    if (answered) {
      setDraft('')
    }
  }, [answered])

  const submitAnswer = React.useCallback((answer: string) => {
    const trimmedAnswer = answer.trim()
    if (!trimmedAnswer || pending || answered) {
      return
    }
    void onAnswer(question.id, trimmedAnswer)
  }, [answered, onAnswer, pending, question.id])

  return (
    <article className={`question-answer-card${compact ? ' compact' : ''}`}>
      <div className="question-answer-head">
        <span className={answered ? 'question-answer-state answered' : 'question-answer-state'}>
          {answered ? <Check className="shell-icon" /> : null}
          {answered ? copy.answered : copy.awaiting}
        </span>
        <strong>{question.prompt}</strong>
      </div>
      {errorMessage ? (
        <p className="question-answer-error" role="alert">{errorMessage}</p>
      ) : null}
      {question.choices?.length ? (
        <div className="question-answer-choices">
          {question.choices.map((choice) => (
            <button
              key={`${question.id}:${choice}`}
              type="button"
              className="question-answer-choice"
              disabled={pending || answered}
              onClick={() => submitAnswer(choice)}
            >
              {pending ? copy.sending : choice}
            </button>
          ))}
        </div>
      ) : answered ? null : (
        <div className="question-answer-row">
          <input
            type="text"
            className="question-answer-input"
            value={draft}
            disabled={pending}
            placeholder={copy.placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') {
                return
              }
              event.preventDefault()
              submitAnswer(draft)
            }}
          />
          <button
            type="button"
            className="question-answer-submit"
            disabled={pending || !draft.trim()}
            onClick={() => submitAnswer(draft)}
          >
            <Send className="shell-icon" />
            <span>{pending ? copy.sending : copy.send}</span>
          </button>
        </div>
      )}
    </article>
  )
}
