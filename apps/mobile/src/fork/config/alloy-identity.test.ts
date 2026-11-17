import { afterEach, expect, it, vi } from "vite-plus/test";

import { ALLOY_APPLE_TEAM_ID } from "./alloy-identity.ts";

vi.mock("../../../../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () => ({ APP_VARIANT: process.env.APP_VARIANT }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadConfig(variant: string) {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", variant);
  vi.stubEnv("ALLOY_IDENTITY", "1");
  return (await import("../../../app.config.ts")).default;
}

it.each([
  ["development", "Alloy Dev", "com.masteryprotein.alloy.dev"],
  ["preview", "Alloy Preview", "com.masteryprotein.alloy.preview"],
  ["production", "Alloy", "com.masteryprotein.alloy"],
])("builds APP_VARIANT=%s as %s", async (variant, name, identifier) => {
  const config = await loadConfig(variant);
  expect(config.name).toBe(name);
  expect(config.ios?.bundleIdentifier).toBe(identifier);
  expect(config.android?.package).toBe(identifier);
  expect(config.ios?.appleTeamId).toBe(ALLOY_APPLE_TEAM_ID);
  expect(config.ios?.entitlements?.["keychain-access-groups"]).toEqual([
    `$(AppIdentifierPrefix)${identifier}`,
  ]);
});

it("detaches from T3's Expo project and link domains", async () => {
  const config = await loadConfig("production");
  expect(config.owner).toBeUndefined();
  expect(config.extra?.eas?.projectId).toBeUndefined();
  expect(config.updates).toEqual({ enabled: false });
  expect(config.ios?.associatedDomains).toBeUndefined();
  expect(config.android?.intentFilters).toBeUndefined();
  expect(JSON.stringify(config)).not.toContain("com.t3tools");
});
