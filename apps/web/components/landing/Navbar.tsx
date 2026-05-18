"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GithubLogo } from "@phosphor-icons/react";
import { useTranslation } from "@/hooks/useTranslation";

export function Navbar() {
    const { t } = useTranslation();
    return (
        <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-card/80 border-b border-border pointer-events-auto">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link href="/" className="text-xl font-bold text-foreground hover:opacity-80 transition-opacity">
                        WALTY
                    </Link>

                    {/* Navigation Links */}
                    <div className="hidden md:flex items-center gap-6">
                        <a
                            href="#features"
                            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {t("landing-features")}
                        </a>
                        <a
                            href="https://github.com/ignaciogarcia-dev/walty/tree/main/docs"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {t("landing-docs")}
                        </a>
                        <a
                            href="https://github.com/ignaciogarcia-dev/walty"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                        >
                            <GithubLogo className="size-4" />
                            {t("landing-github")}
                        </a>
                    </div>

                    {/* CTA Button */}
                    <Button
                        asChild
                        size="default"
                        className="relative z-50 bg-[#22c55e] hover:bg-[#22c55e]/90 text-white rounded-xl"
                    >
                        <Link href="/onboarding">{t("landing-get-started")}</Link>
                    </Button>
                </div>
            </div>
        </nav>
    );
}
