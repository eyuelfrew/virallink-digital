/**
 * Stage palette.
 *
 * The content pipeline has nine stages, and every surface that shows more than
 * one of them — the board, the weekly report, the funnel — needs the same
 * colour for the same stage. Centralising the mapping here is what keeps that
 * promise; picking colours per page is how a board ends up with purple
 * "Editing" and a report with orange "Editing".
 *
 * The classes are written out in full rather than composed at runtime. Tailwind
 * scans the source for class names it can see, so a computed
 * `bg-stage-${stage}` would produce no CSS at all.
 */

import { cn } from '@/lib/utils';
import { CONTENT_STAGE, CONTENT_STAGE_LABELS } from '@/shared/enums';
import {
  Camera,
  CircleCheck,
  Film,
  Lightbulb,
  PenLine,
  RotateCcw,
  Send,
  Sparkles,
  Signature,
} from 'lucide-react';

/**
 * Per-stage colour and icon.
 *
 * `bar` is the fill for charts, `text` is the label colour, `soft` is the
 * tinted background behind a chip. All three are legible in light and dark
 * mode because they are driven by the `--stage-*` tokens rather than by fixed
 * hex values.
 */
export const STAGE_STYLES = Object.freeze({
  [CONTENT_STAGE.IDEA]: {
    bar: 'bg-stage-idea',
    text: 'text-stage-idea',
    soft: 'bg-stage-idea/10',
    border: 'border-stage-idea/30',
    icon: Lightbulb,
  },
  [CONTENT_STAGE.BRAINSTORMING]: {
    bar: 'bg-stage-brainstorming',
    text: 'text-stage-brainstorming',
    soft: 'bg-stage-brainstorming/10',
    border: 'border-stage-brainstorming/30',
    icon: Sparkles,
  },
  [CONTENT_STAGE.WRITING]: {
    bar: 'bg-stage-writing',
    text: 'text-stage-writing',
    soft: 'bg-stage-writing/10',
    border: 'border-stage-writing/30',
    icon: PenLine,
  },
  [CONTENT_STAGE.APPROVAL]: {
    bar: 'bg-stage-approval',
    text: 'text-stage-approval',
    soft: 'bg-stage-approval/10',
    border: 'border-stage-approval/30',
    icon: Signature,
  },
  [CONTENT_STAGE.REVISION]: {
    bar: 'bg-stage-revision',
    text: 'text-stage-revision',
    soft: 'bg-stage-revision/10',
    border: 'border-stage-revision/30',
    icon: RotateCcw,
  },
  [CONTENT_STAGE.SHOOTING]: {
    bar: 'bg-stage-shooting',
    text: 'text-stage-shooting',
    soft: 'bg-stage-shooting/10',
    border: 'border-stage-shooting/30',
    icon: Camera,
  },
  [CONTENT_STAGE.EDITING]: {
    bar: 'bg-stage-editing',
    text: 'text-stage-editing',
    soft: 'bg-stage-editing/10',
    border: 'border-stage-editing/30',
    icon: Film,
  },
  [CONTENT_STAGE.SCHEDULED]: {
    bar: 'bg-stage-scheduled',
    text: 'text-stage-scheduled',
    soft: 'bg-stage-scheduled/10',
    border: 'border-stage-scheduled/30',
    icon: Send,
  },
  [CONTENT_STAGE.POSTED]: {
    bar: 'bg-stage-posted',
    text: 'text-stage-posted',
    soft: 'bg-stage-posted/10',
    border: 'border-stage-posted/30',
    icon: CircleCheck,
  },
});

/** The palette entry for a stage, falling back to a neutral entry. */
export function stageStyle(stage) {
  return (
    STAGE_STYLES[stage] || {
      bar: 'bg-ink-subtle',
      text: 'text-ink-muted',
      soft: 'bg-surface-sunken',
      border: 'border-line',
      icon: CircleCheck,
    }
  );
}

/** Human label for a stage. */
export function stageLabel(stage) {
  return CONTENT_STAGE_LABELS[stage] || stage;
}

/**
 * A stage chip: a coloured dot plus the stage name.
 *
 * The dot is decorative and the name always accompanies it, so the state is
 * readable without relying on hue — the same rule the status badges follow.
 */
export function StageChip({ stage, className, showIcon = false, size = 'sm' }) {
  const style = stageStyle(stage);
  const Icon = style.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        style.soft,
        style.text,
        className,
      )}
    >
      {showIcon ? <Icon className={size === 'sm' ? 'size-3' : 'size-4'} aria-hidden="true" /> : null}
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', style.bar)} />
      {stageLabel(stage)}
    </span>
  );
}
