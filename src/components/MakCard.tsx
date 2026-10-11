import type { WorkspaceEntity } from '../types'
import { entityHash } from '../lib/route'
import { contentUrl } from '../desktop/client'
import './documents.css'
import { reviewLabel, useReviewCount } from '../lib/reviewCounts'

/**
 * The design-system card: glass surface over the aura, gradient edge
 * (chrome→servo; amber when pinned), glow + lift on hover. Building
 * block of the home grid; mirrored as `.mak-card` in
 * scripts/shared/report_style.py for generated reports.
 */
export default function MakCard({
  entity,
  step = -1,
  fresh = false,
  onOpen,
}: {
  entity: WorkspaceEntity
  /** Open this tab instead of the card's default, as review views do. */
  step?: number
  /** Arrived since this view was last looked at. */
  fresh?: boolean
  onOpen?: () => void
}) {
  const steps = entity.steps.length
  const inReview = useReviewCount(entity.id)
  return (
    <a
      href={entityHash(entity.id, step)}
      className={`mak-card entity-card${entity.pinned ? ' pinned' : ''}${entity.hero ? ' has-hero' : ''}${fresh ? ' fresh' : ''}`}
      data-entity={entity.id}
      onClick={onOpen}
    >
      {entity.hero && (
        <div className="card-hero">
          <img src={contentUrl(`/workspace/${entity.folder}/${entity.hero}`)} alt="" loading="lazy" decoding="async" />
          {fresh && <span className="view-new">new</span>}
        </div>
      )}
      <div className="card-top">
        <span className="chip">{entity.category || 'other'}</span>
        {entity.pinned && <span className="chip chip-pin">pinned</span>}
        {/* Every live card shares the active state, so only what needs the user is shown. */}
        {inReview > 0 ? <span className="review-chip" title={`${reviewLabel(inReview)}. Open Properties to review.`}>{reviewLabel(inReview)}</span>
          : entity.status !== 'active' && <span className={`status-dot ${entity.status}`} title={entity.status} />}
      </div>

      <div className="card-project-title">
        {entity.icon && <img className="card-project-icon" src={contentUrl(`/workspace/${entity.folder}/${entity.icon}`)} width="48" height="48" alt="" loading="lazy" decoding="async" />}
        <h3 className="card-title">{entity.title}</h3>
      </div>

      {entity.description && <p className="card-desc">{entity.description}</p>}

      <div className="card-foot">
        <span>
          {steps} step{steps === 1 ? '' : 's'}
        </span>
        <span>·</span>
        <span>{entity.updated ?? entity.created}</span>
        <span className="card-open" aria-hidden="true">
          {step >= 0 ? `open ${entity.steps[step]?.name ?? ''} →` : 'open →'}
        </span>
      </div>
    </a>
  )
}
