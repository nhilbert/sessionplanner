import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { changeLocale } from '@/i18n'
import { Button } from './ui'

export default function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  return (
    <Button variant="ghost" size="sm" title={t('app.otherLanguage')} onClick={() => changeLocale(i18n.language === 'de' ? 'en' : 'de')}>
      <Languages size={14} />
      <span className="hidden sm:inline">{t('app.otherLanguage')}</span>
    </Button>
  )
}
