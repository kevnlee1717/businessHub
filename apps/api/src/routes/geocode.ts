import { type FastifyInstance } from "fastify";

type OneMapSearchResult = {
  SEARCHVAL?: string;
  ADDRESS?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
};

type OneMapSearchResponse = {
  results?: OneMapSearchResult[];
};

export async function registerGeocodeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/geocode/search", async (request) => {
    const query = request.query as { q?: string };
    const searchVal = query.q?.trim();

    if (!searchVal) {
      return [];
    }

    try {
      const url = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
      url.searchParams.set("searchVal", searchVal);
      url.searchParams.set("returnGeom", "Y");
      url.searchParams.set("getAddrDetails", "Y");
      url.searchParams.set("pageNum", "1");

      const response = await fetch(url);
      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as OneMapSearchResponse;
      return (data.results ?? [])
        .map((row) => ({
          name: row.SEARCHVAL ?? "",
          address: row.ADDRESS ?? "",
          lat: Number(row.LATITUDE),
          lng: Number(row.LONGITUDE)
        }))
        .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
    } catch {
      return [];
    }
  });
}
