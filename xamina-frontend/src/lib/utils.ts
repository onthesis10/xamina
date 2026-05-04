/**
 * Minimal classnames merge utility.
 * Filters out falsy values and joins remaining class strings.
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}
