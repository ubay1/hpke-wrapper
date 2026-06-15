// Shim for next/server — the @ubay182/hpke-wrapper package re-exports
// Next.js-specific utilities (createHpkeHandlers, createHpkeMiddleware)
// that are not used in SvelteKit. This shim prevents build errors.
export const NextRequest = class { };
export const NextResponse = class {
  static next() { return new NextResponse(); }
  static json(data: any) { return new NextResponse(); }
};
