// Runs before the stylesheet so saved light mode does not flash dark on reload.
(() => {
  let theme = "dark";
  try {
    if (localStorage.getItem("pnp-theme") === "light") theme = "light";
  } catch {}
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === "dark" ? "#121817" : "#f6f5f0";
})();
