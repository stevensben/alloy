import type { ExpoConfig } from "expo/config";

// Mastery Beverage Inc. Free Personal Teams cannot sign the widget, share
// extension, App Group or push entitlements, so Alloy builds under this team.
export const ALLOY_APPLE_TEAM_ID = "8BPBB42ZJH";

type Variant = "development" | "preview" | "production";

const ALLOY_VARIANTS = {
  development: { appName: "Alloy Dev", identifier: "com.masteryprotein.alloy.dev" },
  preview: { appName: "Alloy Preview", identifier: "com.masteryprotein.alloy.preview" },
  production: { appName: "Alloy", identifier: "com.masteryprotein.alloy" },
} as const satisfies Record<Variant, { appName: string; identifier: string }>;

// Read at call time: app.config.ts merges .env files into process.env after imports run.
// Upstream's app.config tests pin T3's identifiers, so Vitest keeps them unless a test opts in.
function alloyIdentityEnabled(): boolean {
  return (process.env.ALLOY_IDENTITY ?? (process.env.VITEST ? "0" : "1")) === "1";
}

interface UpstreamVariant {
  readonly appName: string;
  readonly iosBundleIdentifier: string;
  readonly androidPackage: string;
}

/** Swaps T3's app name and identifiers for Alloy's so both apps install side by side. */
export function withAlloyVariant<T extends UpstreamVariant>(
  variant: T,
  name: Variant,
): Omit<T, keyof UpstreamVariant> & UpstreamVariant {
  if (!alloyIdentityEnabled()) return variant;
  const alloy = ALLOY_VARIANTS[name];
  return {
    ...variant,
    appName: alloy.appName,
    iosBundleIdentifier: alloy.identifier,
    androidPackage: alloy.identifier,
  };
}

/**
 * Detaches the build from T3's accounts: signs with Alloy's team, drops the
 * t3.codes link domains (their site files only list T3's apps), and stops
 * pulling over-the-air updates or EAS builds from T3's Expo project.
 */
export function withAlloyConfig(config: ExpoConfig): ExpoConfig {
  if (!alloyIdentityEnabled()) return config;
  const { owner: _owner, ios, android, extra, ...rest } = config;
  const { associatedDomains: _domains, ...alloyIos } = ios ?? {};
  const { intentFilters: _filters, ...alloyAndroid } = android ?? {};
  const { projectId: _projectId, ...eas } = (extra?.eas ?? {}) as Record<string, unknown>;
  return {
    ...rest,
    updates: { enabled: false },
    ios: { ...alloyIos, appleTeamId: ALLOY_APPLE_TEAM_ID },
    android: alloyAndroid,
    extra: { ...extra, eas },
  };
}
