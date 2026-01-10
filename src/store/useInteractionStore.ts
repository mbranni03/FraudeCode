import { create } from "zustand";
import type { PendingChange } from "../types/state";
import type {
  InteractionState,
  OutputItemType,
  TokenUsage,
  OutputItem,
} from "../types/store";
import type { PromptInfo } from "../types/ui";

interface InteractionStoreActions {
  interactions: Record<string, InteractionState>;
  interactionOrder: string[];
  currentInteractionId: string | null;
  abortController: AbortController | null;
  promptInfo: PromptInfo | null;
  implementationComment: string | null;

  // Actions
  addInteraction: () => string;
  updateInteraction: (id: string, updates: Partial<InteractionState>) => void;
  updateTokenUsage: (usage: TokenUsage, id?: string) => void;
  updateOutput: (
    type: OutputItemType,
    content: string,
    title?: string,
    changes?: PendingChange[],
    id?: string
  ) => void;
  setError: (error: string, interrupt?: boolean, id?: string) => void;
  setStatus: (statusText: string | undefined, id?: string) => void;
  setCurrentInteraction: (id: string | null) => void;

  // Confirmation & Input flows
  promptUserConfirmation: (
    promptInfo?: PromptInfo,
    id?: string
  ) => Promise<boolean>;
  resolveConfirmation: (confirmed: boolean) => void;
  promptImplementationPlanCheck: (id?: string) => Promise<number>;
  commentPromise: (id?: string) => Promise<string>;
  resolveComment: (comment: string, id?: string) => void;
}

let confirmationResolver: ((selected: any) => void) | null = null;
let commentResolver: ((comment: string) => void) | null = null;

