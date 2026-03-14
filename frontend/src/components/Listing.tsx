import type { Listing, Range } from "../api/models";
import { UserRoundIcon, Clock3Icon, InfoIcon, PlusIcon } from "lucide-react";
import { formatDuration, cn } from "../lib/utils";

function rangeExists(range: Range | null | undefined): range is Partial<Range> {
  return range?.min !== undefined || range?.max !== undefined;
}

function formatRangeString(range: Range): string {
  // accepts incomplete ranges, e.g. { min: 5000 } or { max: 10000 }
  if (range?.min !== undefined && range?.max !== undefined) {
    return `${range.min}-${range.max}`;
  }
  if (range?.min !== undefined) {
    return `>${range.min}`;
  }
  if (range?.max !== undefined) {
    return `<${range.max}`;
  }
  return "";
}

function Pill({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: "highlight-yellow" | "highlight-green" | "highlight-red" | "default";
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-fit items-center rounded-md bg-gray-100 px-2 py-0.5 text-sm font-medium text-gray-600 border border-gray-300",
        style === "highlight-yellow" && "border border-yellow-600",
        style === "highlight-green" && "border border-green-600",
        style === "highlight-red" && "border border-red-600",
      )}
    >
      {children}
    </span>
  );
}

type SectionIconKind = "info" | "extras" | "requirements" | "queue";

function SectionIcon({ kind }: { kind: SectionIconKind }) {
  const iconByKind: Record<
    SectionIconKind,
    React.ComponentType<{ className?: string; strokeWidth?: number }>
  > = {
    info: InfoIcon,
    extras: PlusIcon,
    requirements: UserRoundIcon,
    queue: Clock3Icon,
  };
  const Icon = iconByKind[kind];

  return (
    <span className="mt-1 inline-flex h-4 w-4 text-muted" aria-hidden="true">
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function Listing({ listing: lg }: { listing: Listing }) {
  const timeSincePost = lg.datePosted
    ? Date.now() - new Date(lg.datePosted).getTime()
    : null;

  const singleApartment = (lg.numApartments ?? 1) === 1;

  const hasRequirements =
    lg.apartmentType !== "regular" ||
    rangeExists(lg.requirements?.ageRange) ||
    rangeExists(lg.requirements?.incomeRange);

  // Only show kitchen/bathroom when they are explicitly missing.
  const missingCriticalFeatures = [
    lg.features?.kitchen === false ? "No kitchen" : null,
    lg.features?.bathroom === false ? "No bathroom" : null,
  ].filter((value): value is string => value !== null);

  // Only show appliance extras when they are explicitly present.
  const availableApplianceFeatures = [
    lg.features?.dishwasher ? "Dishwasher" : null,
    lg.features?.washingMachine ? "Washing machine" : null,
    lg.features?.dryer ? "Dryer" : null,
  ].filter((value): value is string => value !== null);

  const hasExtraFeatures =
    missingCriticalFeatures.length > 0 || availableApplianceFeatures.length > 0;

  // mock
  lg.queuePosition = {
    myPosition: Math.floor(Math.random() * 100) + 1,
    total: 100,
    hasGoodChance: Math.random() < 0.5,
    oldestQueueDates: [new Date(Date.now() - 1000 * 60 * 60 * 24 * 1234.3)],
  };

  const longestQueueTimeMs = lg.queuePosition?.oldestQueueDates
    ? Date.now() - new Date(lg.queuePosition.oldestQueueDates[0]).getTime()
    : null;

  return (
    <div className="rounded-lg border-2 border-gray-300 bg-white p-2 flex flex-col relative">
      {/* Row 1: header */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center sm:grid-rows-1">
        {/* title (street name) */}
        <span className="min-w-0 text-lg font-medium">
          <a
            href={lg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate underline decoration-1"
          >
            {lg.name}
          </a>
        </span>
        {/* location */}
        <span className="col-span-2 row-start-2 min-w-0 truncate sm:col-span-1 sm:col-start-2 sm:row-start-1">
          {lg.locMunicipality} - {lg.locDistrict}
        </span>
        {/* recency */}
        {timeSincePost !== null && (
          <span className="col-start-2 row-start-1 justify-self-end whitespace-nowrap text-sm text-muted sm:col-start-3 sm:row-start-1">
            {formatDuration(timeSincePost)}
          </span>
        )}
      </div>

      {/* Row 2: details */}
      <div className="mt-2 flex flex-col gap-y-2">
        {/* info */}
        <div className="flex items-start gap-1.5">
          <SectionIcon kind="info" />
          <div className="flex flex-wrap gap-1.5">
            <Pill>
              {rangeExists(lg.rentRange)
                ? `${formatRangeString(lg.rentRange)} kr/mån`
                : `${lg.rent} kr/mån`}
            </Pill>
            <Pill>
              {rangeExists(lg.areaSqmRange)
                ? `${formatRangeString(lg.areaSqmRange)} m²`
                : `${lg.areaSqm} m²`}
            </Pill>
            <Pill>{lg.numRooms} rum</Pill>
            {!singleApartment && <Pill>{lg.numApartments} lgh</Pill>}
            {lg.floor !== null && lg.floor !== undefined && (
              <Pill>Floor: {lg.floor}</Pill>
            )}
          </div>
        </div>

        {/* requirements */}
        {hasRequirements && (
          <div className="flex items-start gap-1.5">
            <SectionIcon kind="requirements" />
            <div className="flex flex-wrap gap-1.5">
              {lg.apartmentType !== "regular" && (
                <Pill style="highlight-yellow">Type: {lg.apartmentType}</Pill>
              )}
              {rangeExists(lg.requirements?.ageRange) && (
                <Pill style="highlight-yellow">
                  Age: {formatRangeString(lg.requirements.ageRange)} years old
                </Pill>
              )}
              {rangeExists(lg.requirements?.incomeRange) && (
                <Pill style="highlight-yellow">
                  Income: {formatRangeString(lg.requirements.incomeRange)}{" "}
                  kr/year
                </Pill>
              )}
            </div>
          </div>
        )}

        {/* queue info */}
        <div className="flex items-start gap-1.5">
          <SectionIcon kind="queue" />
          <div className="flex flex-wrap gap-1.5">
            {lg.queuePosition?.myPosition != undefined &&
              lg.queuePosition?.total != undefined && (
                <Pill>
                  Position: {lg.queuePosition.myPosition} /{" "}
                  {lg.queuePosition.total}
                </Pill>
              )}
            {longestQueueTimeMs != undefined && (
              <Pill>
                Longest: {Math.floor(longestQueueTimeMs / (1000 * 3600 * 24))}{" "}
                days
              </Pill>
            )}
            {lg.queuePosition?.hasGoodChance && (
              <Pill style="highlight-green">Good chance</Pill>
            )}
          </div>
        </div>

        {/* extra features */}
        {hasExtraFeatures && (
          <div className="flex items-start gap-1.5">
            <SectionIcon kind="extras" />
            <div className="flex flex-wrap gap-1.5">
              {missingCriticalFeatures.map((feature) => (
                <Pill key={feature} style="highlight-red">
                  {feature}
                </Pill>
              ))}
              {availableApplianceFeatures.map((feature) => (
                <Pill key={feature} style="highlight-green">
                  {feature}
                </Pill>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
