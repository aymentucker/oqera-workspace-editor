# Oqera Icon System

Oqera uses a custom SVG icon language rather than a third-party icon set.

## Rules
- 24x24 viewBox
- 1.6 default optical stroke
- round line caps and joins
- currentColor only unless an icon semantically requires otherwise
- icons must remain legible at 16, 18, 20 and 24px
- directional icons must support RTL mirroring
- product/navigation icons should have recognizable Oqera geometry rather than copying an existing set

Initial icons live in `apps/desktop/src/icons.tsx`. They will move to `packages/ui` as the design system grows.
