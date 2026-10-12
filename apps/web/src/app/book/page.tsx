import type { Metadata } from "next";
import { BookFlow } from "@/components/book/BookFlow";
import { CatalogNote } from "@/components/CatalogNote";
import { Nav } from "@/components/Nav";
import { loadCatalog } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Book a chair — Orda",
  description: "Reserve a chair at Orda on Shota Rustaveli, Tashkent.",
};

export default async function BookPage() {
  const catalog = await loadCatalog();

  return (
    <>
      <Nav solid />
      <main id="main">
        {catalog.services && catalog.barbers ? (
          <BookFlow services={catalog.services} barbers={catalog.barbers} />
        ) : (
          <CatalogNote page>The booking list did not load.</CatalogNote>
        )}
      </main>
    </>
  );
}
