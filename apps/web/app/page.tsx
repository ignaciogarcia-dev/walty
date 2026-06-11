import { FAQ } from "@/components/landing/FAQ";
import { Features } from "@/components/landing/Features";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Personas } from "@/components/landing/Personas";
import { Security } from "@/components/landing/Security";

export default function LandingPage() {
	return (
		<div className="min-h-screen overflow-x-clip bg-landing-bg">
			<Header />
			{/* Reserva el alto del navbar fixed para que el contenido no quede debajo */}
			<div className="h-16 shrink-0" aria-hidden />
			<main className="landing-sections min-w-0">
				<Hero />
				<HowItWorks />
				<Features />
				<Personas />
				<Security />
				<FinalCTA />
				<FAQ />
			</main>
			<Footer />
		</div>
	);
}
