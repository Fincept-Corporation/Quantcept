import type { JsxCommand } from "@ext/commands/types"
import { JobsView } from "@tui/components/jobs-view"

export function jobsCommand(): JsxCommand {
  return {
    kind: "jsx",
    id: "jobs.view",
    name: "jobs",
    description: "View autonomous agent jobs (status, schedule, progress)",
    category: "Jobs",
    source: "builtin",
    render: (ctx) => <JobsView onClose={() => ctx.closeDialog()} />,
  }
}
