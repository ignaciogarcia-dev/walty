"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "@phosphor-icons/react";

export function FinalCTA() {
    return (
        <section className="px-4 py-10 relative overflow-hidden">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#052e1b] via-[#22c55e]/20 to-[#6ee7b7]/10 dark:from-[#052e1b]/50 dark:via-[#22c55e]/10 dark:to-[#6ee7b7]/5" />

            <div className="container mx-auto max-w-2xl relative z-10">
                <div className="rounded-2xl border border-border bg-card backdrop-blur-md p-8 sm:p-12 text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        Ready to get started?
                    </h2>
                    <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                        Create your account and start using crypto payments in minutes.
                    </p>
                    <Link href="/onboarding">
                        <Button
                            size="lg"
                            className="bg-[#22c55e] hover:bg-[#22c55e]/90 text-white rounded-xl"
                        >
                            Get Started
                            <ArrowRight className="size-5" />
                        </Button>
                    </Link>
                </div>
            </div>
        </section>
    );
}
