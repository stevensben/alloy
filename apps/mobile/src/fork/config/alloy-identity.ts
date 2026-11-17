import type { ExpoConfig } from "expo/config";

// Mastery Beverage Inc. Free Personal Teams cannot sign the widget, share
// extension, App Group or push entitlements, so Alloy builds under this team.
export const ALLOY_APPLE_TEAM_ID = "8BPBB42ZJH";

type VariantName = "development" | "preview" | "production";

const ALLOY_VARIANTS = {
  development: { appName: "Alloy Dev", identifier: "com.masteryprotein.alloy.dev" },
  preview: { appName: "Alloy Preview", identifier: "com.masteryprotein.alloy.preview" },
  production: { appName: "Alloy", identifier: "com.masteryprotein.alloy" },
} as const satisfies Record<VariantName, { appName: string; identifier: string }>;

// Read at call time: app.config.ts merges .env files into process.env after imports run.
// Upstream's app.config tests pin T3's identifiers, so Vitest keeps them unless a test opts in.
function alloyIdentityEnabled(): boolean {
  return (process.env.ALLOY_IDENTITY ?? (process.env.VITEST ? "0" : "1")) === "1";
}

interface AlloyIcons {
  readonly appIcon: string;
  readonly iosIcon: string;
  readonly splashIcon: string;
  readonly androidAdaptiveForeground: string;
  readonly androidAdaptiveBackgroundColor: string;
  readonly androidAdaptiveBackgroundImage: string | undefined;
  readonly androidSplashIcon: string;
  readonly androidMonochromeIcon: string;
}

// Built by fork/assets/build-icons.sh. Paths are relative to apps/mobile, like upstream's.
const ALLOY_ICONS: AlloyIcons = {
  appIcon: "../../fork/assets/alloy-1024.png",
  iosIcon: "../../fork/assets/alloy-1024.png",
  splashIcon: "../../fork/assets/alloy-1024.png",
  androidAdaptiveForeground: "../../fork/assets/android-foreground.png",
  androidAdaptiveBackgroundColor: "#000000",
  androidAdaptiveBackgroundImage: undefined,
  androidSplashIcon: "../../fork/assets/android-splash.png",
  androidMonochromeIcon: "../../fork/assets/android-monochrome.png",
};

// The fields of upstream's VARIANT_CONFIG that app.config.ts reads. A new upstream
// field fails typecheck here, which fork/sync.sh runs after every merge.
interface Variant {
  readonly appName: string;
  readonly scheme: string;
  readonly iosBundleIdentifier: string;
  readonly androidPackage: string;
  readonly relyingParty: string;
  readonly assets: AlloyIcons & {
    readonly androidNotificationIcon: string;
    readonly androidNotificationColor: string;
  };
}

/** Swaps T3's name, identifiers and icons for Alloy's so both apps install side by side. */
export function withAlloyVariant(variant: Variant, name: VariantName): Variant {
  if (!alloyIdentityEnabled()) return variant;
  const alloy = ALLOY_VARIANTS[name];
  return {
    ...variant,
    appName: alloy.appName,
    iosBundleIdentifier: alloy.identifier,
    androidPackage: alloy.identifier,
    assets: { ...variant.assets, ...ALLOY_ICONS },
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
