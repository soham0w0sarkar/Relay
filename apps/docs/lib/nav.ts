export type NavItem = {
  href: string;
  label: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const NAV: NavSection[] = [
  {
    title: "Start",
    items: [
      { href: "/", label: "Overview" },
      { href: "/getting-started", label: "Getting started" },
    ],
  },
  {
    title: "Understand",
    items: [
      { href: "/architecture", label: "Architecture" },
      { href: "/concepts/presence", label: "Presence & leave" },
    ],
  },
  {
    title: "Packages",
    items: [
      { href: "/packages", label: "Package map" },
      { href: "/packages/client", label: "@weavo/client" },
      { href: "/packages/membership", label: "@weavo/membership" },
      { href: "/packages/core", label: "@weavo/core" },
      { href: "/packages/sync", label: "@weavo/sync" },
      { href: "/packages/transport", label: "@weavo/transport" },
    ],
  },
];
