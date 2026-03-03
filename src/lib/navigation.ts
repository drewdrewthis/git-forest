/**
 * Maps a digit key (1-9) to a zero-based cursor index.
 * Returns the new index, or null if the key is not a valid digit
 * or the resulting index is out of bounds.
 */
export function cursorIndexFromDigit(
  input: string,
  itemCount: number,
): number | null {
  if (input < "1" || input > "9") return null;
  const index = parseInt(input, 10) - 1;
  if (index >= itemCount) return null;
  return index;
}
