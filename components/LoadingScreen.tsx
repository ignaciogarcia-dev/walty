"use client";

import { useEffect, useState } from "react";

export function LoadingScreen() {
    const [isVisible, setIsVisible] = useState(true);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        // Start fade-out animation after 2.5 seconds
        const fadeTimer = setTimeout(() => {
            setIsAnimating(true);
        }, 500);

        // Hide completely after 3 seconds
        const hideTimer = setTimeout(() => {
            setIsVisible(false);
        }, 1500);

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(hideTimer);
        };
    }, []);

    if (!isVisible) return null;

    return (
        <div
            className={`fixed inset-0 z-[9999] bg-[#22c55e] flex items-center justify-center ${isAnimating ? "opacity-0 transition-opacity duration-500 ease-out" : "opacity-100"
                }`}
        >
            <h1 className="text-white text-4xl font-bold">WALTY</h1>
        </div>
    );
}
