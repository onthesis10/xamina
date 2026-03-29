import { useAuthStore } from "@/store/auth.store";
import { CORE_TOUR_SEQUENCE, useUiStore, type CoreTourPage } from "@/store/ui.store";

interface CorePageTourProps {
  page: CoreTourPage;
  title: string;
  description: string;
  bullets: string[];
}

export function CorePageTour({ page, title, description, bullets }: CorePageTourProps) {
  const user = useAuthStore((state) => state.user);
  const coreTourStatus = useUiStore((state) => state.coreTourStatus);
  const coreTourStep = useUiStore((state) => state.coreTourStep);
  const advanceCoreTour = useUiStore((state) => state.advanceCoreTour);
  const dismissCoreTour = useUiStore((state) => state.dismissCoreTour);

  if (!user || user.role === "siswa") return null;
  if (coreTourStatus !== "active") return null;
  if (CORE_TOUR_SEQUENCE[coreTourStep] !== page) return null;

  const isLastStep = coreTourStep === CORE_TOUR_SEQUENCE.length - 1;

  return (
    <section className="card onboarding-tour" data-tour={page}>
      <div className="row onboarding-tour-head">
        <div>
          <p className="state-text">First-run Tour</p>
          <h3 className="section-title">{title}</h3>
        </div>
        <span className="pill p-neu">
          Step {coreTourStep + 1}/{CORE_TOUR_SEQUENCE.length}
        </span>
      </div>
      <p>{description}</p>
      <ul className="tour-list">
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <div className="row gap-sm">
        <button className="btn" onClick={advanceCoreTour}>
          {isLastStep ? "Selesai Tour" : "Lanjut"}
        </button>
        <button className="btn btn-ghost" onClick={dismissCoreTour}>
          Lewati Tour
        </button>
      </div>
    </section>
  );
}
