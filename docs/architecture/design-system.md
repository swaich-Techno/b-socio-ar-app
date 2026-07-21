# B Socio AR design system

The interface uses a mobile-first, premium SaaS system with selective translucent surfaces rather than heavy glass effects. The visual language is professional and calm: midnight navy establishes trust, warm amber marks progress and priority, and restrained cobalt supports information states. Dark workflow rails and navigation contrast with warm, quiet work surfaces.

## Tokens

- Primary: `#0F172A`; on-primary: `#FFFFFF`
- Secondary: `#1E3A8A`
- Accent: `#A16207`; signal highlight: `#D7A53D`
- Background: `#F7F7F4`; foreground: `#0B1220`
- Muted: `#F0F1ED`; border: `#DFE2DC`
- Destructive: `#DC2626`; success: `#047857`; warning: `#B45309`
- Typography: system-first sans fonts to avoid a render-blocking external request.
- Spacing follows a 4/8px rhythm. Interactive targets are at least 44px tall.

## Responsive behavior

- 320–767px: one-column forms, compact header, dashboard drawer and bottom-safe padding.
- 768–1023px: two-column forms where related fields benefit, wider cards.
- 1024px and above: persistent sidebar with capped content width.
- Tables become stacked cards on narrow screens; unavoidable tabular content scrolls only within its container.
- The model viewer is loaded only when opened and maintains a reserved aspect ratio.

## Interaction and accessibility

Visible focus rings, explicit form labels, nearby error messages, semantic status text, reduced-motion support, keyboard escape routes, and icon labels are required. Translucency is limited to navigation overlays so content contrast remains at least WCAG AA.
