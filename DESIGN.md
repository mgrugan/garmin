---
version: alpha
name: Flight Deck
description: A precision-instrument design system for personal health telemetry — dark, dense, and calibrated, built to make a year of body data legible at a glance.
colors:
  base: "#06080B"
  surface: "#0D1117"
  surface-raised: "#141A22"
  surface-overlay: "#1A222C"
  line: "#1E2733"
  line-strong: "#2C3846"
  on-surface: "#E9F0F7"
  on-surface-muted: "#9DACBF"
  on-surface-faint: "#77859A"
  primary: "#B8F23C"
  on-primary: "#0A1400"
  secondary: "#45D6F5"
  on-secondary: "#001A20"
  tertiary: "#FF6B6B"
  on-tertiary: "#2A0000"
  amber: "#FFC46B"
  on-amber: "#241600"
  platinum: "#C3D0E0"
  success: "#5CE39B"
  warning: "#FFC46B"
  error: "#FF4D6A"
typography:
  display-xl:
    fontFamily: Sora
    fontSize: 56px
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: -0.035em
  headline-lg:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Sora
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Sora
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: Manrope
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.16em
  readout-xl:
    fontFamily: JetBrains Mono
    fontSize: 44px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: -0.03em
    fontFeature: "'tnum' 1, 'zero' 1"
  readout-lg:
    fontFamily: JetBrains Mono
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: -0.02em
    fontFeature: "'tnum' 1, 'zero' 1"
  readout-md:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.1
    fontFeature: "'tnum' 1, 'zero' 1"
  readout-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.2
    fontFeature: "'tnum' 1, 'zero' 1"
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  gutter: 16px
  margin: 24px
  max-width: 1440px
rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 14px
  xl: 20px
  full: 9999px
components:
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 20px
  card-inset:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 16px
  stat-tile:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    typography: "{typography.readout-lg}"
    rounded: "{rounded.lg}"
    padding: 18px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "#C8FA5E"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 12px
  button-secondary-hover:
    backgroundColor: "{colors.line-strong}"
    textColor: "{colors.on-surface}"
  chip:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 8px
  chip-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 8px
  tooltip:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 10px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.readout-md}"
    rounded: "{rounded.md}"
    padding: 10px
  slider-track:
    backgroundColor: "{colors.line-strong}"
    rounded: "{rounded.full}"
    height: 4px
  slider-range:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.full}"
    height: 4px
  slider-thumb:
    backgroundColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    size: 16px
  page:
    backgroundColor: "{colors.base}"
    textColor: "{colors.on-surface}"
    padding: 24px
  panel-eyebrow:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface-faint}"
    typography: "{typography.label-caps}"
    padding: 0px
  panel-divider:
    backgroundColor: "{colors.line}"
    height: 1px
  chart-well:
    backgroundColor: "{colors.base}"
    textColor: "{colors.on-surface-faint}"
    rounded: "{rounded.md}"
    padding: 12px
  series-load:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  series-recovery:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
  series-cardiac:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
  series-energy:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
  series-mass:
    backgroundColor: "{colors.platinum}"
    textColor: "{colors.base}"
  delta-positive:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.success}"
    typography: "{typography.readout-sm}"
    rounded: "{rounded.full}"
    padding: 6px
  delta-caution:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.warning}"
    typography: "{typography.readout-sm}"
    rounded: "{rounded.full}"
    padding: 6px
  delta-negative:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.error}"
    typography: "{typography.readout-sm}"
    rounded: "{rounded.full}"
    padding: 6px
---

# Flight Deck

## Overview

Flight Deck is the design language for a single person's health telemetry — years of heart rate, sleep, training load and body mass, read the way a pilot reads an instrument panel: dark glass, calibrated marks, and light used only where it carries a signal.

The audience is one data-literate athlete looking at their own numbers, not a team buying software. That changes the priorities. There is no persuasion to do, so there is no marketing surface: no hero image, no feature grid, no gradient mesh. Every pixel is either a measurement, a scale that makes the measurement legible, or a control that changes what is measured.

The feeling is **calibrated confidence**. Instruments do not shout, and they do not decorate. They are precise, quiet, and completely trustworthy at 3am. Density is a feature — this is a cockpit, not a gallery — but density without hierarchy is noise, so a screen is allowed exactly one loud element and everything else holds still.

The system leans dark for a practical reason before an aesthetic one: this data is read at the edges of the day, and luminous marks on near-black let saturated signal colors carry meaning without competing with a bright field.

## Colors

The palette is a near-black instrument field with four signal colors, each permanently bound to one physiological domain. Color is never decorative here — a hue always means the same thing, so the eye learns the panel once.

