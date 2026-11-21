// The isolated fixed port makes a second contender fail to bind and back off instead of
// double-booting against the same database. A packaged install and a test-root dev run are
// both AWMate-branded, so they must not derive the same port: the dev run would otherwise
// fight the production managed service for 0x0c0c and die with EADDRINUSE.
export function isolatedServicePort(env: {
  AWMATE_DESKTOP_SERVICE_PORT?: string
  OPENCODE_DESKTOP_TEST_ROOT?: string
}) {
  if (env.AWMATE_DESKTOP_SERVICE_PORT) return env.AWMATE_DESKTOP_SERVICE_PORT
  return env.OPENCODE_DESKTOP_TEST_ROOT ? String(0x0c0d) : String(0x0c0c)
}
