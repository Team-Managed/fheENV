"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { detectPlatform, type Platform } from "@/components/landing/platform";

export default function LandingPage() {
  const [platform, setPlatform] = useState<Platform>("mac");

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return (
    <main className="min-h-screen font-sans">
      <Navbar />
      <HeroSection platform={platform} />
      <FeaturesSection />
      <HowItWorksSection platform={platform} onPlatformChange={setPlatform} />
      <FAQSection />
    </main>
  );
}
