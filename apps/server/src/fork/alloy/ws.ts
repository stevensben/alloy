import { ALLOY_WS_METHODS, type AlloyCommand, AlloyError } from "@t3tools/contracts/alloy";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as AlloyService from "./AlloyService.ts";
import type { AlloyStoreError } from "./AlloyStore.ts";

const toRpcError = <A, R>(effect: Effect.Effect<A, AlloyError | AlloyStoreError, R>) =>
  effect.pipe(
    Effect.catchTags({
      AlloyStoreError: (error) =>
        Effect.logError("Alloy storage failed", { cause: error.cause }).pipe(
          Effect.andThen(Effect.fail(new AlloyError({ message: error.message }))),
        ),
    }),
  );

const unavailable = Effect.fail(
  new AlloyError({ message: "Alloy is not running on this server." }),
);

/** Optional so upstream's WebSocket test harnesses, which never build Alloy, still type and run. */
export const makeAlloyWsHandlers = Effect.gen(function* () {
  const alloy = yield* Effect.serviceOption(AlloyService.AlloyService);
  return {
    [ALLOY_WS_METHODS.alloySnapshot]: () =>
      Option.match(alloy, {
        onNone: () => unavailable,
        onSome: (service) => toRpcError(service.snapshot),
      }),
    [ALLOY_WS_METHODS.alloyCommand]: (command: AlloyCommand) =>
      Option.match(alloy, {
        onNone: () => unavailable,
        onSome: (service) => toRpcError(service.command(command)),
      }),
  };
});
