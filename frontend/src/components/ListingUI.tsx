import type { Listing, Range } from "../api/models";
import { UserRoundIcon, Clock3Icon, InfoIcon, PlusIcon } from "lucide-react";
import { formatDuration, numberWithSuffix } from "../lib/utils";
import { Pill } from "./generic/Pill";
import { memo } from "react";

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
    <span className="mt-1 inline-flex h-4 w-4 text-gs-3" aria-hidden="true">
      <Icon className="h-4 w-4" />
    </span>
  );
}

const ListingUI = memo(function ListingUI({
  listing: lg,
  isNew,
}: {
  listing: Listing;
  isNew?: boolean;
}) {
  const timeSincePost = lg.datePosted ? Date.now() - new Date(lg.datePosted).getTime() : null;

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
  const bonusFeatures = [
    lg.features?.dishwasher ? "Dishwasher" : null,
    lg.features?.washingMachine ? "Washing machine" : null,
    lg.features?.dryer ? "Dryer" : null,
    lg.features?.balcony ? "Balcony" : null,
    lg.features?.newProduction ? "New production" : null,
    lg.features?.hasViewing === true ? "Viewing" : null,
    lg.features?.hasPictures ? "Pictures" : null,
    lg.features?.hasFloorplan ? "Floorplan" : null,
  ].filter((value): value is string => value !== null);

  const hasExtraFeatures = missingCriticalFeatures.length > 0 || bonusFeatures.length > 0;

  const longestQueueTimeMs = lg.queuePosition?.oldestQueueDates
    ? Date.now() - new Date(lg.queuePosition.oldestQueueDates[0]).getTime()
    : null;

  const hasQueueInfo =
    (lg.queuePosition?.myPosition != null && lg.queuePosition?.total != null) ||
    longestQueueTimeMs !== null ||
    lg.queuePosition?.hasGoodChance === true;

  return (
    <div className="rounded-lg border border-gs-3/50 bg-gs-0/50 px-2 py-2 flex flex-col relative">
      {/* Row 1: header */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center sm:grid-rows-1">
        {/* title (street name) */}
        <span className="min-w-0 text-lg font-medium w-fit">
          <a
            href={lg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate underline decoration-1 hover:decoration-2 text-dark visited:text-primary/10"
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
          <span className="col-start-2 row-start-1 justify-self-end whitespace-nowrap text-sm text-gs-3 sm:col-start-3 sm:row-start-1">
            {formatDuration(timeSincePost)}
            {isNew && <span className="text-primary ml-1.5 font-medium">(new)</span>}
          </span>
        )}
      </div>

      {/* Row 2: details */}
      <div className="mt-2 mb-1.5 flex flex-col gap-y-2">
        {/* info */}
        <div className="flex items-start gap-1.5">
          <SectionIcon kind="info" />
          <div className="flex flex-wrap gap-1.5">
            <Pill>
              {rangeExists(lg.rentRange)
                ? `${formatRangeString(lg.rentRange)} kr/month`
                : `${lg.rent} kr/month`}
            </Pill>
            <Pill>
              {rangeExists(lg.areaSqmRange)
                ? `${formatRangeString(lg.areaSqmRange)} m²`
                : `${lg.areaSqm} m²`}
            </Pill>
            <Pill>
              {lg.numRooms} {lg.numRooms === 1 ? "room" : "rooms"}
            </Pill>
            {!singleApartment && <Pill>{lg.numApartments} apts</Pill>}
            {lg.floorRange?.min != null &&
            lg.floorRange?.max != null &&
            lg.floorRange.min !== lg.floorRange.max ? (
              <Pill>
                {numberWithSuffix(lg.floorRange.min)}-{numberWithSuffix(lg.floorRange.max)} floor
              </Pill>
            ) : (
              lg.floor != null && <Pill>{numberWithSuffix(lg.floor)} floor</Pill>
            )}
          </div>
        </div>

        {/* requirements */}
        {hasRequirements && (
          <div className="flex items-start gap-1.5">
            <SectionIcon kind="requirements" />
            <div className="flex flex-wrap gap-1.5">
              {lg.apartmentType !== "regular" && (
                <Pill type="highlight-yellow">Type: {lg.apartmentType}</Pill>
              )}
              {rangeExists(lg.requirements?.ageRange) && (
                <Pill type="highlight-yellow">
                  Age: {formatRangeString(lg.requirements.ageRange)} years old
                </Pill>
              )}
              {rangeExists(lg.requirements?.incomeRange) && (
                <Pill type="highlight-yellow">
                  Income: {formatRangeString(lg.requirements.incomeRange)} kr/year
                </Pill>
              )}
            </div>
          </div>
        )}

        {/* queue info */}
        {hasQueueInfo && (
          <div className="flex items-start gap-1.5">
            <SectionIcon kind="queue" />
            <div className="flex flex-wrap gap-1.5">
              {lg.queuePosition?.myPosition !== undefined &&
                lg.queuePosition?.myPosition !== null &&
                lg.queuePosition?.total !== undefined &&
                lg.queuePosition?.total !== null && (
                  <Pill>
                    Position: {lg.queuePosition.myPosition} / {lg.queuePosition.total}
                  </Pill>
                )}
              {longestQueueTimeMs !== null && (
                <Pill>Longest: {Math.floor(longestQueueTimeMs / (1000 * 3600 * 24))} days</Pill>
              )}
              {lg.queuePosition?.hasGoodChance === true && (
                <Pill type="highlight-green">Good chance</Pill>
              )}
            </div>
          </div>
        )}

        {/* extra features */}
        {hasExtraFeatures && (
          <div className="flex items-start gap-1.5">
            <SectionIcon kind="extras" />
            <div className="flex flex-wrap gap-1.5">
              {missingCriticalFeatures.map((feature) => (
                <Pill key={feature} type="highlight-red">
                  {feature}
                </Pill>
              ))}
              {bonusFeatures.map((feature) => (
                <Pill key={feature}>{feature}</Pill>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export { ListingUI };
