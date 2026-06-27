export interface DiffChange {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

/**
 * Super lightweight and robust Longest Common Subsequence line-by-line diffing utility.
 * Compares two text documents and returns a sequence of lines annotated with their diff status.
 */
export function countDiffLines(oldText: string, newText: string): DiffChange[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  // Initialize DP table
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Recurse backwards to construct the diff sequence
  const result: DiffChange[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'unchanged', value: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', value: oldLines[i - 1] });
      i--;
    }
  }

  return result;
}
