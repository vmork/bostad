import type { Listing } from "../api/models";
import { type KeyData } from "./filterSort";

type FilterGroups = "info" | "queuePosition" | "requirements" | "features";
type ListingsKeyData = KeyData<Listing> & { group: FilterGroups };

// Human-readable names for each filter group
export const groupNames: Record<FilterGroups, string> = {
  info: "Basic Info",
  queuePosition: "Queue Position",
  requirements: "Requirements",
  features: "Features",
};

export const allKeyData: Record<string, ListingsKeyData> = {
  // --- Basic info
  rent: { name: "Rent", unit: "kr", key: "rent", filterType: "range", group: "info" },
  apartmentType: {
    name: "Apartment type",
    key: "apartmentType",
    filterType: "set",
    group: "info",
  },
  areaSqm: { name: "Area", unit: "m²", key: "areaSqm", filterType: "range", group: "info" },
  numRooms: { name: "Rooms", key: "numRooms", filterType: "range", group: "info" },
  floor: { name: "Floor", key: "floor", filterType: "range", group: "info" },
  numApartments: {
    name: "Number of apts",
    key: "numApartments",
    filterType: "range",
    group: "info",
  },
  postAgeDays: {
    name: "Post age",
    unit: "days",
    key: (ls) => {
      if (!ls.datePosted) return null;
      return Math.floor((Date.now() - new Date(ls.datePosted).getTime()) / (1000 * 60 * 60 * 24));
    },
    // Sort by actual ms age for sub-day precision
    sortKey: (ls) => {
      if (!ls.datePosted) return null;
      return Date.now() - new Date(ls.datePosted).getTime();
    },
    filterType: "range",
    filterOptions: { boundType: "upper", allowNull: true },
    group: "info",
  },

  // --- Queue position
  queuePosition: {
    name: "Queue position",
    key: (ls) => ls.queuePosition?.myPosition ?? null,
    filterType: "range",
    group: "queuePosition",
  },
  totalApplicants: {
    name: "Total applicants",
    key: (ls) => ls.queuePosition?.total ?? null,
    filterType: "range",
    group: "queuePosition",
  },
  longestQueueTimeDays: {
    name: "Longest queue time",
    unit: "days",
    key: (ls) => {
      const oldestDate = ls.queuePosition?.oldestQueueDates?.[0] ?? null;
      return oldestDate
        ? Math.floor((Date.now() - new Date(oldestDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;
    },
    filterType: "range",
    group: "queuePosition",
  },

  // --- Requirements
  incomeMin: {
    name: "Min income limit",
    unit: "kr",
    key: (ls) => ls.requirements?.incomeRange?.min ?? null,
    filterType: "range",
    filterOptions: { allowNull: true, boundType: "upper" }, // allowNull=true since missing (likely) implies no limit, and absMin=null since only upper bound needed
    group: "requirements",
  },
  incomeMax: {
    name: "Max income limit",
    unit: "kr",
    key: (ls) => ls.requirements?.incomeRange?.max ?? null,
    filterType: "range",
    filterOptions: { allowNull: true, boundType: "lower" }, // allowNull=true since missing (likely) implies no limit, and absMax=null since only lower bound needed
    group: "requirements",
  },
  ageMin: {
    name: "Min age limit",
    key: (ls) => ls.requirements?.ageRange?.min ?? null,
    filterType: "range",
    filterOptions: { allowNull: true, boundType: "upper" },
    group: "requirements",
  },
  ageMax: {
    name: "Max age limit",
    key: (ls) => ls.requirements?.ageRange?.max ?? null,
    filterType: "range",
    filterOptions: { allowNull: true, boundType: "lower" },
    group: "requirements",
  },

  // --- Features
  balcony: {
    name: "Balcony",
    key: (ls) => ls.features?.balcony ?? null,
    filterType: "boolean",
    group: "features",
  },
  elevator: {
    name: "Elevator",
    key: (ls) => ls.features?.elevator ?? null,
    filterType: "boolean",
    group: "features",
  },
  newProduction: {
    name: "New production",
    key: (ls) => ls.features?.newProduction ?? null,
    filterType: "boolean",
    group: "features",
  },
  kitchen: {
    name: "Kitchen",
    key: (ls) => ls.features?.kitchen ?? null,
    filterType: "boolean",
    group: "features",
  },
  bathroom: {
    name: "Bathroom",
    key: (ls) => ls.features?.bathroom ?? null,
    filterType: "boolean",
    group: "features",
  },
  dishwasher: {
    name: "Dishwasher",
    key: (ls) => ls.features?.dishwasher ?? null,
    filterType: "boolean",
    group: "features",
  },
  washingMachine: {
    name: "Washing machine",
    key: (ls) => ls.features?.washingMachine ?? null,
    filterType: "boolean",
    group: "features",
  },
  dryer: {
    name: "Dryer",
    key: (ls) => ls.features?.dryer ?? null,
    filterType: "boolean",
    group: "features",
  },
} as const;
