export const JAPAN_STREAMING_PROVIDERS: Record<string, number> = {
  "Netflix": 8,
  "Amazon Prime Video": 9,
  "Disney+": 337,
  "Hulu": 230,
  "Apple TV+": 350,
  "U-NEXT": 97,
};

export const STREAMING_SERVICE_NAMES = Object.keys(JAPAN_STREAMING_PROVIDERS);

export const SERVICE_WEB_URLS: Record<string, (title: string) => string> = {
  "Netflix": (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  "Amazon Prime Video": (t) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(t)}&i=instant-video`,
  "U-NEXT": (t) => `https://video.unext.jp/search?query=${encodeURIComponent(t)}`,
  "Disney+": () => `https://www.disneyplus.com/search`,
  "Hulu": (t) => `https://www.hulu.jp/search?q=${encodeURIComponent(t)}`,
  "Apple TV+": (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
};

export const SERVICE_DEEP_LINKS: Record<string, (title: string) => string> = {
  "Netflix": (t) => `netflix://search?q=${encodeURIComponent(t)}`,
  "Amazon Prime Video": (t) => `aiv://search?q=${encodeURIComponent(t)}`,
  "U-NEXT": (t) => `unext://search?q=${encodeURIComponent(t)}`,
};
