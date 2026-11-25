import type { MetadataRoute } from 'next';
import { site } from '@/config/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${site.url}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${site.url}/termos/`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${site.url}/privacidade/`, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
