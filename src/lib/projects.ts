import { supabase } from '@/src/lib/supabase';
import type { ProjectDeliveryStatus, ProjectType, ProjectUnitStatus } from '@/src/lib/projectTypes';

export type ProjectStatus = 'pending_review' | 'published' | 'rejected' | 'archived';

// المشاريع — real published projects only. Mirrors the exact shape/
// conventions of src/lib/listings.ts's fetchPublishedListings: RLS
// already restricts this to status = 'published' rows (see
// supabase/migrations/20260929010000_projects.sql), so this is never a
// client-side filter pretending to be one — an unpublished project simply
// isn't in the result set no matter what this function does.

export type PublishedProjectCard = {
  id: string;
  title: string;
  projectType: ProjectType;
  deliveryStatus: ProjectDeliveryStatus;
  city: string;
  district: string | null;
  minPriceUsd: number | null;
  maxPriceUsd: number | null;
  totalUnits: number | null;
  coverPhotoUrl: string | null;
  developerName: string | null;
  createdAt: string;
};

type ProjectListRow = {
  id: string;
  title: string;
  project_type: ProjectType;
  delivery_status: ProjectDeliveryStatus;
  city: string;
  district: string | null;
  min_price_usd: number | null;
  max_price_usd: number | null;
  total_units: number | null;
  created_at: string;
  project_images: { storage_path: string; sort_order: number }[] | null;
  profiles: { full_name: string | null } | null;
};

export async function fetchPublishedProjects(): Promise<{ data: PublishedProjectCard[]; error: string | null }> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      `id, title, project_type, delivery_status, city, district, min_price_usd, max_price_usd, total_units, created_at,
       project_images ( storage_path, sort_order ),
       profiles ( full_name )`
    )
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<ProjectListRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };

  return {
    data: data.map((row) => {
      const images = (row.project_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
      const coverPhotoUrl = images[0] ? supabase.storage.from('project-photos').getPublicUrl(images[0].storage_path).data.publicUrl : null;
      return {
        id: row.id,
        title: row.title,
        projectType: row.project_type,
        deliveryStatus: row.delivery_status,
        city: row.city,
        district: row.district,
        minPriceUsd: row.min_price_usd,
        maxPriceUsd: row.max_price_usd,
        totalUnits: row.total_units,
        coverPhotoUrl,
        developerName: row.profiles?.full_name ?? null,
        createdAt: row.created_at,
      };
    }),
    error: null,
  };
}

// المشروع نفسه — /project/[id]. RLS already scopes this to
// status = 'published' (or the caller's own project, any status) — a bad
// or unpublished id for a stranger simply returns no row, which the
// screen renders as "not found", never a client-side status check.
export type ProjectDetail = {
  id: string;
  developerId: string;
  title: string;
  description: string;
  projectType: ProjectType;
  deliveryStatus: ProjectDeliveryStatus;
  status: ProjectStatus;
  city: string;
  district: string | null;
  address: string | null;
  governorateNameAr: string | null;
  governorateNameEn: string | null;
  lat: number;
  lng: number;
  minPriceUsd: number | null;
  maxPriceUsd: number | null;
  totalUnits: number | null;
  documentUrl: string | null;
  documentName: string | null;
  photoUrls: string[];
  developerName: string | null;
  developerIsVerified: boolean;
  createdAt: string;
};

type ProjectDetailRow = {
  id: string;
  developer_id: string;
  title: string;
  description: string;
  project_type: ProjectType;
  delivery_status: ProjectDeliveryStatus;
  status: ProjectStatus;
  city: string;
  district: string | null;
  address: string | null;
  lat: number;
  lng: number;
  min_price_usd: number | null;
  max_price_usd: number | null;
  total_units: number | null;
  document_storage_path: string | null;
  document_name: string | null;
  created_at: string;
  governorates: { name_ar: string; name_en: string } | null;
  project_images: { storage_path: string; sort_order: number }[] | null;
  profiles: { full_name: string | null; is_verified: boolean } | null;
};

export async function fetchProjectDetail(id: string): Promise<{ data: ProjectDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      `id, developer_id, title, description, project_type, delivery_status, status,
       city, district, address, lat, lng, min_price_usd, max_price_usd, total_units,
       document_storage_path, document_name, created_at,
       governorates ( name_ar, name_en ),
       project_images ( storage_path, sort_order ),
       profiles ( full_name, is_verified )`
    )
    .eq('id', id)
    .maybeSingle()
    .returns<ProjectDetailRow>();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  const images = (data.project_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const photoUrls = images.map((img) => supabase.storage.from('project-photos').getPublicUrl(img.storage_path).data.publicUrl);
  const documentUrl = data.document_storage_path
    ? supabase.storage.from('project-documents').getPublicUrl(data.document_storage_path).data.publicUrl
    : null;

  return {
    data: {
      id: data.id,
      developerId: data.developer_id,
      title: data.title,
      description: data.description,
      projectType: data.project_type,
      deliveryStatus: data.delivery_status,
      status: data.status,
      city: data.city,
      district: data.district,
      address: data.address,
      governorateNameAr: data.governorates?.name_ar ?? null,
      governorateNameEn: data.governorates?.name_en ?? null,
      lat: data.lat,
      lng: data.lng,
      minPriceUsd: data.min_price_usd,
      maxPriceUsd: data.max_price_usd,
      totalUnits: data.total_units,
      documentUrl,
      documentName: data.document_name,
      photoUrls,
      developerName: data.profiles?.full_name ?? null,
      developerIsVerified: data.profiles?.is_verified ?? false,
      createdAt: data.created_at,
    },
    error: null,
  };
}

