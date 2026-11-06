const PREFIX = "error: unknown option '"
const SUGGESTION = "'\n(Did you mean "

/**
 * Commander prints an unknown option exactly as typed. Typed as
 * `--cookie=sid=…` on a command with no `--cookie` (like `map`), or with a
 * typo (`--heder='Authorization: Bearer …'`), that would print a secret.
 * So keep only the flag itself: a long flag up to its `=`, a short flag's
 * first letter (`-xVALUE`). Every other message passes through unchanged.
 *
 * Wired in as commander's `outputError`, which every subcommand shares.
 */
export function hideUnknownOptionValue(message: string): string {
  if (!message.startsWith(PREFIX)) return message
  // The flag ends at the quote before commander's suggestion, or else at the
  // last quote. Searching from the end keeps a quote inside the value from
  // cutting the flag short.
  const suggestionAt = message.lastIndexOf(SUGGESTION)
  const end = suggestionAt !== -1 ? suggestionAt : message.lastIndexOf("'")
  if (end < PREFIX.length) return message
  const flag = message.slice(PREFIX.length, end)
  return PREFIX + flagOnly(flag) + message.slice(end)
}

function flagOnly(flag: string): string {
  if (flag.startsWith('--')) {
    const eq = flag.indexOf('=')
    return eq === -1 ? flag : flag.slice(0, eq)
  }
  return flag.slice(0, 2)
}
