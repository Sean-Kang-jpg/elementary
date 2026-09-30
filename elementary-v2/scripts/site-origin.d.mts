// vite.config.ts is type-checked, and the resolver is plain ESM so that the
// build scripts can import it without a compile step.
export function siteOrigin(): string
export function siteOriginIsDefault(): boolean
