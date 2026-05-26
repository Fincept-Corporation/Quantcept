class Quantcept < Formula
  desc "AI-powered finance terminal"
  homepage "https://github.com/Fincept-Corporation/Quantcept"
  url "https://registry.npmjs.org/quantcept/-/quantcept-0.1.0.tgz"
  sha256 "80f7691d330960f935863efd3f7089bc412f59c6"
  license "Apache-2.0"

  depends_on "node@18"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec/"bin/quantcept"
  end

  test do
    assert_match "Quantcept v#{version}", shell_output("#{bin}/quantcept --version")
  end
end
