import i18next, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import koCommon from './locales/ko/common.json'
import enCommon from './locales/en/common.json'

export interface InitInput {
  locale: 'ko' | 'en'
}

export async function initI18n(input: InitInput): Promise<I18n> {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: input.locale,
    fallbackLng: 'en',
    ns: ['common'],
    defaultNS: 'common',
    resources: {
      ko: { common: koCommon },
      en: { common: enCommon },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  return instance
}
