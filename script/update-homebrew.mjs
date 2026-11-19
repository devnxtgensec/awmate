// Updates the Homebrew tap formula for a release. Env: VERSION (e.g. 2.2.41), TAP_TOKEN (a GitHub
// token with push access to devnxtgensec/homebrew-tap). Reads the release's darwin/linux CLI
// checksums, generates Formula/awmate.rb and commits it to the tap.
// Run from the repository root with node script/update-homebrew.mjs.

const repo = "devnxtgensec/awmate"
const tapRepo = "devnxtgensec/homebrew-tap"
const version = process.env.VERSION
const token = process.env.TAP_TOKEN
if (!version || !token) throw new Error("VERSION and TAP_TOKEN are required")
const tag = version.startsWith("v") ? version : `v${version}`
const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "awmate-agent" }

const release = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers })
if (!release.ok) throw new Error(`Release ${tag} not found (${release.status})`)
const assets = (await release.json()).assets ?? []

async function sha256Of(assetName) {
  const asset = assets.find((item) => item.name === assetName)
  if (!asset) return undefined
  const sidecar = await fetch(asset.browser_download_url, { headers })
  if (!sidecar.ok) return undefined
  return (await sidecar.text()).split(/\s+/)[0].trim()
}

const darwinArm = await sha256Of(`awmate-cli-darwin-arm64.sha256`)
const darwinX64 = await sha256Of(`awmate-cli-darwin-x64.sha256`)
const linuxArm = await sha256Of(`awmate-cli-linux-arm64.sha256`)
const linuxX64 = await sha256Of(`awmate-cli-linux-x64.sha256`)
if (!darwinArm || !darwinX64) throw new Error(`Release ${tag} has no darwin CLI checksums; it cannot be tapped.`)

const download = (asset) => `https://github.com/${repo}/releases/download/${tag}/${asset}`

const formula = `class Awmate < Formula
  desc "AWMate (Assistive Workmate) - the coding agent CLI"
  homepage "https://awmate.nxtgensec.org"
  version "${version}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "${download("awmate-cli-darwin-arm64")}"
      sha256 "${darwinArm}"
    else
      url "${download("awmate-cli-darwin-x64")}"
      sha256 "${darwinX64}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "${download("awmate-cli-linux-arm64")}"
      sha256 "${linuxArm ?? darwinArm}"
    else
      url "${download("awmate-cli-linux-x64")}"
      sha256 "${linuxX64 ?? darwinX64}"
    end
  end

  def install
    bin.install "awmate-cli-darwin-arm64" => "awmate" if OS.mac? && Hardware::CPU.arm?
    bin.install "awmate-cli-darwin-x64" => "awmate" if OS.mac? && Hardware::CPU.intel?
    bin.install "awmate-cli-linux-arm64" => "awmate" if OS.linux? && Hardware::CPU.arm?
    bin.install "awmate-cli-linux-x64" => "awmate" if OS.linux? && Hardware::CPU.intel?
  end

  def caveats
    <<~EOS
      Run 'awmate' once to sign in and start your daily free usage.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/awmate --version")
  end
end
`

const content = formula
const existing = await fetch(`https://api.github.com/repos/${tapRepo}/contents/Formula/awmate.rb`, { headers })
let sha
if (existing.ok) sha = (await existing.json()).sha

const put = await fetch(`https://api.github.com/repos/${tapRepo}/contents/Formula/awmate.rb`, {
  method: "PUT",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({
    message: `awmate ${tag}`,
    content: Buffer.from(content, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
  }),
})
if (!put.ok) throw new Error(`Formula update failed (${put.status}): ${await put.text()}`)
console.log(`Formula/awmate.rb updated for ${tag} in ${tapRepo}`)
