import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  Block,
  BlockSize,
  FrameFillMode,
  ImageSnapPoint,
  MediaFit,
  MediaRadius,
  MediaWidth,
} from '../types'
import {
  sampleEdgeStrips,
  sampleEdgeStripsFromElement,
  sampleEdgeStripsFromVideo,
  type EdgeStripPair,
} from '../lib/edgeStrips'
import { usePrefs } from '../lib/prefs'

type Props = {
  block: Block
  assetUrl: (src: string) => string
  onOpenLink?: (url: string) => void
  /** When true (present mode), link clicks open URL. Edit mode only selects. */
  openLinks?: boolean
  playing?: boolean
  /** Edit mode: show snap cues and allow dragging image snap points. */
  editable?: boolean
  onSnapPointsChange?: (points: ImageSnapPoint[]) => void
  frameFill?: FrameFillMode
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function mediaWidthClass(width?: MediaWidth): string {
  if (!width || width === 'full') return ''
  return ` media-w-${width}`
}

function mediaRadiusClass(radius?: MediaRadius): string {
  if (!radius || radius === 'none') return ''
  return ` media-r-${radius}`
}

function mediaFitClass(fit?: MediaFit): string {
  if (!fit || fit === 'natural') return ''
  return ` media-fit-${fit}`
}

function textSizeClass(size: BlockSize | undefined, variant: 'heading' | 'body'): string {
  const resolved = size ?? (variant === 'heading' ? 'lg' : 'md')
  return ` size-${resolved}`
}

function linkSizeClass(size?: BlockSize): string {
  return ` size-${size ?? 'md'}`
}

function MediaFrame({
  url,
  kind,
  rot,
  mediaStyle,
  snaps,
  editable,
  playing,
  frameFill,
  asGif,
  loop,
  playbackRate,
  muted: mutedProp,
  showControls: showControlsProp,
  onSnapPointsChange,
}: {
  url: string
  kind: 'image' | 'video'
  rot: number
  mediaStyle: { transform: string; transformOrigin: string } | undefined
  snaps: ImageSnapPoint[]
  editable: boolean
  playing: boolean
  frameFill: FrameFillMode
  /** Explicit per-block GIF mode; undefined follows app default */
  asGif?: boolean
  loop?: boolean
  playbackRate?: number
  muted?: boolean
  showControls?: boolean
  onSnapPointsChange?: (points: ImageSnapPoint[]) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [strips, setStrips] = useState<EdgeStripPair | null>(null)
  /** Editor preview: click toggles play/pause for videos */
  const [previewOn, setPreviewOn] = useState(true)
  const expand = frameFill === 'expand'
  const ambient = frameFill === 'ambient'
  const { videosAsGif, mutePresentVideos } = usePrefs()

  const gifMode = kind === 'video' && (asGif ?? videosAsGif)
  const presentMode = playing && !editable
  const loopVideo = loop ?? true
  const rate = playbackRate ?? 1
  const muted =
    mutedProp ?? (gifMode ? true : presentMode ? mutePresentVideos : true)
  // Per-video default: controls on (GIF mode always hides them)
  const showControls =
    kind === 'video' && presentMode && !gifMode && (showControlsProp ?? true)
  const autoPlay = kind === 'video' && (gifMode || presentMode)
  /** In the editor, preview plays unless the user clicked to pause */
  const wantVideoPlay = editable ? previewOn : autoPlay
  const canTogglePreview = editable && kind === 'video'

  useEffect(() => {
    setPreviewOn(true)
  }, [url])

  useEffect(() => {
    if (!expand) {
      setStrips(null)
      return
    }
    let cancelled = false

    if (kind === 'image') {
      const apply = (pair: EdgeStripPair | null) => {
        if (!cancelled && pair) setStrips(pair)
      }

      void sampleEdgeStrips(url).then(apply)

      const img = imgRef.current
      if (img?.complete && img.naturalWidth > 0) {
        apply(sampleEdgeStripsFromElement(img))
      }

      return () => {
        cancelled = true
      }
    }

    const video = videoRef.current
    if (!video) return
    const sample = () => {
      const pair = sampleEdgeStripsFromVideo(video)
      if (!cancelled && pair) setStrips(pair)
    }
    if (video.readyState >= 2) sample()
    video.addEventListener('loadeddata', sample)
    video.addEventListener('seeked', sample)
    video.addEventListener('pause', sample)
    return () => {
      cancelled = true
      video.removeEventListener('loadeddata', sample)
      video.removeEventListener('seeked', sample)
      video.removeEventListener('pause', sample)
    }
  }, [expand, kind, url])

  const onCuePointerDown = (e: ReactPointerEvent, snapId: string) => {
    if (!editable || !onSnapPointsChange) return
    e.preventDefault()
    e.stopPropagation()
    const frame = frameRef.current
    if (!frame) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent) => {
      const rect = frame.getBoundingClientRect()
      if (rect.height <= 0) return
      const y = clamp01((ev.clientY - rect.top) / rect.height)
      onSnapPointsChange(
        snaps.map((s) => (s.id === snapId ? { ...s, y } : s)),
      )
    }
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const onImgLoad = () => {
    if (!expand) return
    const img = imgRef.current
    if (!img) return
    const pair = sampleEdgeStripsFromElement(img)
    if (pair) setStrips(pair)
    else void sampleEdgeStrips(url).then((p) => p && setStrips(p))
  }

  useEffect(() => {
    if (kind !== 'video') return
    const el = videoRef.current
    if (!el) return
    el.muted = muted
    el.loop = loopVideo
    el.playbackRate = rate
    if (wantVideoPlay) {
      void el.play().catch(() => {
        /* autoplay may be blocked until gesture — muted usually ok */
      })
    } else {
      el.pause()
    }
  }, [kind, url, muted, wantVideoPlay, loopVideo, rate])

  const togglePreview = () => {
    if (!canTogglePreview) return
    setPreviewOn((v) => !v)
  }

  const media =
    kind === 'video' ? (
      <video
        ref={videoRef}
        className={`block-media${gifMode || !showControls ? ' is-gif' : ''}${canTogglePreview ? ' is-preview-toggle' : ''}${editable && !previewOn ? ' is-paused' : ''}`}
        src={url}
        controls={showControls}
        autoPlay={wantVideoPlay}
        loop={loopVideo}
        muted={muted}
        playsInline
        preload="auto"
        disablePictureInPicture
        style={mediaStyle}
      />
    ) : (
      <img
        ref={imgRef}
        className="block-media"
        src={url}
        alt=""
        draggable={false}
        style={mediaStyle}
        onLoad={onImgLoad}
      />
    )

  const snapEls = snaps.map((sp) => (
    <div
      key={sp.id}
      data-present-snap
      className={`snap-cue${editable ? ' is-edit' : ''}`}
      style={{ top: `${clamp01(sp.y) * 100}%` }}
      title={sp.label || 'Snap point'}
      onPointerDown={(e) => onCuePointerDown(e, sp.id)}
      onDragStart={(e) => e.preventDefault()}
    >
      {editable && (
        <span className="snap-cue-label">{sp.label?.trim() || 'Snap'}</span>
      )}
    </div>
  ))

  const frame = (
    <div
      ref={frameRef}
      className={`block-media-frame${rot === 90 || rot === 270 ? ' rotated-ortho' : ''}${canTogglePreview ? ' is-editable-preview' : ''}`}
      onClick={canTogglePreview ? togglePreview : undefined}
      title={
        canTogglePreview
          ? previewOn
            ? 'Click to pause preview'
            : 'Click to play preview'
          : undefined
      }
    >
      {media}
      {canTogglePreview && !previewOn && (
        <span className="media-preview-badge" aria-hidden>
          Paused
        </span>
      )}
      {snapEls}
    </div>
  )

  if (expand) {
    return (
      <div className={`block-expand-shell${strips ? ' has-strips' : ''}`}>
        <div className="block-edge-strip left" aria-hidden>
          {strips && <img src={strips.left} alt="" draggable={false} />}
        </div>
        {frame}
        <div className="block-edge-strip right" aria-hidden>
          {strips && <img src={strips.right} alt="" draggable={false} />}
        </div>
      </div>
    )
  }

  if (ambient) {
    const glowMedia =
      kind === 'video' ? (
        <video
          className="block-ambient-glow"
          src={url}
          muted
          loop={loopVideo}
          playsInline
          autoPlay={wantVideoPlay}
          preload="auto"
          aria-hidden
        />
      ) : (
        <img
          className="block-ambient-glow"
          src={url}
          alt=""
          draggable={false}
          aria-hidden
        />
      )
    return (
      <div className="block-ambient-shell">
        <div className="block-ambient-backdrop" aria-hidden>
          {glowMedia}
        </div>
        {frame}
      </div>
    )
  }

  return frame
}

export function BlockView({
  block,
  assetUrl,
  onOpenLink,
  openLinks = false,
  playing = true,
  editable = false,
  onSnapPointsChange,
  frameFill = 'contained',
}: Props) {
  if (block.type === 'image') {
    const url = assetUrl(block.src)
    const rot = ((block.rotate ?? 0) % 360 + 360) % 360
    const mediaStyle =
      rot !== 0
        ? ({ transform: `rotate(${rot}deg)`, transformOrigin: 'center center' } as const)
        : undefined
    const shellClass = `block-media-shell${mediaWidthClass(block.width)}${mediaRadiusClass(block.radius)}${mediaFitClass(block.fit)}`

    return (
      <div className={shellClass}>
        <MediaFrame
          url={url}
          kind={block.kind}
          rot={rot}
          mediaStyle={mediaStyle}
          snaps={block.snapPoints ?? []}
          editable={editable}
          playing={playing}
          frameFill={frameFill}
          asGif={block.kind === 'video' ? block.asGif : undefined}
          loop={block.kind === 'video' ? block.loop : undefined}
          playbackRate={block.kind === 'video' ? block.playbackRate : undefined}
          muted={block.kind === 'video' ? block.muted : undefined}
          showControls={block.kind === 'video' ? block.showControls : undefined}
          onSnapPointsChange={onSnapPointsChange}
        />
      </div>
    )
  }

  if (block.type === 'text') {
    const Tag = block.variant === 'heading' ? 'h2' : 'p'
    return (
      <Tag
        className={`block-text block-text-${block.variant}${textSizeClass(block.size, block.variant)}`}
        style={{ textAlign: block.align }}
      >
        {block.content || (block.variant === 'heading' ? 'Heading' : 'Body text')}
      </Tag>
    )
  }

  if (block.type === 'link') {
    const align = block.align ?? 'left'
    const linkClass = `block-link${linkSizeClass(block.size)}`
    if (openLinks) {
      return (
        <button
          type="button"
          className={linkClass}
          style={{ alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start', textAlign: align }}
          onClick={(e) => {
            e.stopPropagation()
            if (block.url) onOpenLink?.(block.url)
          }}
        >
          {block.label || 'Link'}
          <span className="block-link-url">{block.url || 'https://…'}</span>
        </button>
      )
    }
    return (
      <div
        className={`${linkClass} block-link-static`}
        style={{ alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start', textAlign: align }}
      >
        {block.label || 'Link'}
        <span className="block-link-url">{block.url || 'https://…'}</span>
      </div>
    )
  }

  if (block.type === 'spacer') {
    return <div className="block-spacer" style={{ height: block.height }} />
  }

  if (block.type === 'marker') {
    return (
      <div
        data-present-snap
        className={`block-marker${editable ? ' is-edit' : ' is-present'}`}
        aria-hidden={!editable}
      >
        {editable && (
          <span className="block-marker-label">{block.label?.trim() || 'Snap marker'}</span>
        )}
      </div>
    )
  }

  return null
}