// تسجيل اهتمام — a real lead-capture record, never a booking/chat. Upsert
// on the real unique(project_id, user_id) constraint
// (supabase/migrations/20260929020000_project_interest.sql): a first
// submission hits the real insert RLS policy and fires the developer
// notification trigger; re-registering hits the update policy instead and
// does not re-notify, matching "prevent accidental duplicate submissions".
export async function registerProjectInterest(
  projectId: string,
  userId: string,
  unitId?: string | null,
  note?: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('project_interest')
    .upsert(
      { project_id: projectId, user_id: userId, unit_id: unitId ?? null, note: note ?? null },
      { onConflict: 'project_id,user_id' }
    );
  return { error: error?.message ?? null };
}

export async function fetchProjectInterestStatus(projectId: string, userId: string): Promise<{ registered: boolean }> {
  const { data } = await supabase
    .from('project_interest')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  return { registered: !!data };
}

// الوحدات — real public.project_units rows only, scoped to one project.
// RLS already restricts this to units whose parent project is published
// (or the caller's own), same join-through-parent shape as
// project_images — a project a caller can't see returns zero unit rows
// no matter what this function asks for. Fetched once per project
// (capped, matching every other list query in this app) and filtered
// client-side (src/lib/projectTypes.ts's ProjectUnitStatus is the only
// real fixed enum here — unit_type is free text per the schema, so its
// filter options are derived from whatever real values this project's
// own units actually have, never a hardcoded list).
export type ProjectUnitCard = {
  id: string;
  unitType: string;
  unitReference: string | null;
  status: ProjectUnitStatus;
  priceUsd: number;
  areaSqm: number;
  bedrooms: number | null;
  livingRooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  photoUrl: string | null;
};

type ProjectUnitRow = {
  id: string;
  unit_type: string;
  unit_reference: string | null;
  status: ProjectUnitStatus;
  price_usd: number;
  area_sqm: number;
  bedrooms: number | null;
  living_rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  project_unit_images: { storage_path: string; sort_order: number }[] | null;
};

export async function fetchProjectUnits(projectId: string): Promise<{ data: ProjectUnitCard[]; error: string | null }> {
  const { data, error } = await supabase
    .from('project_units')
    .select(
      `id, unit_type, unit_reference, status, price_usd, area_sqm, bedrooms, living_rooms, bathrooms, floor,
       project_unit_images ( storage_path, sort_order )`
    )
    .eq('project_id', projectId)
    .order('price_usd', { ascending: true })
    .limit(100)
    .returns<ProjectUnitRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };

  return {
    data: data.map((row) => {
      const images = (row.project_unit_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
      const photoUrl = images[0] ? supabase.storage.from('project-photos').getPublicUrl(images[0].storage_path).data.publicUrl : null;
      return {
        id: row.id,
        unitType: row.unit_type,
        unitReference: row.unit_reference,
        status: row.status,
        priceUsd: row.price_usd,
        areaSqm: row.area_sqm,
        bedrooms: row.bedrooms,
        livingRooms: row.living_rooms,
        bathrooms: row.bathrooms,
        floor: row.floor,
        photoUrl,
      };
    }),
    error: null,
  };
}

// /project-unit/[id] — one real unit. No manual "does the caller own the
// parent project" check needed here: public.project_units' own SELECT
// RLS (supabase/migrations/20260929010000_projects.sql) already requires
// the parent project to be published (or the caller's own) before the
// unit row is visible at all — a unit on a pending/unpublished project
// simply isn't in the result set, same as fetchProjectDetail.
export type ProjectUnitDetail = {
  id: string;
  projectId: string;
  projectTitle: string;
  unitType: string;
  unitReference: string | null;
  status: ProjectUnitStatus;
  priceUsd: number;
  areaSqm: number;
  bedrooms: number | null;
  livingRooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  description: string | null;
  photoUrls: string[];
};

type ProjectUnitDetailRow = {
  id: string;
  project_id: string;
  unit_type: string;
  unit_reference: string | null;
  status: ProjectUnitStatus;
  price_usd: number;
  area_sqm: number;
  bedrooms: number | null;
  living_rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  description: string | null;
  project_unit_images: { storage_path: string; sort_order: number }[] | null;
  projects: { title: string } | null;
};

export async function fetchProjectUnitDetail(unitId: string): Promise<{ data: ProjectUnitDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from('project_units')
    .select(
      `id, project_id, unit_type, unit_reference, status, price_usd, area_sqm, bedrooms, living_rooms, bathrooms, floor, description,
       project_unit_images ( storage_path, sort_order ),
       projects ( title )`
    )
    .eq('id', unitId)
    .maybeSingle()
    .returns<ProjectUnitDetailRow>();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  const images = (data.project_unit_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const photoUrls = images.map((img) => supabase.storage.from('project-photos').getPublicUrl(img.storage_path).data.publicUrl);

  return {
    data: {
      id: data.id,
      projectId: data.project_id,
      projectTitle: data.projects?.title ?? '',
      unitType: data.unit_type,
      unitReference: data.unit_reference,
      status: data.status,
      priceUsd: data.price_usd,
      areaSqm: data.area_sqm,
      bedrooms: data.bedrooms,
      livingRooms: data.living_rooms,
      bathrooms: data.bathrooms,
      floor: data.floor,
      description: data.description,
      photoUrls,
    },
    error: null,
  };
}
