import type { UsageResponse, WhoamiResponse } from '@crawlbrulee/sdk'

export function renderUsageText(res: UsageResponse): string {
  const lines = [
    `Total credits:      ${res.total_credits}`,
    `Used credits:       ${res.used_credits}`,
    `Available credits:  ${res.available_credits}`,
    `Used quota:         ${res.used_quota_percent}%`,
    `Max concurrency:    ${res.max_concurrency}`,
    `Usage resets at:    ${res.usage_reset}`,
  ]
  return lines.join('\n')
}

export function renderWhoamiText(res: WhoamiResponse): string {
  const lines = [
    `Organization: ${res.organization_name}`,
    `Token name:   ${res.token_name}`,
    `Token:        ${res.token_preview}`,
  ]
  return lines.join('\n')
}
