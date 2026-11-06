import type { ReactNode } from 'react'

/** What a build can switch off or add in the app (src/start.tsx). Set once, before anything is shown. */
let workshopSharing = true
let workshopTool: ((workshopId: string) => ReactNode) | undefined
let settingsSection: (() => ReactNode) | undefined
let ownerOnly: ((section: ReactNode) => ReactNode) | undefined
let product = 'Session Planner'

export const setProduct = (name = 'Session Planner'): void => {
  product = name
}

/** What the app calls itself on screen: at the top of the navigation and in the browser's tab. */
export const productName = (): string => product

export const setWorkshopSharing = (on: boolean): void => {
  workshopSharing = on
}

/** Whether a workshop offers sharing by e-mail: a build with its own way of inviting people turns it off. */
export const hasWorkshopSharing = (): boolean => workshopSharing

export const setWorkshopTool = (tool: ((workshopId: string) => ReactNode) | undefined): void => {
  workshopTool = tool
}

/** What a build shows in a workshop's header, or nothing. */
export const workshopToolFor = (workshopId: string): ReactNode => workshopTool?.(workshopId) ?? null

export const setSettingsSection = (section: (() => ReactNode) | undefined): void => {
  settingsSection = section
}

/** What a build shows at the end of the owner's settings, or nothing. */
export const settingsSectionOf = (): ReactNode => settingsSection?.() ?? null

export const setOwnerOnly = (wrap: ((section: ReactNode) => ReactNode) | undefined): void => {
  ownerOnly = wrap
}

/** A part of the app for the real owner alone, as a build wants it shown: one whose owners are not all equal can hold it back. It only shows or hides; refusing is the server's. */
export const ownerOnlyPart = (section: ReactNode): ReactNode => (ownerOnly ? ownerOnly(section) : section)
