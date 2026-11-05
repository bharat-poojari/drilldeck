export function resolveAppRoute(input = typeof window !== "undefined" ? window.location.href : "/") {
  const source = String(input || "/");
  const url = new URL(source, "https://drilldeck.vercel.app");
  const hash = url.hash.replace(/^#/, "").trim();
  const hashMap = {
    "home-view": "home",
    "quick-test-view": "quick-test",
    "setup-view": "setup",
    "about-view": "about",
    "quick-test": "quick-test",
    "setup": "setup",
    "about": "about",
    "home": "home"
  };
  const requestedView = url.searchParams.get("view") || hashMap[hash] || "home";
  const view = requestedView === "custom-test" ? "setup" : requestedView;
  return {
    view: ["home", "quick-test", "setup", "about"].includes(view) ? view : "home",
    preset: url.searchParams.get("preset") || null,
    query: url.searchParams.get("q") || ""
  };
}
