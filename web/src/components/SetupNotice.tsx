import { useI18n } from '../i18n/I18nProvider'
import { Alert } from './ui'

export function SetupNotice() {
  const { t } = useI18n()
  return (
    <Alert tone="info">
      <p className="font-semibold">{t('setup.title')}</p>
      <p className="mt-1 text-sky-100/80">{t('setup.body')}</p>
    </Alert>
  )
}
