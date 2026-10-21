import { useEffect, useRef } from 'react'
import type {
  Block,
  BlockSize,
  ImageBlock,
  MediaFit,
  MediaRadius,
  MediaWidth,
  TextAlign,
  TextVariant,
} from '../types'
import { uid } from '../lib/ids'
import { usePrefs } from '../lib/prefs'

type Props = {
  block: Block
  index: number
  total: number
  onClose: () => void
  onChange: (patch: Partial<Block>) => void
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRotate?: () => void
}

const SPEEDS = [
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
  { value: 2, label: '2×' },
]

const TEXT_SIZES: { value: BlockSize; label: string }[] = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
  { value: 'xl', label: 'XL' },
]

const MEDIA_WIDTHS: { value: MediaWidth; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'wide', label: '¾' },
  { value: 'half', label: '½' },
  { value: 'narrow', label: '⅓' },
]

const MEDIA_RADII: { value: MediaRadius; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'soft', label: 'Soft' },
  { value: 'round', label: 'Round' },
]

const MEDIA_FITS: { value: MediaFit; label: string }[] = [
  { value: 'natural', label: 'Auto' },
  { value: 'contain', label: 'Fit' },
  { value: 'cover', label: 'Fill' },
]

function SegmentButtons<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div className="fi-segment" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={String(opt.value)}
            type="button"
            className={`fi-segment-btn${active ? ' active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function GapAfterField({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  return (
    <label className="fi-field">
      <span>Gap after</span>
      <input
        type="number"
        min={0}
        max={240}
        value={value ?? ''}
        placeholder="Board default"
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? undefined : Number(v))
        }}
      />
    </label>
  )
}

function titleFor(block: Block): string {
  if (block.type === 'image') {
    if (block.kind === 'video') return block.name || 'Video'
    return block.name || 'Image'
  }
  if (block.type === 'text') return block.variant === 'heading' ? 'Heading' : 'Text'
  if (block.type === 'link') return 'Link'
  if (block.type === 'spacer') return 'Spacer'
  if (block.type === 'marker') return 'Snap'
  return 'Block'
}

export function FrameInspector({
  block,
  index,
  total,
  onClose,
  onChange,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onRotate,
}: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const { videosAsGif } = usePrefs()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    panelRef.current?.focus()
  }, [block.id])

  const patchImage = (patch: Partial<ImageBlock>) => onChange(patch as Partial<Block>)
  const gifOn = block.type === 'image' && block.kind === 'video'
    ? (block.asGif ?? videosAsGif)
    : false

  return (
    <aside
      ref={panelRef}
      className="frame-inspector"
      role="dialog"
      aria-label="Edit frame"
      tabIndex={-1}
    >
      <header className="frame-inspector-head">
        <div className="frame-inspector-titles">
          <h2>Edit</h2>
          <p>{titleFor(block)}</p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >
          ✕
        </button>
      </header>

      <div className="frame-inspector-body hide-scrollbar">
        {block.type === 'image' && block.kind === 'video' && (
          <section className="frame-inspector-section">
            <h3>Playback</h3>
            <label className="fi-row">
              <span>
                <strong>Play like GIF</strong>
                <em>Muted loop, no controls</em>
              </span>
              <input
                type="checkbox"
                checked={gifOn}
                onChange={(e) => patchImage({ asGif: e.target.checked })}
              />
            </label>
            <label className="fi-row">
              <span>
                <strong>Loop</strong>
                <em>Restart when finished</em>
              </span>
              <input
                type="checkbox"
                checked={block.loop ?? true}
                onChange={(e) => patchImage({ loop: e.target.checked })}
              />
            </label>
            <label className="fi-row">
              <span>
                <strong>Mute</strong>
                <em>No audio</em>
              </span>
              <input
                type="checkbox"
                checked={block.muted ?? gifOn}
                onChange={(e) => patchImage({ muted: e.target.checked })}
              />
            </label>
            <label className="fi-row">
              <span>
                <strong>Show controls</strong>
                <em>Play bar while presenting (default on)</em>
              </span>
              <input
                type="checkbox"
                checked={block.showControls ?? true}
                disabled={gifOn}
                onChange={(e) => patchImage({ showControls: e.target.checked })}
              />
            </label>
            <div className="fi-field">
              <span>Speed</span>
              <div className="fi-segment" role="group" aria-label="Playback speed">
                {SPEEDS.map((s) => {
                  const active = (block.playbackRate ?? 1) === s.value
                  return (
                    <button
                      key={s.value}
                      type="button"
                      className={`fi-segment-btn${active ? ' active' : ''}`}
                      aria-pressed={active}
                      onClick={() => patchImage({ playbackRate: s.value })}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {block.type === 'image' && (
          <section className="frame-inspector-section">
            <h3>Layout</h3>
            <div className="fi-field">
              <span>Width</span>
              <SegmentButtons<MediaWidth>
                ariaLabel="Media width"
                value={block.width ?? 'full'}
                onChange={(width) => patchImage({ width })}
                options={MEDIA_WIDTHS}
              />
            </div>
            <div className="fi-field">
              <span>Corners</span>
              <SegmentButtons<MediaRadius>
                ariaLabel="Corner radius"
                value={block.radius ?? 'none'}
                onChange={(radius) => patchImage({ radius })}
                options={MEDIA_RADII}
              />
            </div>
            <div className="fi-field">
              <span>Fit</span>
              <SegmentButtons<MediaFit>
                ariaLabel="Media fit"
                value={block.fit ?? 'natural'}
                onChange={(fit) => patchImage({ fit })}
                options={MEDIA_FITS}
              />
            </div>
            {onRotate && (
              <button type="button" className="btn btn-block" onClick={onRotate}>
                Rotate 90°
              </button>
            )}
            <div className="fi-field">
              <span>Snap points</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  patchImage({
                    snapPoints: [
                      ...(block.snapPoints ?? []),
                      { id: uid(), y: 0.5, label: 'Snap' },
                    ],
                  })
                }
              >
                Add snap
              </button>
              {(block.snapPoints ?? []).length > 0 && (
                <ul className="fi-snap-list">
                  {(block.snapPoints ?? []).map((sp, i) => (
                    <li key={sp.id}>
                      <input
                        type="text"
                        value={sp.label ?? ''}
                        placeholder={`Snap ${i + 1}`}
                        onChange={(e) => {
                          const snapPoints = (block.snapPoints ?? []).map((s) =>
                            s.id === sp.id ? { ...s, label: e.target.value } : s,
                          )
                          patchImage({ snapPoints })
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label="Remove snap"
                        onClick={() =>
                          patchImage({
                            snapPoints: (block.snapPoints ?? []).filter(
                              (s) => s.id !== sp.id,
                            ),
                          })
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <GapAfterField
              value={block.gapAfter}
              onChange={(gapAfter) => patchImage({ gapAfter })}
            />
          </section>
        )}

        {block.type === 'text' && (
          <section className="frame-inspector-section">
            <h3>Text</h3>
            <label className="fi-field">
              <span>Content</span>
              <textarea
                rows={4}
                value={block.content}
                onChange={(e) => onChange({ content: e.target.value })}
              />
            </label>
            <div className="fi-field">
              <span>Style</span>
              <SegmentButtons<TextVariant>
                ariaLabel="Text style"
                value={block.variant}
                onChange={(variant) => onChange({ variant })}
                options={[
                  { value: 'heading', label: 'Heading' },
                  { value: 'body', label: 'Body' },
                ]}
              />
            </div>
            <div className="fi-field">
              <span>Size</span>
              <SegmentButtons<BlockSize>
                ariaLabel="Text size"
                value={block.size ?? (block.variant === 'heading' ? 'lg' : 'md')}
                onChange={(size) => onChange({ size })}
                options={TEXT_SIZES}
              />
            </div>
            <div className="fi-field">
              <span>Align</span>
              <SegmentButtons<TextAlign>
                ariaLabel="Text align"
                value={block.align}
                onChange={(align) => onChange({ align })}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </div>
            <GapAfterField
              value={block.gapAfter}
              onChange={(gapAfter) => onChange({ gapAfter })}
            />
          </section>
        )}

        {block.type === 'link' && (
          <section className="frame-inspector-section">
            <h3>Link</h3>
            <label className="fi-field">
              <span>Label</span>
              <input
                type="text"
                value={block.label}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </label>
            <label className="fi-field">
              <span>URL</span>
              <input
                type="url"
                value={block.url}
                onChange={(e) => onChange({ url: e.target.value })}
              />
            </label>
            <div className="fi-field">
              <span>Size</span>
              <SegmentButtons<BlockSize>
                ariaLabel="Link size"
                value={block.size ?? 'md'}
                onChange={(size) => onChange({ size })}
                options={TEXT_SIZES}
              />
            </div>
            <div className="fi-field">
              <span>Align</span>
              <SegmentButtons<TextAlign>
                ariaLabel="Link align"
                value={block.align ?? 'left'}
                onChange={(align) => onChange({ align })}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </div>
            <GapAfterField
              value={block.gapAfter}
              onChange={(gapAfter) => onChange({ gapAfter })}
            />
          </section>
        )}

        {block.type === 'spacer' && (
          <section className="frame-inspector-section">
            <h3>Spacer</h3>
            <label className="fi-field">
              <span>Height</span>
              <input
                type="number"
                min={8}
                max={480}
                value={block.height}
                onChange={(e) => onChange({ height: Number(e.target.value) })}
              />
            </label>
          </section>
        )}

        {block.type === 'marker' && (
          <section className="frame-inspector-section">
            <h3>Snap marker</h3>
            <label className="fi-field">
              <span>Label</span>
              <input
                type="text"
                value={block.label ?? ''}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </label>
          </section>
        )}
      </div>

      <footer className="frame-inspector-foot">
        <div className="frame-inspector-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={index <= 0}
            onClick={onMoveUp}
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={index >= total - 1}
            onClick={onMoveDown}
            title="Move down"
          >
            ↓
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDuplicate}>
            Duplicate
          </button>
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </footer>
    </aside>
  )
}
