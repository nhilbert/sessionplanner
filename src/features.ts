/** What a build can switch off in the app (src/start.tsx). Set once, before anything is shown. */
let workshopSharing = true

export const setWorkshopSharing = (on: boolean): void => {
  workshopSharing = on
}

/** Whether a workshop offers sharing by e-mail: a build with its own way of inviting people turns it off. */
export const hasWorkshopSharing = (): boolean => workshopSharing
