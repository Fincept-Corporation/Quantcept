import { createSimpleContext } from "./helper"

export interface Args {
  prompt?: string
  continue?: boolean
  /** true = open the picker; string = resume that id directly. */
  resume?: string | boolean
}

export const { use: useArgs, provider: ArgsProvider } = createSimpleContext({
  name: "Args",
  init: (props: Args) => props,
})
