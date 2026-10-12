import WebApp from "@twa-dev/sdk";

const themeKeys = {
  bg_color: "--bg",
  text_color: "--fg",
  hint_color: "--muted",
  button_color: "--accent",
  button_text_color: "--accent-fg",
  secondary_bg_color: "--surface",
  link_color: "--link",
} as const;

function applyTheme() {
  if (!WebApp.initData) return;
  const theme = WebApp.themeParams as unknown as Record<string, string | undefined>;
  for (const [from, to] of Object.entries(themeKeys)) {
    const value = theme[from];
    if (value) document.documentElement.style.setProperty(to, value);
  }
}

export function bootTelegram() {
  WebApp.ready();
  WebApp.expand();
  applyTheme();
  WebApp.onEvent("themeChanged", applyTheme);
  return WebApp.initData;
}
