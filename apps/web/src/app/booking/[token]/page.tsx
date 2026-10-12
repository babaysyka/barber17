import type { Metadata } from "next";
import { ManageVisit } from "@/components/book/ManageVisit";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Your visit — Orda",
  description: "Cancel or move a chair at Orda.",
};

export default async function BookingTokenPage({ params }: PageProps<"/booking/[token]">) {
  const { token } = await params;
  return (
    <>
      <Nav solid />
      <main id="main">
        <ManageVisit token={token} />
      </main>
    </>
  );
}
