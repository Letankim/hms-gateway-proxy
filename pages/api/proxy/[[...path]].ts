import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

function setCorsHeaders(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // Hoặc thay '*' bằng 'https://hms-client-psi.vercel.app' nếu muốn giới hạn
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCorsHeaders(res); // ✅ Thêm CORS ở mọi response

  if (req.method === "OPTIONS") {
    return res.status(200).end(); // ✅ Trả về 200 nếu là preflight
  }

  // 1. Lấy phần path còn lại sau /api/proxy/
  const { path: pathParts = [] } = req.query;

  // 2. Lấy query params
  const queryParams = { ...req.query };
  delete queryParams.path;

  const queryString = new URLSearchParams(
    Object.entries(queryParams).flatMap(([key, value]) =>
      Array.isArray(value) ? value.map(v => [key, v]) : [[key, value]]
    ) as string[][]
  ).toString();

  const fullPath = Array.isArray(pathParts) ? pathParts.join("/") : pathParts;

  // 3. Đọc IP từ file
  const ipFilePath = path.resolve(process.cwd(), "latest_ip.txt");
  let latestIP = "127.0.0.1";
  try {
    latestIP = fs.readFileSync(ipFilePath, "utf8").trim();
  } catch (err) {
    console.warn("⚠️ Không thể đọc latest_ip.txt:", err);
  }

  // 4. Gọi API backend
  const targetUrl = `http://${latestIP}:7066/api/v1/${fullPath}${queryString ? `?${queryString}` : ""}`;
  console.log("[Proxy] →", targetUrl);

  try {
    const apiRes = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      },
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
