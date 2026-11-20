import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    // Lead pages served under /resources by AuraLeads (PingAura).
    sitemap: "https://fheenv.com/resources/sitemap.xml",
  };
}
