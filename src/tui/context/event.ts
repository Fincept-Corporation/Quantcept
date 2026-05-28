type EventHandler = (event: { type: string; properties: Record<string, any> }) => void

export function createEventBus() {
  const handlers = new Map<string, Set<EventHandler>>()
  const globalHandlers = new Set<EventHandler>()

  return {
    on(type: string, handler: EventHandler) {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
      return () => {
        handlers.get(type)?.delete(handler)
      }
    },
    subscribe(handler: EventHandler) {
      globalHandlers.add(handler)
      return () => {
        globalHandlers.delete(handler)
      }
    },
    emit(event: { type: string; properties: Record<string, any> }) {
      handlers.get(event.type)?.forEach((h) => {
        h(event)
      })
      globalHandlers.forEach((h) => {
        h(event)
      })
    },
  }
}

export type EventBus = ReturnType<typeof createEventBus>
