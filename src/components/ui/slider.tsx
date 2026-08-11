import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

/**
 * Restyled to the Flight Deck spec (see DESIGN.md § Components): a 4px
 * `line-strong` track, a Signal Lime filled range, and a 16px `on-surface`
 * thumb.
 *
 * The stock shadcn track uses `bg-muted`, which in this palette resolves to the
 * same value as the panel it sits on — the control rendered as a floating dot
 * with no visible extent. Track and thumb are given explicit Flight Deck tokens
 * here rather than relying on the semantic aliases.
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center py-1.5 select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        {/* Sized explicitly rather than via `data-horizontal:h-1`: Base UI emits
            `data-orientation="horizontal"`, so that variant never matches and the
            track collapsed to 0px — the control appeared as a floating thumb with
            no visible extent. Every slider in this app is horizontal. */}
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1 w-full grow overflow-hidden rounded-full bg-line-strong select-none"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-load h-full select-none"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            /* after:-inset-2 widens the hit target to 40px without growing the
               mark — these get dragged on touch screens. */
            className="relative block size-4 shrink-0 cursor-grab rounded-full border-2 border-base bg-ink shadow-[0_0_10px_-2px_var(--color-load)] transition-[box-shadow,transform] select-none after:absolute after:-inset-2 hover:scale-110 focus-visible:ring-2 focus-visible:ring-load focus-visible:ring-offset-2 focus-visible:ring-offset-raised focus-visible:outline-hidden active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
