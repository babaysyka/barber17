export type ServiceView = {
  id: string;
  index: string;
  name: string;
  description: string;
  meta: string;
  image: string;
};

export type BarberView = {
  id: string;
  name: string;
  focus: string;
  years: string;
  image: string;
};

const serviceImages: Record<string, string> = {
  cut: "/images/svc-cut.jpg",
  fade: "/images/svc-fade.jpg",
  beard: "/images/svc-beard.jpg",
  shave: "/images/svc-shave.jpg",
  full: "/images/svc-full.jpg",
};

const fallbackServiceImage = "/images/svc-cut.jpg";
const fallbackBarberImage = "/images/barber-1.jpg";

type ApiService = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  sortOrder: number;
};

type ApiBarber = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  experienceYears: number;
  sortOrder: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isService(value: unknown): value is ApiService {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.durationMin === "number" &&
    typeof value.price === "number" &&
    typeof value.sortOrder === "number"
  );
}

function isBarber(value: unknown): value is ApiBarber {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (typeof value.photoUrl === "string" || value.photoUrl === null) &&
    (typeof value.bio === "string" || value.bio === null) &&
    typeof value.experienceYears === "number" &&
    typeof value.sortOrder === "number"
  );
}

function formatPrice(price: number) {
  return `${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} UZS`;
}

function toService(service: ApiService): ServiceView {
  return {
    id: service.id,
    index: String(service.sortOrder).padStart(2, "0"),
    name: service.name,
    description: service.description,
    meta: `${service.durationMin} min · ${formatPrice(service.price)}`,
    image: serviceImages[service.id] ?? fallbackServiceImage,
  };
}

function toBarber(barber: ApiBarber): BarberView {
  return {
    id: barber.id,
    name: barber.name,
    focus: barber.bio ?? "",
    years: `${barber.experienceYears} years`,
    image: barber.photoUrl ?? fallbackBarberImage,
  };
}

export async function loadCatalog(): Promise<{ services: ServiceView[] | null; barbers: BarberView[] | null }> {
  const base = process.env.API_URL ?? "http://localhost:4000";
  try {
    const [servicesRes, barbersRes] = await Promise.all([
      fetch(`${base}/api/v1/services`, { cache: "no-store" }),
      fetch(`${base}/api/v1/barbers`, { cache: "no-store" }),
    ]);
    if (!servicesRes.ok || !barbersRes.ok) return { services: null, barbers: null };
    const servicesJson: unknown = await servicesRes.json();
    const barbersJson: unknown = await barbersRes.json();
    if (!Array.isArray(servicesJson) || !servicesJson.every(isService)) return { services: null, barbers: null };
    if (!Array.isArray(barbersJson) || !barbersJson.every(isBarber)) return { services: null, barbers: null };
    return {
      services: servicesJson.map(toService),
      barbers: barbersJson.map(toBarber),
    };
  } catch {
    return { services: null, barbers: null };
  }
}
