import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
function luminance(color: string) {
  if (color === "white") return 1;
  const values = /oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/.exec(color);
  if (!values) throw new Error(`Unsupported test color: ${color}`);
  const light = Number(values[1]) / 100;
  const chroma = Number(values[2]);
  const hue = (Number(values[3]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (light + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (light - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (light - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return (
    0.2126 * clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) +
    0.7152 * clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) +
    0.0722 * clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  );
}
it("meets WCAG AA normal-text contrast for semantic colors in both themes", () => {
  const themes = [
    ...css.matchAll(/:root(?:\[data-theme="dark"\])?\s*\{([^}]+)\}/g),
  ];
  expect(themes).toHaveLength(2);
  for (const theme of themes) {
    const tokens = new Map(
      [...theme[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    for (const [foreground, background] of [
      ["text", "bg"],
      ["muted", "bg"],
      ["muted", "sidebar"],
      ["muted", "panel"],
      ["accent", "accent-wash"],
      ["on-accent", "accent"],
      ["danger", "bg"],
      ["success", "bg"],
    ]) {
      const a = luminance(tokens.get(foreground) || "");
      const b = luminance(tokens.get(background) || "");
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        `${theme[0].slice(0, 30)} ${foreground}/${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});
