import { createContext, useContext, useState, type ReactNode } from 'react'

/** Holds a file picked on the home page while the user signs in. Memory only. */
const PendingFileContext = createContext<[File | null, (f: File | null) => void] | null>(null)

export function PendingFileProvider({ children }: { children: ReactNode }) {
  const state = useState<File | null>(null)
  return <PendingFileContext.Provider value={state}>{children}</PendingFileContext.Provider>
}

export function usePendingFile() {
  const ctx = useContext(PendingFileContext)
  if (!ctx) throw new Error('usePendingFile must be used inside PendingFileProvider')
  return ctx
}
