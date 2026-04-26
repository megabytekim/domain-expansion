import type { UnescoSiteProperties } from "@/lib/types";

interface SiteDetailProps {
  site: UnescoSiteProperties;
  isFullView: boolean;
}

export default function SiteDetail({ site, isFullView }: SiteDetailProps) {
  // Use hyecho image if available, fall back to UNESCO image
  const displayImage = site.hyechoPackages[0]?.imageUrl || site.imageUrl;

  return (
    <div className="space-y-4">
      {/* Hyecho packages — always visible, top priority */}
      {site.hyechoPackages.length > 0 && (
        <div className="space-y-2">
          {site.hyechoPackages.map((pkg) => (
            <a
              key={pkg.id}
              href={pkg.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-emerald-950 border border-emerald-700 rounded-lg hover:bg-emerald-900 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">혜초여행</span>
              </div>
              <p className="text-sm font-medium text-white">{pkg.title}</p>
              <div className="flex gap-3 mt-1 text-xs text-gray-400">
                <span>₩{pkg.price}</span>
                <span>{pkg.duration}</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Site name + meta — always visible */}
      <div>
        <h2 className="text-xl font-bold text-white">{site.name}</h2>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{site.country}</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor:
                site.category === "Cultural" ? "rgba(255,107,53,0.15)" :
                site.category === "Natural" ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.15)",
              color:
                site.category === "Cultural" ? "#ff6b35" :
                site.category === "Natural" ? "#22c55e" : "#3b82f6",
            }}
          >
            {site.category}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{site.year}</span>
          {site.endangered && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-950 text-red-400">Endangered</span>
          )}
        </div>
      </div>

      {/* Photo + UNESCO link — always visible */}
      {displayImage && (
        <img src={displayImage} alt={site.name} className="w-full h-36 object-cover rounded-lg" loading="lazy" />
      )}
      <a href={site.url} target="_blank" rel="noopener noreferrer"
        className="inline-block text-sm text-blue-400 hover:text-blue-300 underline">
        View on UNESCO.org
      </a>

      {/* Description + criteria — full view only */}
      {isFullView && (
        <>
          {site.description && (
            <p className="text-sm text-gray-300 leading-relaxed">{site.description}</p>
          )}
          {site.criteria && (
            <p className="text-xs text-gray-500">Criteria: {site.criteria}</p>
          )}
        </>
      )}
    </div>
  );
}
