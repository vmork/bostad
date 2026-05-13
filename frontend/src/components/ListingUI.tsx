import type { Listing, Range } from "../api/models";
import { CalendarDaysIcon, UserRoundIcon, InfoIcon, ListOrderedIcon, PlusIcon } from "lucide-react";
import {
  formatAllocationMethodLabel,
  formatDuration,
  formatFurnishingLabel,
  formatLeaseEndLabel,
  formatLeaseStartLabel,
  formatShortDate,
  formatTenureTypeLabel,
  numberWithSuffix,
} from "../lib/utils";
import { Pill } from "./generic/Pill";
import { memo } from "react";
import { ListingLocationPreview } from "./ListingLocationPreview";

function rangeExists(range: Range | null | undefined): range is Partial<Range> {
  return range?.min != undefined || range?.max != undefined;
}

function formatRangeString(range: Range): string {
  // accepts incomplete ranges, e.g. { min: 5000 } or { max: 10000 }
  if (range?.min != undefined && range?.max != undefined) {
    return `${range.min}-${range.max}`;
  }
  if (range?.min != undefined) {
    return `>${range.min}`;
  }
  if (range?.max != undefined) {
    return `<${range.max}`;
  }
  return "";
}

type SectionIconKind = "info" | "timing" | "extras" | "requirements" | "queue";

function SectionIcon({ kind }: { kind: SectionIconKind }) {
  const iconByKind: Record<
    SectionIconKind,
    React.ComponentType<{ className?: string; strokeWidth?: number }>
  > = {
    info: InfoIcon,
    timing: CalendarDaysIcon,
    extras: PlusIcon,
    requirements: UserRoundIcon,
    queue: ListOrderedIcon,
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
  sourceName,
}: {
  listing: Listing;
  isNew?: boolean;
  sourceName: string;
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

  const infoExtras = [formatTenureTypeLabel(lg.tenureType), formatFurnishingLabel(lg.furnishing)].filter(
    (value): value is string => value != null && value.trim().length > 0,
  );

  // Only show appliance extras when they are explicitly present.
  const bonusFeatures = [
    lg.features?.dishwasher ? "Dishwasher" : null,
    lg.features?.washingMachine ? "Washing machine" : null,
    lg.features?.dryer ? "Dryer" : null,
    lg.features?.balcony ? "Balcony" : null,
    lg.features?.newProduction ? "New production" : null,
    lg.features?.hasViewing === true ? "Viewing" : null,
    lg.features?.hasPictures ? `Pictures (${lg.features.numPictures ?? 0})` : null,
    lg.features?.hasFloorplan ? "Floorplan" : null,
  ].filter((value): value is string => value != null && value.trim().length > 0);

  const hasExtraFeatures = missingCriticalFeatures.length > 0 || bonusFeatures.length > 0;

  const hasTimingInfo =
    lg.leaseStartDate != null || lg.leaseEndDate != null || lg.applicationDeadlineDate != null;

  const longestQueueTimeMs = lg.allocationInfo?.oldestQueueDates
    ? Date.now() - new Date(lg.allocationInfo.oldestQueueDates[0]).getTime()
    : null;

  const hasQueueInfo =
    lg.allocationInfo?.allocationMethod != null ||
    (lg.allocationInfo?.myPosition != null && lg.allocationInfo?.total != null) ||
    longestQueueTimeMs !== null ||
    lg.allocationInfo?.hasGoodChance === true;

  return (
    <div className="rounded-lg border border-gs-3/50 bg-gs-0/50 px-2 py-2 flex flex-col relative">
      {/* Row 1: header */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 md:items-center md:grid-rows-1">
        {/* title (street name) */}
        <div className="min-w-0 flex flex-col gap-0.5 md:flex-row md:flex-wrap md:items-center md:gap-2">
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
          <span className="text-xs text-gs-3 md:self-auto">({sourceName})</span>
        </div>
        {/* location */}
        <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">
          <ListingLocationPreview listing={lg} />
        </div>
        {/* recency */}
        {timeSincePost !== null && (
          <span className="col-start-2 row-start-1 justify-self-end whitespace-nowrap text-sm text-gs-3 md:col-start-3 md:row-start-1">
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
            {infoExtras.map((label) => (
              <Pill key={label}>{label}</Pill>
            ))}
          </div>
        </div>

        {/* timing */}
        {hasTimingInfo && (
          <div className="flex items-start gap-1.5">
            <SectionIcon kind="timing" />
            <div className="flex flex-wrap gap-1.5">
              {lg.leaseStartDate != null && (
                <Pill>Start: {formatLeaseStartLabel(lg.leaseStartDate)}</Pill>
              )}
              {lg.leaseEndDate != null && <Pill>End: {formatLeaseEndLabel(lg.leaseEndDate)}</Pill>}
              {lg.applicationDeadlineDate != null && (
                <Pill>Deadline: {formatShortDate(lg.applicationDeadlineDate)}</Pill>
              )}
            </div>
          </div>
        )}

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
              {lg.allocationInfo?.allocationMethod != null && (
                <Pill>
                  Method: {formatAllocationMethodLabel(lg.allocationInfo.allocationMethod)}
                </Pill>
              )}
              {lg.allocationInfo?.myPosition !== undefined &&
                lg.allocationInfo?.myPosition !== null &&
                lg.allocationInfo?.total !== undefined &&
                lg.allocationInfo?.total !== null && (
                  <Pill>
                    Position: {lg.allocationInfo.myPosition} / {lg.allocationInfo.total}
                  </Pill>
                )}
              {longestQueueTimeMs !== null && (
                <Pill>Longest: {Math.floor(longestQueueTimeMs / (1000 * 3600 * 24))} days</Pill>
              )}
              {lg.allocationInfo?.hasGoodChance === true && (
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
