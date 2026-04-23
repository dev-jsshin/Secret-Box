import { apiFetch } from './client';

export type CategorySlug =
  | 'social'
  | 'work'
  | 'finance'
  | 'shopping'
  | 'media'
  | 'dev'
  | 'gaming'
  | 'other';

export interface ServiceCatalogItem {
  slug: string;
  name: string;
  nameEn?: string;
  category: CategorySlug;
  brandColor?: string;
  iconUrl?: string;
  defaultUrl?: string;
  aliases: string[];
}

export interface CatalogListResponse {
  services: ServiceCatalogItem[];
}

export const catalogApi = {
  list: (category?: CategorySlug) =>
    apiFetch<CatalogListResponse>(
      `/catalog/services${category ? `?category=${category}` : ''}`,
    ),
};

export const CATEGORY_LABELS: Record<CategorySlug, string> = {
  social:   '소셜',
  work:     '업무',
  finance:  '금융',
  shopping: '쇼핑',
  media:    '미디어',
  dev:      '개발',
  gaming:   '게임',
  other:    '기타',
};
