import { createSimpleContext } from "./helper"

export interface Args {
  prompt?: string
  continue?: boolean
  /** true = open the picker; string = resume that id directly. */
  resume?: string | boolean
  /** --skip-permissions: seed auto-accept ON so tool prompts are granted without a dialog. */
  skipPermissions?: boolean
}

export const { use: useArgs, provider: ArgsProvider } = createSimpleContext({
  name: "Args",
  init: (props: Args) => props,
})
