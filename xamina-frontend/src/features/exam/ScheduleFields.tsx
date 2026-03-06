import { FormField } from "@/components/FormField";

export function ScheduleFields({
  startAt,
  endAt,
  startError,
  endError,
  scheduleError,
  startLocalPreview,
  endLocalPreview,
  startUtcPreview,
  endUtcPreview,
  onApplyNext30Minutes,
  onApplyNext60Minutes,
  onApplyTomorrowMorning,
  onStartChange,
  onEndChange,
}: {
  startAt: string;
  endAt: string;
  startError?: string | null;
  endError?: string | null;
  scheduleError?: string | null;
  startLocalPreview?: string;
  endLocalPreview?: string;
  startUtcPreview?: string;
  endUtcPreview?: string;
  onApplyNext30Minutes: () => void;
  onApplyNext60Minutes: () => void;
  onApplyTomorrowMorning: () => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  return (
    <>
      <div className="row gap-sm">
        <button className="btn btn-ghost" type="button" onClick={onApplyNext30Minutes}>
          +30m
        </button>
        <button className="btn btn-ghost" type="button" onClick={onApplyNext60Minutes}>
          +60m
        </button>
        <button className="btn btn-ghost" type="button" onClick={onApplyTomorrowMorning}>
          Besok 07:00
        </button>
      </div>
      <FormField label="Start At">
        <input
          className="input"
          type="datetime-local"
          value={startAt}
          onChange={(event) => onStartChange(event.target.value)}
          aria-label="Start at"
        />
        {startError ? <small className="state-text error">{startError}</small> : null}
      </FormField>
      <FormField label="End At">
        <input
          className="input"
          type="datetime-local"
          value={endAt}
          onChange={(event) => onEndChange(event.target.value)}
          aria-label="End at"
        />
        {endError ? <small className="state-text error">{endError}</small> : null}
      </FormField>
      <div className="card" style={{ boxShadow: "none" }}>
        <small className="state-text">Local Preview: {startLocalPreview ?? "-"} {" -> "} {endLocalPreview ?? "-"}</small>
        <small className="state-text">UTC Preview: {startUtcPreview ?? "-"} {" -> "} {endUtcPreview ?? "-"}</small>
        {scheduleError ? <p className="state-text error">{scheduleError}</p> : null}
      </div>
    </>
  );
}
