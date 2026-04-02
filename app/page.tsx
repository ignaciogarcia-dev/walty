import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Personas } from "@/components/landing/Personas";
import { Banner } from "@/components/landing/Banner";

export default function LandingPage() {
	return (
		<div className="bg-background min-h-screen">
			<Header />
			<main className="flex flex-col">
				<Hero />
				<div className="hidden md:block">
					<Banner />
				</div>
				<Personas />
			</main>
			<Footer />
		</div>
	);
}
