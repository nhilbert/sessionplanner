/** The windows of one workshop's presentation in this browser, when the server is out of reach (src/slides/follower.ts): { key, n } = show that slide. */
export const presentChannel = (workshopId: string): BroadcastChannel => new BroadcastChannel(`sp-present:${workshopId}`)
