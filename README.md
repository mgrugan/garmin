# Flight Deck

A precision-instrument dashboard for Garmin data. It reads a Garmin Connect
export, shows what the numbers are doing, and lets you steer a body-mass
simulation to find out what happens if you change something.

Everything runs in the browser. Files are read with the File API and never
leave your machine — there is no server and no upload.

```bash
npm install
npm run dev
```

The app opens with a generated sample dataset so every panel is explorable
before you import anything. A **Sample data** badge in the header marks it;
the badge disappears once you load your own export.

## Getting your data in

**Everything** — go to [garmin.com/account/datamanagement](https://www.garmin.com/account/datamanagement),
choose *Export Your Data*, confirm by email, and Garmin sends a ZIP within a
few days. Drop the whole ZIP on the import panel.

**Activities only** — Garmin Connect → Activities → *Export CSV* downloads
immediately. Faster, but no sleep, weight, HRV, or daily step data.

The importer sniffs file *shape* rather than filename, because Garmin's export
embeds account ids and date ranges in the names and the field names drift
between export vintages. Anything it cannot place is listed under "not
recognised" rather than dropped silently — a health import that quietly loses
six months is worse than one that fails loudly.

One thing it cannot detect: **Garmin's CSV follows your account's display
units and the file never states which**. Set the KG/LB toggle before importing
if your account is in imperial.

## The five views

| View | Answers |
|---|---|
| **Overview** | How am I doing, and where is this heading if nothing changes |
| **Trajectory** | What happens if I eat / move / train differently |
| **Training** | Was the training the right *shape*, not just the right amount |
| **Recovery** | Sleep architecture, resting HR and HRV, with projections |
| **Insights** | Ranked, evidence-backed things worth changing |

## The weight model

The "3500 kcal = 1 lb" rule is a straight line and bodies are not, so it
over-predicts badly past about twelve weeks. This model integrates day by day
and closes the three loops that flatten a real curve:

1. **Mass loop** — a lighter body costs less to run and less to move, so BMR
   and step cost fall as weight falls.
2. **Adaptive thermogenesis** — sustained deficits suppress expenditure beyond
   what lost mass explains, approaching the floor with a ~4 week time constant.
   Toggleable, so you can see the naive answer for comparison.
3. **Forbes partitioning** — as fat mass drops, more of each further kilogram
   comes from lean tissue, which is far cheaper per kg (~1,816 kcal/kg against
   ~9,440), so the same deficit buys less scale movement over time.

Expenditure is built from named components rather than an activity multiplier,
because the point of having Garmin data is that the parts can be measured:

```
TDEE = BMR + baseline NEAT + step NEAT + exercise + TEF
```

Resting rate uses Katch-McArdle when body fat is known (your Index scale, or an
imported body-fat figure) and Mifflin-St Jeor otherwise. Double counting is
handled explicitly in two places: step cost uses the *net* cost of walking, and
activity calories have their resting component subtracted.

The goal solver bisects on the forward model — adaptation makes it path
dependent, so there is no closed form to invert.

### What it does not know

Intake is what you type, not what you ate. Garmin's activity calories are an
estimate with meaningful error. Partitioning assumptions are least reliable at
very low body fat. Treat the projection as a central estimate with the drawn
band around it, which is why no forecast is ever rendered without one.

## Trend projections

Scalar metrics (VO₂max, resting HR, HRV) are fitted with **Theil-Sen** rather
than least squares. One week of illness or a loosely worn strap drags an OLS
slope noticeably; the median-of-pairwise-slopes estimator tolerates ~29%
contaminated points, which is roughly what real wearable data looks like.

Projections are drawn **only when the trend clears its own noise floor**
(`isTrendMeaningful`). Extrapolating a slope smaller than its residual scatter
produces a confident-looking line that means nothing — the panel says "flat
within measurement noise" instead.

Cones widen with √(days ahead), not linearly: these metrics are mean-reverting,
so uncertainty accumulates like a random walk.

## Design

The visual system is specified in [DESIGN.md](./DESIGN.md) — a Google
`design.md` token document that lints clean (`npx @google/design.md lint
DESIGN.md`). The short version: dark instrument field, four signal colours each
permanently bound to one physiological domain, Sora / Manrope / JetBrains Mono,
and one rule that outranks the rest — **measured data is a solid stroke,
modelled data is dashed over a filled band.** You should never have to check a
legend to know whether you are looking at a recording or a guess.

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · Recharts · Base UI (via shadcn) ·
Phosphor icons · fflate · Papa Parse

```bash
npm run build      # typecheck + production build
npm run lint
```

## Not medical advice

The Insights view is pattern-matching over your own data. Effect sizes come
from published intervention research and describe typical responses, not
guarantees. If anything here conflicts with a doctor or a coach who knows your
history, theirs wins.
