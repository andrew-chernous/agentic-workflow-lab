/**
 * Smallest possible workpiece: exists so the pipeline and its quality gates can be
 * exercised end to end without any real domain logic getting in the way.
 */
export function add(a, b) {
  return a + b;
}
