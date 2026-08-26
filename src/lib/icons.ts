export type ElementorSvgIcon = {
  library: "svg";
  value: { url: string; id: string };
};

function dataUri(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function strokeSvg(paths: string, color: string, width = 1.8): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export function svgIcon(svg: string): ElementorSvgIcon {
  return { library: "svg", value: { url: dataUri(svg), id: "" } };
}

export function iconImg(svg: string, size = 14): string {
  return `<img src="${dataUri(svg)}" width="${size}" height="${size}" alt="" style="width:${size}px;height:${size}px;vertical-align:-2px;margin-right:6px" />`;
}

const CLOCK = strokeSvg(
  `<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>`,
  "#6B7280",
);
const PHONE = strokeSvg(
  `<path d="M8.5 3.5h3l1 4-2 1.5a12 12 0 0 0 5.5 5.5L18 12.5l4 1v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3.5 5.2 2 2 0 0 1 5.5 3.5Z"/>`,
  "#6B7280",
);
const USER = strokeSvg(`<circle cx="12" cy="8" r="3.5"/><path d="M5 19.5a7 7 0 0 1 14 0"/>`, "#ffffff");
const BELL = strokeSvg(
  `<path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>`,
  "#111111",
);
const CLIPBOARD = strokeSvg(
  `<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V4h6v1M9 11h6M9 15h4"/>`,
  "#ffffff",
);
const ARROW_DARK = strokeSvg(`<path d="M5 12h14M13 6l6 6-6 6"/>`, "#111111", 2);
const ARROW_LIGHT = strokeSvg(`<path d="M5 12h14M13 6l6 6-6 6"/>`, "#ffffff", 2);
const DOT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="#1D2025"/></svg>`;

export const ICONS = {
  clock: svgIcon(CLOCK),
  phone: svgIcon(PHONE),
  user: svgIcon(USER),
  bell: svgIcon(BELL),
  clipboard: svgIcon(CLIPBOARD),
  arrowDark: svgIcon(ARROW_DARK),
  arrowLight: svgIcon(ARROW_LIGHT),
  dot: svgIcon(DOT),
};

export const ICON_IMGS = {
  clock: iconImg(CLOCK, 14),
  phone: iconImg(PHONE, 14),
  user: iconImg(USER, 13),
};

export const GRID_BACKGROUND = dataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M32 0H0M0 0v32" stroke="#E8EEF4" stroke-width="1" fill="none"/></svg>`,
);

export function preferCustomIconType(options?: string[] | null): string | undefined {
  if (!options?.length) return undefined;
  if (options.includes("custom")) return "custom";
  if (options.includes("svg")) return "svg";
  if (options.includes("upload")) return "upload";
  return undefined;
}
