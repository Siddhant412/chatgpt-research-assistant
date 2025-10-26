import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App";

function getShadowContainer(): { host: HTMLElement; shadow: ShadowRoot; mount: HTMLDivElement } {
  const host = document.getElementById("root");
  if (!host) throw new Error("#root not found");

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

  let mount = shadow.getElementById("ra-app-root") as HTMLDivElement | null;
  if (!mount) {
    mount = document.createElement("div");
    mount.id = "ra-app-root";
    shadow.appendChild(mount);
  }
  return { host, shadow, mount };
}

// Display if any error related to widget occured
function showFatal(msg: string) {
  try {
    const { shadow } = getShadowContainer();
    let debug = shadow.getElementById("ra-fatal") as HTMLDivElement | null;
    if (!debug) {
      debug = document.createElement("div");
      debug.id = "ra-fatal";
      debug.style.cssText =
        "font: 13px/1.5 ui-sans-serif,system-ui,-apple-system; color:#e9edf3; padding:12px; white-space:pre-wrap;";
      shadow.appendChild(debug);
    }
    debug.textContent = "ResearchApp widget error: " + msg;
  } catch {
    const el = document.getElementById("root");
    if (el) el.textContent = "ResearchApp widget error: " + msg;
  }
}

window.addEventListener("error", (e) => {
  showFatal(e.error?.message || e.message || "Unknown error");
});
window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  const r: any = (e && (e as any).reason) || {};
  showFatal(r?.message || String(r));
});

function mount() {
  const { mount } = getShadowContainer();

  const KEY = "__RA_REACT_ROOT__";
  let root = (mount as any)[KEY] as ReactDOM.Root | undefined;
  if (!root) {
    root = ReactDOM.createRoot(mount);
    (mount as any)[KEY] = root;
  }

  root.render(
    <App />
  );
}

try {
  mount();
} catch (err: any) {
  showFatal(err?.message || String(err));
}