export const useInteractionStore = create<InteractionStoreActions>(
  (set, get) => ({
    interactions: {},
    interactionOrder: [],
    currentInteractionId: null,
    abortController: null,
    promptInfo: null,
    implementationComment: null,

    addInteraction: () => {
      const id = crypto.randomUUID();
      const newInteraction: InteractionState = {
        interactionId: id,
        status: 0,
        outputItems: [],
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        elapsedTime: 0,
        pendingChanges: [],
        statusText: undefined,
        lastBreak: 0,
        timeElapsed: 0,
        settingsInteraction: false,
      };
      set((state) => ({
        interactions: { ...state.interactions, [id]: newInteraction },
        interactionOrder: [...state.interactionOrder, id],
        currentInteractionId: id,
      }));
      return id;
    },

    updateInteraction: (id, updates) => {
      set((state) => {
        const interaction = state.interactions[id];
        if (!interaction) return state;
        return {
          interactions: {
            ...state.interactions,
            [id]: { ...interaction, ...updates },
          },
        };
      });
    },

    updateTokenUsage: (usage: TokenUsage, id?: string) => {
      set((state) => {
        const interactionId = id || state.currentInteractionId;
        if (!interactionId) return state;
        const interaction = state.interactions[interactionId];
        if (!interaction) return state;
        let currentUsage = interaction.tokenUsage;
        currentUsage.total += usage.total;
        currentUsage.prompt += usage.prompt;
        currentUsage.completion += usage.completion;
        return {
          interactions: {
            ...state.interactions,
            [interactionId]: {
              ...interaction,
              tokenUsage: currentUsage,
            },
          },
        };
      });
    },

    updateOutput: (type, content, title, changes, id?: string) => {
      set((state) => {
        const interactionId = id || state.currentInteractionId;
        if (!interactionId) return state;
        const interaction = state.interactions[interactionId];
        if (!interaction) return state;
        const outputItems = [...interaction.outputItems];
        const latestOutput = outputItems[outputItems.length - 1];
        let extraChanges = {};
        if (type === "checkpoint") {
          let elapsed = interaction.timeElapsed - interaction.lastBreak;
          extraChanges = {
            lastBreak: interaction.timeElapsed,
          };
          content += ` · (${(elapsed / 10).toFixed(1)}s)`;
        }
        if (
          latestOutput &&
          latestOutput.type === type &&
          type !== "log" &&
          type !== "checkpoint"
        ) {
          outputItems[outputItems.length - 1] = {
            ...latestOutput,
            content,
            changes: [...(latestOutput.changes || []), ...(changes || [])],
          };
        } else {
          outputItems.push({
            id: crypto.randomUUID(),
            type,
            content,
            title,
            changes,
          });
        }
        return {
          interactions: {
            ...state.interactions,
            [interactionId]: {
              ...interaction,
              ...extraChanges,
              outputItems,
            },
          },
        };
      });
    },

    setError: (error, interrupt?, id?) => {
      set((state) => {
        const interactionId = id || state.currentInteractionId;
        if (!interactionId) return state;
        const interaction = state.interactions[interactionId];
        if (!interaction) return state;
        const outputItems = [...interaction.outputItems];
        outputItems.push({
          id: crypto.randomUUID(),
          type: "error",
          content: error,
        });
        return {
          interactions: {
            ...state.interactions,
            [interactionId]: {
              ...interaction,
              status: 2,
              outputItems,
            },
          },
        };
      });
    },

    setStatus: (statusText, id) => {
      set((state) => {
        const interactionId = id || state.currentInteractionId;
        if (!interactionId) return state;
        const interaction = state.interactions[interactionId];
        if (!interaction) return state;
        return {
          interactions: {
            ...state.interactions,
            [interactionId]: {
              ...interaction,
              statusText,
            },
          },
        };
      });
    },

    setCurrentInteraction: (id) => set({ currentInteractionId: id }),

    promptUserConfirmation: (promptInfo?: PromptInfo, id?: string) => {
      return new Promise((resolve) => {
        const interactionId = id || get().currentInteractionId;
        if (!interactionId) {
          resolve(false);
          return;
        }
        confirmationResolver = resolve;
        set((state) => {
          const interaction = state.interactions[interactionId];
          if (!interaction) return state;
          return {
            promptInfo,
            interactions: {
              ...state.interactions,
              [interactionId]: {
                ...interaction,
                status: 3,
              },
            },
          };
        });
      });
    },

    resolveConfirmation: (confirmed) => {
      if (confirmationResolver) {
        confirmationResolver(confirmed);
        confirmationResolver = null;
      }
    },

    promptImplementationPlanCheck: (id?: string) => {
      return new Promise((resolve) => {
        const interactionId = id || get().currentInteractionId;
        if (!interactionId) {
          resolve(2);
          return;
        }
        confirmationResolver = resolve;
        set((state) => {
          const interaction = state.interactions[interactionId];
          if (!interaction) return state;
          return {
            promptInfo: {
              query: "Do you want to proceed with this implementation plan?",
              options: [
                { value: 0, label: "Yes" },
                { value: 1, label: "No (modify plan)" },
                { value: 2, label: "No (cancel)" },
              ],
            },
            interactions: {
              ...state.interactions,
              [interactionId]: {
                ...interaction,
                status: 3,
              },
            },
          };
        });
      });
    },

    commentPromise: (id?: string) => {
      return new Promise((resolve) => {
        const interactionId = id || get().currentInteractionId;
        if (!interactionId) {
          resolve("");
          return;
        }
        commentResolver = resolve;
        set((state) => {
          const interaction = state.interactions[interactionId];
          if (!interaction) return state;
          return {
            interactions: {
              ...state.interactions,
              [interactionId]: {
                ...interaction,
                status: 4,
              },
            },
          };
        });
      });
    },

    resolveComment: (comment: string, id?: string) => {
      const interactionId = id || get().currentInteractionId;
      if (commentResolver) {
        commentResolver(comment);
        commentResolver = null;
      }
      if (interactionId) {
        set((state) => {
          const interaction = state.interactions[interactionId];
          if (!interaction) return state;
          return {
            implementationComment: comment,
            interactions: {
              ...state.interactions,
              [interactionId]: { ...interaction, status: 1 },
            },
          };
        });
      }
    },
  })
);

// Export helpers
export const getInteraction = (id?: string | null) => {
  if (!id) {
    let interactionId = useInteractionStore.getState().currentInteractionId;
    if (!interactionId) return undefined;
    return useInteractionStore.getState().interactions[interactionId];
  }
  return useInteractionStore.getState().interactions[id];
};

export const useInteraction = (id?: string | null) => {
  if (!id)
    return useInteractionStore(
      (state) => state.interactions[state.interactionOrder.length - 1]
    );
  return useInteractionStore((state) =>
    id ? state.interactions[id] : undefined
  );
};

export const initSignal = () => {
  let existing = useInteractionStore.getState().abortController;
  if (existing) {
    existing.abort();
  }
  useInteractionStore.setState({ abortController: new AbortController() });
};

export const interrupt = () => {
  const state = useInteractionStore.getState();
  if (state.abortController) {
    state.abortController.abort();
  }

  const interactionId = state.currentInteractionId;
  if (interactionId) {
    state.updateInteraction(interactionId, {
      status: -1,
    });
  }
};

export const getSignal = () =>
  useInteractionStore.getState().abortController?.signal;
