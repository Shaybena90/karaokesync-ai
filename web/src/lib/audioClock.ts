/**
 * Reads the playback position from the real audio element.
 *
 * `audio.currentTime` is the only source of truth. Some browsers (notably
 * Safari) update it in coarse steps while playing; between two updates we
 * extrapolate from the LAST value the element reported, never more than
 * MAX_EXTRAPOLATION_MS ahead. Any seek, pause or stall re-anchors immediately
 * because the next reading differs from the anchor or the element is paused.
 */

export interface MediaLike {
  currentTime: number
  paused: boolean
  playbackRate: number
  seeking?: boolean
  readyState?: number
}

const MAX_EXTRAPOLATION_MS = 250
const HAVE_FUTURE_DATA = 3

export class AudioClock {
  private anchorMedia = -1
  private anchorPerf = 0
  private media: MediaLike
  private nowPerf: () => number

  constructor(media: MediaLike, nowPerf: () => number = () => performance.now()) {
    this.media = media
    this.nowPerf = nowPerf
  }

  /** Current playback position in milliseconds. */
  nowMs(): number {
    const mediaMs = this.media.currentTime * 1000
    const perf = this.nowPerf()
    const stalled = (this.media.readyState ?? HAVE_FUTURE_DATA) < HAVE_FUTURE_DATA
    if (this.media.paused || this.media.seeking || stalled || mediaMs !== this.anchorMedia) {
      this.anchorMedia = mediaMs
      this.anchorPerf = perf
      return mediaMs
    }
    const elapsed = (perf - this.anchorPerf) * this.media.playbackRate
    return mediaMs + Math.min(Math.max(elapsed, 0), MAX_EXTRAPOLATION_MS)
  }

  /** Forget the anchor (call after an explicit seek). */
  reset(): void {
    this.anchorMedia = -1
  }
}
