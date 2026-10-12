import { Barbers } from "@/components/Barbers";
import { Booking } from "@/components/Booking";
import { Hero } from "@/components/Hero";
import { Nav } from "@/components/Nav";
import { Proof } from "@/components/Proof";
import { Services } from "@/components/Services";
import { Signature } from "@/components/Signature";
import { SiteFooter } from "@/components/SiteFooter";
import { Space } from "@/components/Space";
import { Statement } from "@/components/Statement";
import { Tashkent } from "@/components/Tashkent";
import { loadCatalog } from "@/lib/catalog";

export default async function HomePage() {
  const catalog = await loadCatalog();

  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <Statement />
        <Services services={catalog.services} />
        <Barbers barbers={catalog.barbers} />
        <Tashkent />
        <Space />
        <Signature />
        <Proof />
        <Booking />
      </main>
      <SiteFooter />
    </>
  );
}
