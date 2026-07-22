export type Platform = "mac" | "linux" | "windows";

export const INSTALL_COMMANDS: Record<Platform, string> = {
  mac: "curl -fsSL https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.sh | bash",
  linux: "curl -fsSL https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.sh | bash",
  windows: "irm https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.ps1 | iex",
};

export function detectPlatform(): Platform {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  return "mac";
}
