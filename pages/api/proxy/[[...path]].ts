import type { NextApiRequest, NextApiResponse } from "next";

function setCorsHeaders(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  const { path: pathParts = [] } = req.query;

  const queryParams = { ...req.query };
  delete queryParams.path;

  const queryString = new URLSearchParams(
    Object.entries(queryParams).flatMap(([key, value]) =>
      Array.isArray(value) ? value.map(v => [key, v]) : [[key, value]]
    ) as string[][]
  ).toString();

  const fullPath = Array.isArray(pathParts) ? pathParts.join("/") : pathParts;


  let latestIP = "127.0.0.1";
  try {
    const ipRes = await fetch("https://3docorp.id.vn/ip_handler.php", {
      method: "GET",
    });
    const ipData = await ipRes.json();
    if (ipData?.ip) {
      latestIP = ipData.ip;
    } else {
      console.warn("⚠️ Không nhận được IP hợp lệ từ ip_handler.php");
    }
  } catch (err) {
    console.warn("⚠️ Không thể gọi ip_handler.php:", err);
  }

  const targetUrl = `http://${latestIP}:7066/api/v1/${fullPath}${queryString ? `?${queryString}` : ""}`;
  console.log("[Proxy] →", targetUrl);
const filteredHeaders = Object.fromEntries(
  Object.entries(req.headers).filter(
    ([, value]) => typeof value === "string"
  )
);
  try {
    const apiRes = await fetch(targetUrl, {
      method: req.method,
      headers: filteredHeaders as HeadersInit,
      body:
        req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS"
          ? undefined
          : JSON.stringify(req.body),
    });

    const contentType = apiRes.headers.get("content-type");

    res.status(apiRes.status);

    if (contentType?.includes("application/json")) {
      const data = await apiRes.json();
      res.json(data);
    } else {
      const text = await apiRes.text();
      res.send(text);
    }
  } catch (err: any) {
    res.status(500).json({
      error: "Proxy failed",
      detail: err.message || "Unknown error",
    });
  }
}
