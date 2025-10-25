// web/src/bridge.ts
import { useEffect, useState, useSyncExternalStore } from "react";

type UnknownObject = Record<string, unknown>;

type OpenAiGlobals<TI = UnknownObject, TO = UnknownObject, TM = UnknownObject, WS = UnknownObject> = {
  theme: "light" | "dark";
  locale: string;
  maxHeight: number;
  displayMode: "pip" | "inline" | "fullscreen";
  safeArea: { insets: { top: number; bottom: number; left: number; right: number } };
  toolInput: TI;
  toolOutput: TO | null;
  toolResponseMetadata: TM | null;
  widgetState: WS | null;
};

type CallToolResponse = UnknownObject;

type OpenAiAPI<WS extends UnknownObject> = {
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResponse>;
  sendFollowUpMessage: (args: { prompt: string }) => Promise<void>;
  requestDisplayMode: (args: { mode: "pip" | "inline" | "fullscreen" }) => Promise<{ mode: string }>;
  openExternal: (payload: { href: string }) => void;
  setWidgetState: (state: WS) => Promise<void>;
};

declare global {
  interface Window {
    openai: OpenAiAPI<any> & OpenAiGlobals<any, any, any, any>;
  }
  interface WindowEventMap {
    "openai:set_globals": CustomEvent<{ globals: Partial<OpenAiGlobals> }>;
  }
}

export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(key: K) {
  return useSyncExternalStore(
    (onChange) => {
      const handler = (e: Event) => {
        const val = (e as CustomEvent<{ globals: Partial<OpenAiGlobals> }>).detail.globals[key];
        if (val !== undefined) onChange();
      };
      window.addEventListener("openai:set_globals", handler as EventListener, { passive: true });
      return () => window.removeEventListener("openai:set_globals", handler as EventListener);
    },
    () => (window.openai as any)[key]
  );
}

export const useToolOutput = <T,>() => useOpenAiGlobal("toolOutput") as T | null;
export const useWidgetState = <T,>(initial: T) => {
  const [local, setLocal] = useState<T>(() => (window.openai.widgetState ?? initial) as T);
  useEffect(() => setLocal((window.openai.widgetState ?? initial) as T), [initial]);
  const set = async (next: T) => {
    setLocal(next);
    await window.openai.setWidgetState(next);
  };
  return [local, set] as const;
};
