import { localName } from '@/domain/addresses'

/** The windows of one workshop's presentation in this browser, when the server is out of reach (src/slides/follower.ts): { key, n, stage } = show that slide at that stage of its build. */
export const presentChannel = (workshopId: string): BroadcastChannel => new BroadcastChannel(localName(`sp-present:${workshopId}`))
