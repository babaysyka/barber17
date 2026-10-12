import { BarberDesk } from "@/components/admin/BarberDesk";

export default async function AdminBarberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BarberDesk id={id} />;
}
