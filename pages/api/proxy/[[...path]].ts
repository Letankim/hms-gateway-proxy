import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "stream";

export const config = { api: { bodyParser: false } };

function setCorsHeaders(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

const HOP_BY_HOP = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
  "accept-encoding"
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const { path: pathParts = [] } = req.query;
  const queryParams = { ...req.query };
  delete (queryParams as any).path;

  // ✅ Fix: luôn convert về string & bỏ undefined/null
  const queryString = new URLSearchParams(
    Object.entries(queryParams).flatMap(([k, v]) =>
      Array.isArray(v)
        ? v.filter(x => x != null).map(x => [k, String(x)])
        : v != null
          ? [[k, String(v)]]
          : []
    ) as string[][]
  ).toString();

  const fullPath = Array.isArray(pathParts) ? pathParts.join("/") : (pathParts || "");
  const targetUrl =
    `https://originally-firewall-facial-childhood.trycloudflare.com/api/v1/${fullPath}` +
    (queryString ? `?${queryString}` : "");

  console.log("[Proxy] →", targetUrl);

  // ✅ Chỉ đọc body khi cần
  let requestBody: Buffer | undefined;
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method || "GET")) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    requestBody = Buffer.concat(chunks);
  }

  // ✅ Lọc header gửi đi
  const filteredHeaders: HeadersInit = Object.fromEntries(
    Object.entries(req.headers)
      .filter(([_, v]) => typeof v === "string")
      .filter(([k]) => !HOP_BY_HOP.includes(k.toLowerCase()))
  ) as HeadersInit;

  // ✅ Thêm timeout để tránh treo
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s

  try {
    const apiRes = await fetch(targetUrl, {
      method: req.method,
      headers: filteredHeaders,
      body: requestBody,
      redirect: "manual",          // ❗ Không follow để giữ Location custom scheme
      signal: controller.signal,
    });

    // ✅ Nhánh redirect: forward nguyên status + Location, đồng thời cancel body để giải phóng socket
    if (apiRes.status >= 300 && apiRes.status < 400) {
      const location = apiRes.headers.get("location");
      try { await apiRes.body?.cancel(); } catch {}
      if (location) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Location", location);
        return res.status(apiRes.status).end();   // ❗ Kết thúc response
      }
      // Không có Location -> trả nguyên mã 3xx
      return res.status(apiRes.status).end();
    }

    // ✅ Copy một số header phản hồi cần thiết (trừ hop-by-hop)
    apiRes.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.includes(key.toLowerCase())) {
        if (key.toLowerCase() === "content-encoding") return;   // tránh double-encoding
        if (key.toLowerCase() === "content-length") return;     // để Node tự set
        res.setHeader(key, value);
      }
    });

    res.status(apiRes.status);

    // ✅ Nếu có body, stream thẳng để tránh buffer lớn & đảm bảo đóng kết nối đúng cách
    if (apiRes.body) {
      const nodeReadable = Readable.fromWeb(apiRes.body as any);
      nodeReadable.on("error", (e) => {
        console.error("Stream error:", e);
        if (!res.headersSent) res.status(502);
        res.end();
      });
      nodeReadable.pipe(res);
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error("Proxy error:", err);
    // Nếu abort do timeout, trả 504 thay vì 500
    if (err?.name === "AbortError") {
      return res.status(504).json({ error: "Upstream timeout", detail: "Upstream did not respond in time" });
    }
    res.status(502).json({ error: "Proxy failed", detail: err?.message || "Unknown error" });
  } finally {
    clearTimeout(timeout);
  }
}
