import { expect, test } from "bun:test"
import { isolatedServicePort } from "./service-port"

test("the isolated service port keeps the packaged install and a test-root dev run apart", () => {
  expect(isolatedServicePort({})).toBe(String(0x0c0c))
  expect(isolatedServicePort({ OPENCODE_DESKTOP_TEST_ROOT: "C:\\tmp\\awmate-local-ui" })).toBe(String(0x0c0d))
  expect(isolatedServicePort({ OPENCODE_DESKTOP_TEST_ROOT: "x", AWMATE_DESKTOP_SERVICE_PORT: "4055" })).toBe("4055")
  expect(isolatedServicePort({ AWMATE_DESKTOP_SERVICE_PORT: "4055" })).toBe("4055")
})
