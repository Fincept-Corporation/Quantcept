import { createSimpleContext } from "./helper"

export interface Args {
  prompt?: string
}

export const { use: useArgs, provider: ArgsProvider } = createSimpleContext({
  name: "Args",
  init: (props: Args) => props,
})
