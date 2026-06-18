export function shiftFeedbackOffsets(
  oldText: string,
  newText: string,
  feedbackItems: Array<{ id: string; start_offset: number; end_offset: number }>
): Array<{ id: string; start_offset: number; end_offset: number }> {
  let diffStart = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (diffStart < minLen && oldText[diffStart] === newText[diffStart]) diffStart++;

  const delta = newText.length - oldText.length;
  const clamp = (n: number) => Math.max(0, Math.min(newText.length, n));

  return feedbackItems.map((item) => {
    if (item.start_offset <= diffStart) return item;
    return {
      id: item.id,
      start_offset: clamp(item.start_offset + delta),
      end_offset: clamp(item.end_offset + delta),
    };
  });
}
