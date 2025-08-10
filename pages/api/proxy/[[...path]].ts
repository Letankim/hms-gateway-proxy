import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: { bodyParser: false },
};

function setCorsHeaders(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const { path: pathParts = [] } = req.query;
  const queryParams = { ...req.query };
  delete (queryParams as any).path;

  const queryString = new URLSearchParams(
  Object.entries(queryParams)
    .flatMap(([k, v]) =>
      Array.isArray(v)
        ? v.filter(x => x != null).map(x => [k, String(x)])
        : v != null
          ? [[k, String(v)]]
          : []
    ) as string[][]
).toString();


  const fullPath = Array.isArray(pathParts) ? pathParts.join("/") : pathParts;

  const targetUrl =
    `https://originally-firewall-facial-childhood.trycloudflare.com/api/v1/${fullPath}` +
    (queryString ? `?${queryString}` : "");

  console.log("[Proxy] →", targetUrl);

  // Đọc body một lần (vì req là stream)
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const requestBody = Buffer.concat(chunks);

  try {
    // Lọc bớt hop-by-hop headers & header không phải string
    const filteredHeaders: HeadersInit = Object.fromEntries(
      Object.entries(req.headers)
        .filter(([_, v]) => typeof v === "string")
        .filter(([k]) => ![
          "host", "connection", "content-length", "accept-encoding", "transfer-encoding", "keep-alive"
        ].includes(k.toLowerCase()))
    ) as HeadersInit;

    const apiRes = await fetch(targetUrl, {
      method: req.method,
      headers: filteredHeaders,
      body: (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS")
        ? undefined
        : requestBody,
      // ⭐ Quan trọng: KHÔNG follow redirect để giữ được Location hms3do://
      redirect: "manual",
    });

    // Nếu backend trả 3xx + Location, forward y nguyên cho client/app
    if (apiRes.status >= 300 && apiRes.status < 400) {
      const location = apiRes.headers.get("location");
      if (location) {
        // Cách 1: dùng writeHead để chắc chắn không bị Next/Vercel “giúp đỡ”
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Location", location);
        // Giữ nguyên status code từ backend (302/303/307…)
        res.status(apiRes.status).end();
        return;
        // Hoặc Cách 2 (đơn giản): res.redirect(location) – đôi khi bị chặn với non-http trên vài môi trường
      }
    }

    // Các response khác (200/4xx/5xx)
    const contentType = apiRes.headers.get("content-type") || "application/octet-stream";
    res.status(apiRes.status);
    res.setHeader("Content-Type", contentType);

    if (contentType.includes("application/json")) {
      const data = await apiRes.text(); // dùng text để tránh lỗi JSON invalid
      try {
        res.json(JSON.parse(data));
      } catch {
        // Trường hợp backend trả JSON nhưng không valid → trả thẳng text
        res.send(data);
      }
    } else {
      const buf = Buffer.from(await apiRes.arrayBuffer());
      res.send(buf);
    }
  } catch (err: any) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Proxy failed", detail: err?.message || "Unknown error" });
  }
}
