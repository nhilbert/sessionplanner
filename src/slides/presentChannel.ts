/** The presenter view and the presentation window of one workshop talk over this channel: { n } = show slide n (1-based). */
export const presentChannel = (workshopId: string): BroadcastChannel => new BroadcastChannel(`sp-present:${workshopId}`)