- **Base (#06080B):** The void behind the glass. Used for the page field and for the deepest chart wells, never for content containers.
- **Surface (#0D1117) / Surface Raised (#141A22) / Surface Overlay (#1A222C):** Three tonal steps that carry the entire elevation model. Panels sit on Surface Raised; controls and popovers step up to Surface Overlay.
- **Primary — Signal Lime (#B8F23C):** Effort and output. Training load, active calories, the primary action, and the "you" line in any projection. The single most saturated color in the system and the most rationed.
- **Secondary — Ice Cyan (#45D6F5):** Recovery and restoration. Sleep, HRV, body battery, and every projected or modelled value — cyan always means "not measured, computed."
- **Tertiary — Ember (#FF6B6B):** Cardiac strain. Heart rate, intensity zones, and anything approaching a physiological ceiling.
- **Amber (#FFC46B):** Energy balance. Calories in and out, deficit and surplus, and cautionary states that are not yet errors.
- **Platinum (#C3D0E0):** Body mass. Deliberately desaturated, because weight is the one metric the system must present without editorial.
- **On Surface (#E9F0F7) → Muted (#9DACBF) → Faint (#77859A):** A three-step text ramp. Every step clears 4.5:1 on Surface, so no label is ever unreadable.

## Typography

Three families, each with a job it does not share.

- **Sora** carries every heading. Its geometric skeleton and slightly technical detailing read as engineered rather than corporate, and at tight negative tracking it gives the panel a machined edge that a neutral grotesk cannot.
- **Manrope** carries body copy, control labels, and prose. It is quieter and rounder than Sora on purpose — it recedes so the numbers can advance.
- **JetBrains Mono** carries every number the user reads as a measurement: readouts, axis ticks, units, timestamps, and delta values. Tabular figures and a slashed zero are the point. A digit must never change width as it counts, or the panel appears to twitch.

The `label-caps` level — mono, 10px, 0.16em tracking, uppercase — is the system's connective tissue. It marks every panel, axis, and legend, and it is the one place where letterspacing is set loud enough to read as instrumentation.

Never set Inter, Roboto, Arial, or Helvetica anywhere in this system.

## Layout

A fluid single-column stack on mobile that resolves into a **12-column grid capped at 1440px** on desktop, with a 16px gutter and 24px page margin.

Spacing is a strict 8px scale with a 4px half-step. Panels use 20px internal padding; nested wells use 16px. The vertical rhythm between major sections is 40px, which is wide enough to separate systems of thought without ever requiring a divider.

Panels are sized by information weight, not by tidiness. A chart that needs width gets width, and the grid is allowed to look asymmetric as a result. Resist the reflex to make every card the same size — equal cards imply equal importance, which is almost never true of health data.

## Elevation & Depth

Depth is **tonal, not cast**. The three surface steps do all the structural work, each separated by a 1px `line` hairline rather than a shadow. Flat tonal layering keeps a dense panel from accumulating the visual grime that stacked shadows produce.

The one exception is light emission. Signal colors may cast a soft colored glow — a wide, very low-opacity radial bloom in the signal's own hue — but only from a live or focused element: the active projection line, a hovered data point, the primary action. Glow marks attention, never mere presence. It is a light source, not a drop shadow, so it is never offset downward.

## Shapes

Corners are softened, not rounded away: **14px on panels, 8px on wells and inputs, 4px on the smallest marks**, and full-round reserved for pills, chips, and slider thumbs. The intent is precision-milled hardware — enough radius to feel manufactured, never enough to feel soft.

Chart geometry follows the same discipline. Lines are 2px with round caps, projected values are dashed at a 4/4 rhythm, and confidence regions are filled at 8–14% opacity with no stroke, so a forecast is legibly *less certain* than a measurement without needing a legend to say so.

## Components

- **Panel (card):** The base container. Surface Raised, 14px radius, 1px `line` border, 20px padding. Every panel opens with a `label-caps` eyebrow naming what it measures and the window it covers.
- **Stat tile:** A `label-caps` eyebrow, a `readout-lg` value with its unit set in `on-surface-faint` at 60% of the value's size, and a delta chip. The delta is always signed and always carries its comparison window in words — "+2.1 vs 30d avg", never a bare arrow.
- **Buttons:** Full-round. Primary is Signal Lime on near-black and appears at most once per view. Secondary is Surface Overlay with `on-surface` text. Both are 12px padded with a visible 2px focus ring in the button's own accent.
- **Chips:** Full-round, `label-caps`, used for range selection and filters. Active state inverts to Signal Lime.
- **Sliders:** A 4px `line-strong` track, a Signal Lime filled range, and a 16px `on-surface` thumb. Every slider is paired with a live mono readout of its value and its unit — a slider without a number is a guess, not a control.
- **Tooltips:** Surface Overlay, 8px radius, `body-sm`. Chart tooltips list every series at the hovered timestamp in a fixed order, with tabular numerals so values align vertically between frames.

## Do's and Don'ts

- Do bind each signal color to one physiological domain and keep that binding across every chart in the app.
- Don't use more than one saturated accent inside a single panel unless the panel is explicitly comparing those two domains.
- Do set every number the user reads as a measurement in JetBrains Mono with tabular figures.
- Don't animate a value counting up on load — a readout that lies for 800ms is not an instrument.
- Do distinguish measured from modelled data visually: solid stroke for recorded, dashed stroke plus a filled band for projected.
- Don't render a projection without its uncertainty. A single forecast line is a false promise.
- Do maintain WCAG AA contrast (4.5:1 for normal text) against the surface the text actually sits on.
- Don't use purple or violet anywhere; don't use gradient fills as decoration; don't set Inter, Roboto, or Arial.
- Do let motion confirm causation — a slider move should visibly propagate to the curve it drives — and respect `prefers-reduced-motion` by cutting duration to zero.
- Don't use shadows to create hierarchy. Use the three surface tones and a hairline.
