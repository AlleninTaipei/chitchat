"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { type Locale, type Translations, translations } from '@/lib/i18n'

interface LocaleContextValue {
  locale: Locale
  t: Translations
  setLocale: (locale: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh-TW')

  useEffect(() => {
    const saved = localStorage.getItem('chitchat-locale') as Locale | null
    if (saved === 'en' || saved === 'zh-TW') setLocaleState(saved)
  }, [])

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem('chitchat-locale', l)
  }

  return (
    <LocaleContext.Provider value={{ locale, t: translations[locale], setLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
