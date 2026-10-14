export function isIndexRoute(path: string): boolean {
  return path === "/" || path.startsWith("/?");
}
