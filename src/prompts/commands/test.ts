// /test — detect runner, run suite, report.

export function testTaskPrompt(pattern: string): string {
  const p = pattern.trim();
  const scope = p ? ` matching: ${p}` : '';
  return `Run the project test suite${scope} and report results.

Steps:
  1. Detect test runner (check package.json scripts, then: bun test, vitest, jest, pytest).
  2. Run it with Bash. Prefer focused run if pattern given.
  3. If failures, list each: test name, file:line, failure reason (first useful line).
  4. Final line: "PASS N/M" or "FAIL N/M".

Do not modify any code. Report only.`;
}
