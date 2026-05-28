import { createStore, reconcile } from "solid-js/store"
import { createSimpleContext } from "./helper"

export type HomeRoute = {
  type: "home"
}

export type SessionRoute = {
  type: "session"
  sessionID: string
  initialMessage?: string
}

export type Route = HomeRoute | SessionRoute

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: (props: { initialRoute?: Route }) => {
    const [store, setStore] = createStore<Route>(props.initialRoute ?? { type: "home" })

    return {
      get data() {
        return store
      },
      navigate(route: Route) {
        setStore(reconcile(route))
      },
    }
  },
})

export type RouteContext = ReturnType<typeof useRoute>
