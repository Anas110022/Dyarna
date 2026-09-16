// Real domain taxonomy for المشاريع (Projects) — matches the
// `projects.project_type`/`projects.delivery_status`/`project_units.status`
// check constraints exactly (see supabase/migrations/20260929010000_projects.sql).
// Same convention as src/lib/listingTypes.ts: a single canonical list every
// screen reads from, never a locally duplicated copy.

export type ProjectType =
  | 'apartment_building'
  | 'villa_project'
  | 'townhouse'
  | 'multi_floor'
  | 'residential_complex'
  | 'commercial'
  | 'land'
  | 'mixed_use';

export const PROJECT_TYPE_LABEL_KEY: Record<ProjectType, string> = {
  apartment_building: 'projects.typeApartmentBuilding',
  villa_project: 'projects.typeVillaProject',
  townhouse: 'projects.typeTownhouse',
  multi_floor: 'projects.typeMultiFloor',
  residential_complex: 'projects.typeResidentialComplex',
  commercial: 'projects.typeCommercial',
  land: 'projects.typeLand',
  mixed_use: 'projects.typeMixedUse',
};

export const ALL_PROJECT_TYPES: ProjectType[] = [
  'apartment_building',
  'villa_project',
  'townhouse',
  'multi_floor',
  'residential_complex',
  'commercial',
  'land',
  'mixed_use',
];

export type ProjectDeliveryStatus = 'available' | 'coming_soon' | 'under_construction' | 'ready' | 'completed' | 'unavailable';

export const DELIVERY_STATUS_LABEL_KEY: Record<ProjectDeliveryStatus, string> = {
  available: 'projects.deliveryAvailable',
  coming_soon: 'projects.deliveryComingSoon',
  under_construction: 'projects.deliveryUnderConstruction',
  ready: 'projects.deliveryReady',
  completed: 'projects.deliveryCompleted',
  unavailable: 'projects.deliveryUnavailable',
};

export const ALL_DELIVERY_STATUSES: ProjectDeliveryStatus[] = [
  'available',
  'coming_soon',
  'under_construction',
  'ready',
  'completed',
  'unavailable',
];

export type ProjectUnitStatus = 'available' | 'reserved' | 'sold';

export const UNIT_STATUS_LABEL_KEY: Record<ProjectUnitStatus, string> = {
  available: 'projects.unitStatusAvailable',
  reserved: 'projects.unitStatusReserved',
  sold: 'projects.unitStatusSold',
};
