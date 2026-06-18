import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://clout.kytepush.com', changeFrequency: 'daily', priority: 1 }];
}
