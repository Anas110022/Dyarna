import { supabase } from '@/src/lib/supabase';
import type { ListingCategory } from '@/src/lib/listingTypes';
import type { ListingPreview } from '@/src/lib/listings';

export async function isFavorited(userId: string, listingId: string): Promise<boolean> {
  const { data } = await supabase.from('favorites').select('id').eq('user_id', userId).eq('listing_id', listingId).maybeSingle();
  return !!data;
}

export async function addFavorite(userId: string, listingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('favorites').insert({ user_id: userId, listing_id: listingId });
  return { error: error?.message ?? null };
}

export async function removeFavorite(userId: string, listingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('listing_id', listingId);
  return { error: error?.message ?? null };
}

type FavoriteRow = {
  listings: {
    id: string;
    title: string;
    category: ListingCategory;
    city: string;
    area: string | null;
    price_usd: number;
    bedrooms: number | null;
    bathrooms: number | null;
    area_sqm: number;
    listing_photos: { storage_path: string; sort_order: number }[] | null;
  } | null;
};

// Real, currently-published favorited listings only — if an owner
// unpublishes/archives something a user favorited earlier, it's honestly
// left out here rather than shown as if it were still a live listing.
export async function fetchFavoriteListings(userId: string): Promise<{ data: ListingPreview[]; error: string | null }> {
  const { data, error } = await supabase
    .from('favorites')
    .select(
      `listings!inner ( id, title, category, city, area, price_usd, bedrooms, bathrooms, area_sqm, listing_photos ( storage_path, sort_order ) )`
    )
    .eq('user_id', userId)
    .eq('listings.status', 'published')
    .order('created_at', { ascending: false })
    .returns<FavoriteRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };

  const items: ListingPreview[] = data
    .filter((row): row is FavoriteRow & { listings: NonNullable<FavoriteRow['listings']> } => row.listings != null)
    .map((row) => {
      const listing = row.listings;
      const cover = (listing.listing_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0];
      const photoUrl = cover ? supabase.storage.from('listing-photos').getPublicUrl(cover.storage_path).data.publicUrl : null;
      return {
        id: listing.id,
        title: listing.title,
        category: listing.category,
        city: listing.city,
        area: listing.area,
        priceUsd: listing.price_usd,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        areaSqm: listing.area_sqm,
        photoUrl,
      };
    });

  return { data: items, error: null };
}
