import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { I18nProvider } from '../i18n/I18nProvider'
import { PendingFileProvider } from '../lib/pendingFile'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('renders the Hebrew RTL landing page', () => {
    render(
      <I18nProvider>
        <AuthProvider>
          <PendingFileProvider>
            <MemoryRouter>
              <HomePage />
            </MemoryRouter>
          </PendingFileProvider>
        </AuthProvider>
      </I18nProvider>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('הופכים כל שיר לקריוקי')
    expect(screen.getByRole('link', { name: 'העלה שיר' })).toHaveAttribute('href', '/upload')
    expect(screen.getByText('גררו לכאן קובץ שמע')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(3)
    expect(document.documentElement.dir).toBe('rtl')
  })
})
